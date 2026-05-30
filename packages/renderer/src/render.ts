// Drive a headless Chromium through the SceneScript, recording the canvas as
// a silent video. Audio is muxed post-hoc by mux.ts.
//
// Why this shape:
// - Playwright's built-in `recordVideo` is reliable but yields webm with no
//   precise timing control; we instead trigger explicit start/stop signals
//   from the page (READY / DONE log lines) and rely on Playwright's video
//   length matching real-time playback.
// - Real-time playback fits the 3-5 min budget for a 3-5 min video. Faster
//   rendering (frame-by-frame headless) would need a Remotion-style rewrite.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { SceneScript } from '@chalkboard/shared';
import { chromium, type Browser, type Page } from 'playwright';
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
          script.scenes.map((s) => ({ narration: s.narration })),
          timings,
        );

  input.onProgress?.(`launching headless chromium (${canvas.width}x${canvas.height})`);

  const browser: Browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: canvas,
      deviceScaleFactor: 1,
      recordVideo: { dir: workDir, size: canvas },
    });

    const page = await context.newPage();

    // Pipe page logs to our progress hook for visibility.
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('[chalkboard]')) input.onProgress?.(text);
    });

    // Wait for READY and DONE markers.
    const readyPromise = waitForConsole(page, 'READY');
    const donePromise = waitForConsole(page, 'DONE');

    // Inject the script BEFORE navigation so player.js sees it.
    await page.addInitScript(
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__chalkboard__ = payload;
      },
      {
        script,
        timings,
        canvas,
        captions,
      },
    );

    await page.goto(`file://${pagePath}`, { waitUntil: 'load' });

    await readyPromise;
    input.onProgress?.('recording started');
    await donePromise;
    input.onProgress?.('recording finished');

    // Closing the page flushes the video file.
    const videoHandle = page.video();
    await page.close();
    await context.close();

    if (!videoHandle) {
      throw new Error('renderScript: page.video() returned null — recordVideo missing');
    }
    const sourcePath = await videoHandle.path();

    // Move it to a predictable name.
    const target = join(workDir, `${baseName}.silent.webm`);
    if (existsSync(target)) {
      // Playwright sometimes refuses to overwrite; remove first.
      await rename(target, target + '.bak').catch(() => undefined);
    }
    await rename(sourcePath, target);

    // Some Playwright versions write to a sibling .webm.crdownload-like file;
    // also clean up any leftovers.
    await cleanupStrayVideos(workDir, target);

    return { silentVideoPath: target, timings, canvas };
  } finally {
    await browser.close();
  }
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
