// Drive a headless Chromium through the SceneScript, recording the canvas as
// a silent video. Audio is muxed post-hoc by mux.ts.
//
// Why this shape:
// - Playwright's built-in `recordVideo` is reliable but yields webm with no
//   precise timing control; we instead trigger explicit start/stop signals
//   from the page (READY / DONE log lines) and rely on Playwright's video
//   length matching real-time playback.
// - A single scene plays in real time, but scenes are independent (each starts
//   from a cleared board — no cross-scene transitions), so we render them in
//   parallel browser contexts and concatenate. Wall-clock ≈ the longest scene
//   rather than the sum, without the fidelity risk of a frame-by-frame rewrite
//   (benchmarked at ~32 ms/screenshot — no faster than real time at 30 fps).
// - Each recording captures a ~1 s blank lead-in (page load + READY) before its
//   scene plays; we trim each clip to its exact scene timing so the concatenated
//   video lines up with the audio track mux builds to sum(timings).

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import type { SceneScript } from '@chalkboard/shared';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { planSceneTiming, type SceneTiming, type AudioInfo } from './timing.js';
import { expandGraphvizInScript } from './graphviz.js';
import { planSceneCaptions } from './subtitles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RenderInput {
  script: SceneScript;
  /** Per-scene audio info, aligned by index. Pass [] for silent render. */
  audioInfo: AudioInfo[];
  /** Directory to write the recorded video into. */
  workDir: string;
  /** Final video file name (no extension). */
  baseName?: string;
  /** Draw per-scene captions onto the canvas. Default: true. */
  subtitles?: boolean;
  /**
   * Override caption text per scene (aligned by index). Used to burn subtitles
   * in a different language than the narration/voice (e.g. Hindi audio, English
   * subtitles). Falls back to the scene's narration where an entry is absent.
   */
  captionTexts?: (string | undefined)[];
  /**
   * Max scenes to render concurrently. Scenes are independent (each starts from
   * a cleared board), so they record in parallel and are concatenated after —
   * the render is no longer bound to real-time playback of the whole video.
   * Default: CPU-bound, clamped to [1, 4]. Set 1 to force sequential.
   */
  concurrency?: number;
  /** Optional progress hook. */
  onProgress?: (msg: string) => void;
}

export interface RenderOutput {
  /** Absolute path to the silent webm file. */
  silentVideoPath: string;
  /** Timings used per scene (so mux can build audio offsets). */
  timings: SceneTiming[];
  /** Canvas dimensions used during render. */
  canvas: { width: number; height: number };
}

