// Visual spike for the hand-drawn stroke-reveal animation.
//
// Loads the real renderer page in snapshot mode and captures the canvas at a
// handful of progress points for a synthetic scene exercising every element
// type. The PNGs let a human (or a vision model) confirm by eye that:
//   - shapes are *partially traced* mid-progress (not just dim), no re-trace
//   - text reveals left-to-right per line
//   - the arrowhead is absent until the shaft is nearly complete
//   - the p=1 frame matches the fully-drawn final frame (parity)
//
// Run: pnpm --filter @chalkboard/renderer exec tsx scripts/draw-spike.ts
// Writes PNGs into ./draw-spike/ in the renderer package.

import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import type { SceneScript } from '@chalkboard/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCRIPT: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9', title: 'Draw spike' },
  scenes: [
    {
      id: 'spike',
      narration: 'Spike.',
      elements: [
        {
          id: 'rect',
          type: 'rectangle',
          x: 160,
          y: 200,
          width: 420,
          height: 240,
          strokeColor: '#1e1e1e',
          backgroundColor: '#a5d8ff',
          fillStyle: 'hachure',
          roughness: 1.4,
          strokeWidth: 3,
        },
        {
          id: 'ell',
          type: 'ellipse',
          x: 1320,
          y: 200,
          width: 360,
          height: 240,
          strokeColor: '#1e1e1e',
          backgroundColor: '#ffec99',
          fillStyle: 'solid',
          strokeWidth: 3,
        },
        {
          id: 'arr',
          type: 'arrow',
          from: 'rect',
          to: 'ell',
          strokeColor: '#1e1e1e',
          strokeWidth: 3,
          label: 'flows to',
        },
        {
          id: 'txt',
          type: 'text',
          x: 160,
          y: 560,
          text: 'Watch this sentence get written\nacross two whole lines by hand.',
          fontSize: 52,
          fontFamily: 1,
          maxWidth: 1600,
          strokeColor: '#1e1e1e',
        },
      ],
    },
  ],
};

// (sceneIdx, currentIdx, p) frames to capture, with a label.
const FRAMES: Array<{ name: string; currentIdx: number; p: number }> = [
  { name: '0-rect-p35', currentIdx: 0, p: 0.35 },
  { name: '1-rect-p70', currentIdx: 0, p: 0.7 },
  { name: '2-arrow-p50', currentIdx: 2, p: 0.5 }, // rect+ell done, shaft mid-draw, no head
  { name: '3-arrow-p95', currentIdx: 2, p: 0.95 }, // head appearing + label
  { name: '4-text-p40', currentIdx: 3, p: 0.4 }, // first line mid-wipe, second not started
  { name: '5-text-p80', currentIdx: 3, p: 0.8 }, // second line mid-wipe
  { name: '6-final', currentIdx: 4, p: 0 }, // everything drawn via the unchanged path (parity)
];

function resolvePagePath(): string {
  const candidates = [
    resolve(__dirname, '../page/index.html'),
    resolve(__dirname, '../../page/index.html'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('draw-spike: page/index.html not found');
}

async function main() {
  const outDir = resolve(process.cwd(), 'draw-spike');
  await mkdir(outDir, { recursive: true });
  const canvas = { width: 1920, height: 1080 };
  const pagePath = resolvePagePath();

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: canvas, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (t.startsWith('[chalkboard]')) console.log(' ', t);
    });
    const ready = new Promise<void>((res) =>
      page.on('console', (m) => m.text().includes('[chalkboard] READY') && res()),
    );
    await page.addInitScript(
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__chalkboard__ = payload;
      },
      { script: SCRIPT, timings: [], canvas, snapshot: true },
    );
    await page.goto(`file://${pagePath}`, { waitUntil: 'load' });
    await ready;
    // Let RoughJS + the Virgil webfont settle so text metrics are stable.
    await page.waitForTimeout(400);

    for (const f of FRAMES) {
      await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([i, c, p]) => (window as any).chalkboardPaintProgress(i, c, p),
        [0, f.currentIdx, f.p] as [number, number, number],
      );
      await page.waitForTimeout(60);
      const out = join(outDir, `${f.name}.png`);
      await page.screenshot({ path: out });
      console.log('  wrote', out);
    }
    await page.close();
    await context.close();
    console.log('\n✓ draw-spike frames in', outDir);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
