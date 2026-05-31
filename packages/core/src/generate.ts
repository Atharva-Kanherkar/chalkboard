// The top-level orchestrator: turn a prompt into an mp4.
//
//   prompt
//     -> llm.generateScript()     SceneScript JSON
//     -> tts.synthesize() per scene  → on-disk audio files
//     -> renderer.renderScript()  → silent webm + scene timings
//     -> renderer.muxFinal()      → final mp4
//
// Each step is wrapped with progress events so CLI/HTTP can surface state.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type {
  Scene,
  SceneScriptMeta,
  GenerateOptions,
  ProgressEvent,
  SceneScript,
} from '@chalkboard/shared';
import { resolveLLMProvider, groundScriptInBrief, type ScriptBrief } from '@chalkboard/llm';
import { resolveTTSProvider } from '@chalkboard/narration';
import { resolveResearchProvider } from '@chalkboard/research';
import {
  renderScript,
  muxFinal,
  probeAudioDuration,
  resolveMusic,
  type MusicResolution,
} from '@chalkboard/renderer';
import { repairScript } from '@chalkboard/whiteboard';
import { generateSceneImages } from './images.js';
import { selfCorrectScript } from './self-correct.js';

export interface GenerateResult {
  outputPath: string;
  script: SceneScript;
  /** Working dir used; undefined if it was cleaned up. */
  workDir: string | undefined;
  /** Which background track was used (mood, source, attribution). */
  music?: { mood: string; source: string; attribution?: string };
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const onProgress = opts.onProgress ?? noop;
  const language = opts.language ?? 'en';
  const format = opts.format ?? 'explainer';
  // Shorts default to vertical unless the caller pinned an aspect ratio.
  const aspectRatio = opts.aspectRatio ?? (format === 'short' ? '9:16' : '16:9');

  const llm = resolveLLMProvider(opts.llm);
  const tts = resolveTTSProvider(opts.tts);

  // -------- 0. research (cinematic only) ----------
  // For cinematic, research the topic into a grounded brief first; the script
  // is written from it and cited back to real sources.
  let brief: ScriptBrief | undefined;
  if (format === 'cinematic') {
    emit(onProgress, { phase: 'script', message: 'researching topic' });
    const research = resolveResearchProvider(opts.research ? { kind: opts.research } : undefined);
    const cited = await research.research({
      topic: opts.prompt,
      ...(opts.researchDepth ? { depth: opts.researchDepth } : {}),
      language,
      onProgress: (m) => emit(onProgress, { phase: 'script', message: `[research] ${m}` }),
    });
    brief = {
      summary: cited.summary,
      findings: cited.findings.map((f) => ({ text: f.text, cites: f.cites })),
      sources: cited.sources.map((s) => ({
        id: s.id,
        url: s.url,
        ...(s.title ? { title: s.title } : {}),
      })),
    };
  }

  // -------- 1. script ----------
  emit(onProgress, { phase: 'script', message: `generating script via ${llm.name}` });
  const raw = await llm.generateScript({
    prompt: opts.prompt,
    language,
    aspectRatio,
    format,
    ...(brief ? { brief } : {}),
  });
  emit(onProgress, {
    phase: 'script',
    message: `script ready (${raw.scenes.length} scenes)`,
  });

  // -------- 1b. deterministic layout repair ----------
  // Clamp overflowing elements, de-dupe stacked text, separate overlaps — so
  // every provider's output is corrected, not just well-prompted ones. Skipped
  // for cinematic, whose full-frame images intentionally fill the canvas.
  let script: SceneScript;
  if (format === 'cinematic') {
    // Ground the cited script in the brief's authoritative sources.
    script = brief ? groundScriptInBrief(raw, brief) : raw;
  } else {
    const { script: repaired, report } = repairScript(raw);
    script = repaired;
    const fixes = report.clamped + report.scaled + report.dedupedText + report.movedOverlaps;
    if (fixes > 0) {
      emit(onProgress, {
        phase: 'script',
        message: `layout repaired (clamp ${report.clamped}, scale ${report.scaled}, dedupe ${report.dedupedText}, overlap ${report.movedOverlaps})`,
      });
    }
  }

  // -------- 2. work dir ----------
  // mkdtemp creates the dir; a caller-supplied --work-dir might not exist yet,
  // so ensure it before any step writes into it (narration, images, render).
  const workDir = opts.workDir
    ? resolve(opts.workDir)
    : await mkdtemp(join(tmpdir(), 'chalkboard-'));
  await mkdir(workDir, { recursive: true });