export async function renderScript(input: RenderInput): Promise<RenderOutput> {
  const { audioInfo, workDir } = input;
  const baseName = input.baseName ?? 'render';

  await mkdir(workDir, { recursive: true });

  // Pre-process: expand `graphviz` elements (DOT strings) into concrete
  // chalkboard elements (rectangle/ellipse/text/arrow) with positions
  // computed by Graphviz's layout engine.
  input.onProgress?.('expanding graphviz elements');
  const script = await expandGraphvizInScript(input.script);

  const timings: SceneTiming[] = script.scenes.map((scene, i) =>
    planSceneTiming(scene, audioInfo[i]),
  );

  const canvas = canvasFor(script.meta.aspectRatio);
  const pagePath = resolvePagePath();

  // Per-scene caption cues (scene-relative timing), drawn on-canvas by player.js.
  const captions =
    input.subtitles === false
      ? script.scenes.map(() => [])
      : planSceneCaptions(
          script.scenes.map((s, i) => ({ narration: input.captionTexts?.[i] ?? s.narration })),
          timings,
        );

  const sceneCount = script.scenes.length;
  const concurrency = clampConcurrency(input.concurrency, sceneCount);
  input.onProgress?.(
    `launching headless chromium (${canvas.width}x${canvas.height}); ` +
      `${sceneCount} scene(s), up to ${concurrency} in parallel`,
  );

  const browser: Browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    // Render each scene independently (each starts from a cleared board, so
    // there are no cross-scene transitions to preserve) into its own webm,
    // bounded by `concurrency`.
    const scenePaths: string[] = new Array(sceneCount);
    let next = 0;
    let completed = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= sceneCount) return;
        scenePaths[i] = await renderOneScene({
          browser,
          pagePath,
          canvas,
          workDir,
          baseName,
          index: i,
          script: { ...script, scenes: [script.scenes[i]!] },
          timing: timings[i]!,
          captions: captions[i] ?? [],
        });
        completed++;
        input.onProgress?.(`rendered scene ${completed}/${sceneCount}`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // Concatenate the per-scene clips (in order) into the final silent video.
    // Clips are already trimmed to their exact scene timing, so the total
    // matches sum(timings) — the same length mux builds the audio track to.
    const target = join(workDir, `${baseName}.silent.mp4`);
    if (existsSync(target)) await rename(target, target + '.bak').catch(() => undefined);
    if (sceneCount === 1) {
      await rename(scenePaths[0]!, target);
    } else {
      input.onProgress?.('concatenating scene clips');
      await concatVideos(scenePaths, target, workDir);
    }

    await cleanupStrayVideos(workDir, target);
    return { silentVideoPath: target, timings, canvas };
  } finally {
    await browser.close();
  }
}

interface RenderSceneInput {
  browser: Browser;
  pagePath: string;
  canvas: { width: number; height: number };
  workDir: string;
  baseName: string;
  index: number;
  /** A single-scene SceneScript. */
  script: SceneScript;
  timing: SceneTiming;
  captions: unknown[];
}

/** Record one scene to its own webm and return the path. */
async function renderOneScene(input: RenderSceneInput): Promise<string> {
  const { browser, pagePath, canvas, workDir, baseName, index } = input;
  const sceneDir = join(workDir, `scene-${index}`);
  await mkdir(sceneDir, { recursive: true });

  const context: BrowserContext = await browser.newContext({
    viewport: canvas,
    deviceScaleFactor: 1,
    recordVideo: { dir: sceneDir, size: canvas },
  });
  const page = await context.newPage();
  const readyPromise = waitForConsole(page, 'READY');
  const donePromise = waitForConsole(page, 'DONE');

  await page.addInitScript(
    (payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__chalkboard__ = payload;
    },
    {
      script: input.script,
      timings: [input.timing],
      canvas,
      captions: [input.captions],
    },
  );

  await page.goto(`file://${pagePath}`, { waitUntil: 'load' });
  await readyPromise;
  await donePromise;

  const videoHandle = page.video();
  await page.close();
  await context.close();
  if (!videoHandle) {
    throw new Error(`renderScript: page.video() returned null for scene ${index}`);
  }
  const sourcePath = await videoHandle.path();
  const raw = join(workDir, `${baseName}.scene-${index}.raw.webm`);
  if (existsSync(raw)) await rename(raw, raw + '.bak').catch(() => undefined);
  await rename(sourcePath, raw);

  // The scene starts drawing immediately (negligible lead-in), but recordVideo
  // keeps a ~1s tail of the final held frame while the page closes. Keep the
  // first `timing` seconds: that's the whole scene (draw-in + hold) and drops
  // the tail, so concatenated clips line up with the audio track mux builds to
  // sum(timings). Re-encode to h264 for frame-accurate trim + fast concat copy.
  const targetSec = input.timing.durationMs / 1000;
  const out = join(workDir, `${baseName}.scene-${index}.mp4`);
  await runFfmpeg([
    '-y',
    '-i',
    raw,
    '-t',
    targetSec.toFixed(3),
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    out,
  ]);
  return out;
}

