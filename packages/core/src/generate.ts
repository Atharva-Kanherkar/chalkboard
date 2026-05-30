// The top-level orchestrator: turn a prompt into an mp4.
//
//   prompt
//     -> llm.generateScript()     SceneScript JSON
//     -> tts.synthesize() per scene  → on-disk audio files
//     -> renderer.renderScript()  → silent webm + scene timings
//     -> renderer.muxFinal()      → final mp4
//
// Each step is wrapped with progress events so CLI/HTTP can surface state.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { GenerateOptions, ProgressEvent, SceneScript } from '@chalkboard/shared';
import { resolveLLMProvider } from '@chalkboard/llm';
import { resolveTTSProvider } from '@chalkboard/narration';
import { renderScript, muxFinal, probeAudioDuration } from '@chalkboard/renderer';
import { repairScript } from '@chalkboard/whiteboard';
import { generateSceneImages } from './images.js';
import { selfCorrectScript } from './self-correct.js';

export interface GenerateResult {
  outputPath: string;
  script: SceneScript;
  /** Working dir used; undefined if it was cleaned up. */
  workDir: string | undefined;
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const onProgress = opts.onProgress ?? noop;
  const language = opts.language ?? 'en';
  const format = opts.format ?? 'explainer';
  // Shorts default to vertical unless the caller pinned an aspect ratio.
  const aspectRatio = opts.aspectRatio ?? (format === 'short' ? '9:16' : '16:9');

  const llm = resolveLLMProvider(opts.llm);
  const tts = resolveTTSProvider(opts.tts);

  // -------- 1. script ----------
  emit(onProgress, { phase: 'script', message: `generating script via ${llm.name}` });
  const raw = await llm.generateScript({ prompt: opts.prompt, language, aspectRatio, format });
  emit(onProgress, {
    phase: 'script',
    message: `script ready (${raw.scenes.length} scenes)`,
  });

  // -------- 1b. deterministic layout repair ----------
  // Clamp overflowing elements, de-dupe stacked text, separate overlaps — so
  // every provider's output is corrected, not just well-prompted ones.
  const { script: repaired, report } = repairScript(raw);
  let script = repaired;
  const fixes = report.clamped + report.scaled + report.dedupedText + report.movedOverlaps;
  if (fixes > 0) {
    emit(onProgress, {
      phase: 'script',
      message: `layout repaired (clamp ${report.clamped}, scale ${report.scaled}, dedupe ${report.dedupedText}, overlap ${report.movedOverlaps})`,
    });
  }

  // -------- 2. work dir ----------
  const workDir = opts.workDir
    ? resolve(opts.workDir)
    : await mkdtemp(join(tmpdir(), 'chalkboard-'));

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
      const out = await tts.synthesize({
        text: scene.narration,
        language: script.meta.language,
        ...(opts.voice
          ? { voice: opts.voice }
          : script.meta.voice
            ? { voice: script.meta.voice }
            : {}),
      });
      const path = join(workDir, `scene-${i}.${out.format}`);
      await writeFile(path, out.bytes);
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
      onProgress: (msg) => emit(onProgress, { phase: 'render', message: msg }),
    });

    // -------- 5. mux ----------
    emit(onProgress, { phase: 'mux', message: 'muxing audio' });
    const outputPath = resolve(opts.outputPath);
    await muxFinal({
      silentVideoPath: rendered.silentVideoPath,
      audioTracks: audioPaths.map((path, i) => ({ path, durationMs: audioDurations[i]! })),
      timings: rendered.timings,
      outputPath,
      workDir,
      ...(opts.music === false
        ? {}
        : {
            music: {
              enabled: true,
              ...(opts.musicTrack ? { path: opts.musicTrack } : {}),
            },
          }),
      onProgress: (msg) => emit(onProgress, { phase: 'mux', message: msg }),
    });

    emit(onProgress, { phase: 'done', outputPath });

    return {
      outputPath,
      script,
      workDir: opts.keepWorkDir ? workDir : undefined,
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