  try {
    // -------- 2b. vision self-correction (opt-in) ----------
    // Settle layout on placeholders first, so images are generated once at
    // their final sizes and the vision model never has to echo back image data.
    if (opts.selfCorrect) {
      const iterations = typeof opts.selfCorrect === 'number' ? opts.selfCorrect : 1;
      const corrected = await selfCorrectScript(script, {
        workDir,
        iterations,
        onProgress: (msg) =>
          emit(onProgress, { phase: 'render', message: `[self-correct] ${msg}` }),
      });
      script = corrected.script;
      if (corrected.fixedScenes > 0) {
        emit(onProgress, {
          phase: 'render',
          message: `[self-correct] fixed ${corrected.fixedScenes} scene(s) over ${corrected.passes} pass(es)`,
        });
      }
    }

    // -------- 2c. image generation ----------
    // Resolve any `image` element prompts into real imagery before render.
    if (opts.images !== false) {
      const img = await generateSceneImages(script, {
        workDir,
        ...(opts.imageModel ? { model: opts.imageModel } : {}),
        ...(opts.imageQuality ? { quality: opts.imageQuality } : {}),
        onProgress: (msg) => emit(onProgress, { phase: 'render', message: `[image] ${msg}` }),
      });
      if (img.generated > 0) {
        emit(onProgress, {
          phase: 'render',
          message: `[image] generated ${img.generated} image(s) — ~$${img.estCostUsd.toFixed(4)} (est.)`,
        });
      }
    }

    // -------- 3. narration per scene ----------
    const audioPaths: string[] = [];
    const audioDurations: number[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]!;
      emit(onProgress, {
        phase: 'narration',
        sceneIndex: i,
        sceneCount: script.scenes.length,
      });

      // Bring-your-own-VO: if the caller supplied an audio file for this scene,
      // use it verbatim and skip TTS (creator uses their own voice).
      const byo = opts.narrationAudio?.[i];
      let path: string;
      if (byo) {
        const ext = extname(byo).slice(1) || 'mp3';
        path = join(workDir, `scene-${i}.${ext}`);
        await writeFile(path, await readFile(byo));
      } else {
        const voice = resolveSceneVoice(scene, script.meta, opts.voice);
        const out = await tts.synthesize({
          text: scene.narration,
          language: script.meta.language,
          ...(voice ? { voice } : {}),
          ...(scene.delivery ? { delivery: scene.delivery } : {}),
        });
        path = join(workDir, `scene-${i}.${out.format}`);
        await writeFile(path, out.bytes);
      }
      audioPaths.push(path);
      audioDurations.push(await probeAudioDuration(path));
    }

    // -------- 4. render silent video ----------
    emit(onProgress, { phase: 'render', message: 'rendering silent video' });
    const rendered = await renderScript({
      script,
      audioInfo: audioDurations.map((durationMs) => ({ durationMs })),
      workDir,
      subtitles: opts.subtitles !== false,
      ...(opts.renderConcurrency ? { concurrency: opts.renderConcurrency } : {}),
      onProgress: (msg) => emit(onProgress, { phase: 'render', message: msg }),
    });

    // -------- 5. resolve background music (mood-matched) ----------
    let music: MusicResolution | undefined;
    if (opts.music !== false) {
      music = await resolveMusic({
        enabled: true,
        mood: opts.musicMood ?? script.meta.mood,
        customPath: opts.musicTrack,
        source: opts.musicSource,
        jamendoClientId: opts.jamendoClientId,
        workDir,
        onProgress: (msg) => emit(onProgress, { phase: 'mux', message: msg }),
      });
    }

    // -------- 6. mux ----------
    emit(onProgress, { phase: 'mux', message: 'muxing audio' });
    const outputPath = resolve(opts.outputPath);
    await muxFinal({
      silentVideoPath: rendered.silentVideoPath,
      audioTracks: audioPaths.map((path, i) => ({ path, durationMs: audioDurations[i]! })),
      timings: rendered.timings,
      outputPath,
      workDir,
      ...(music?.path ? { music: { enabled: true, path: music.path } } : {}),
      onProgress: (msg) => emit(onProgress, { phase: 'mux', message: msg }),
    });

    emit(onProgress, { phase: 'done', outputPath });

    return {
      outputPath,
      script,
      workDir: opts.keepWorkDir ? workDir : undefined,
      ...(music && music.source !== 'none'
        ? {
            music: {
              mood: music.mood,
              source: music.source,
              ...(music.attribution ? { attribution: music.attribution } : {}),
            },
          }
        : {}),
    };
  } finally {
    if (!opts.keepWorkDir && !opts.workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function emit(fn: (e: ProgressEvent) => void, event: ProgressEvent) {
  try {
    fn(event);
  } catch {
    // user hook errors must not break the pipeline
  }
}

function noop(): void {
  /* no-op */
}

// Role words a script uses symbolically; never pass these to a TTS as a voice id.
const VOICE_ROLE_WORDS = new Set(['narrator', 'quote', 'host', 'vo', 'speaker']);

/**
 * Resolve the concrete voice for a scene:
 *  1. the scene's delivery role mapped via meta.voices (e.g. narrator → id),
 *  2. an explicit caller override,
 *  3. meta.voice,
 *  4. the role string itself if it looks like a real voice id (not a role word),
 *  5. otherwise the provider default.
 */
function resolveSceneVoice(
  scene: Scene,
  meta: SceneScriptMeta,
  override?: string,
): string | undefined {
  const role = scene.delivery?.voice;
  const mapped = role && meta.voices ? meta.voices[role] : undefined;
  if (mapped) return mapped;
  if (override) return override;
  if (meta.voice) return meta.voice;
  if (role && !VOICE_ROLE_WORDS.has(role.toLowerCase())) return role;
  return undefined;
}