function clampConcurrency(requested: number | undefined, sceneCount: number): number {
  if (sceneCount <= 1) return 1;
  // Each context records 1080p video, so be conservative with RAM: cap at 4.
  const auto = Math.max(2, Math.min(4, (cpus().length || 4) - 2));
  const n = requested && requested > 0 ? requested : auto;
  return Math.max(1, Math.min(n, sceneCount));
}

/**
 * Concatenate the per-scene h264 clips with the concat demuxer. They share
 * codec, size and pixel format (all produced by the same trim step), so a
 * stream copy is safe and fast; if a copy fails we re-encode as a fallback.
 */
async function concatVideos(paths: string[], out: string, workDir: string): Promise<void> {
  const listFile = join(workDir, 'scene-list.txt');
  await writeFile(
    listFile,
    paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );
  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
  } catch {
    // Fallback: re-encode if a stream copy can't stitch the timestamps.
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-an',
      out,
    ]);
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: string[] = [];
    child.stderr.on('data', (d: Buffer) => stderr.push(d.toString('utf8')));
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`ffmpeg exited ${code}: ${stderr.join('').slice(-800)}`));
    });
  });
}

export interface ScreenshotInput {
  script: SceneScript;
  workDir: string;
  onProgress?: (msg: string) => void;
}

export interface ScreenshotOutput {
  /** One PNG path per scene, aligned by index. */
  paths: string[];
  canvas: { width: number; height: number };
}

/**
 * Render each scene's final drawn state to a still PNG (no animation, no audio).
 * Reuses the player in snapshot mode. Used by the self-correct loop, which feeds
 * these stills to a vision model — far cheaper than re-recording the video.
 */
export async function screenshotScenes(input: ScreenshotInput): Promise<ScreenshotOutput> {
  const { workDir } = input;
  await mkdir(workDir, { recursive: true });
  const script = await expandGraphvizInScript(input.script);
  const canvas = canvasFor(script.meta.aspectRatio);
  const pagePath = resolvePagePath();

  const browser: Browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: canvas, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('[chalkboard]')) input.onProgress?.(text);
    });
    const ready = waitForConsole(page, 'READY');
    await page.addInitScript(
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__chalkboard__ = payload;
      },
      { script, timings: [], canvas, snapshot: true },
    );
    await page.goto(`file://${pagePath}`, { waitUntil: 'load' });
    await ready;

    const paths: string[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (idx) => (window as any).chalkboardPaintScene(idx),
        i,
      );
      await page.waitForTimeout(120); // let RoughJS + images paint
      const out = join(workDir, `scene-${i}.snapshot.png`);
      await page.screenshot({ path: out });
      paths.push(out);
    }
    await page.close();
    await context.close();
    return { paths, canvas };
  } finally {
    await browser.close();
  }
}

function canvasFor(ar: SceneScript['meta']['aspectRatio']): { width: number; height: number } {
  if (ar === '9:16') return { width: 1080, height: 1920 };
  if (ar === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function resolvePagePath(): string {
  // In dist/, the page is at ../../page/index.html. In src (dev via tsx),
  // it's also at ../../page/index.html. We look for both.
  const candidates = [
    resolve(__dirname, '../page/index.html'),
    resolve(__dirname, '../../page/index.html'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`renderer: page/index.html not found. Tried: ${candidates.join(', ')}`);
}

function waitForConsole(page: Page, marker: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(
      () => rejectPromise(new Error(`renderer: timed out waiting for [chalkboard] ${marker}`)),
      10 * 60 * 1000,
    );
    const handler = (msg: { text(): string }) => {
      if (msg.text().includes(`[chalkboard] ${marker}`)) {
        clearTimeout(timeout);
        page.off('console', handler);
        resolvePromise();
      }
    };
    page.on('console', handler);
  });
}

async function cleanupStrayVideos(dir: string, keep: string): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  for (const name of entries) {
    if (!name.endsWith('.webm')) continue;
    const full = join(dir, name);
    if (full === keep) continue;
    await rename(full, full + '.stale').catch(() => undefined);
  }
}
