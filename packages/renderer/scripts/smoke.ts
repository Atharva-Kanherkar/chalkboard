// M1 smoke test: hardcoded SceneScript → silent webm → muxed mp4 (silent audio).
// Run with: pnpm --filter @chalkboard/renderer smoke

import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SceneScript } from '@chalkboard/shared';
import { muxFinal } from '../src/mux.js';
import { renderScript } from '../src/render.js';

const SCRIPT: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9', title: 'Smoke test' },
  scenes: [
    {
      id: 'scene-1',
      narration: 'Welcome to chalkboard.',
      elements: [
        {
          id: 's1-title',
          type: 'text',
          x: 200,
          y: 200,
          text: 'Hello, chalkboard.',
          fontSize: 56,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
        },
        {
          id: 's1-rect',
          type: 'rectangle',
          x: 200,
          y: 320,
          width: 400,
          height: 200,
          strokeColor: '#1e1e1e',
          backgroundColor: '#a5d8ff',
          fillStyle: 'solid',
          roughness: 1,
        },
        {
          id: 's1-arrow',
          type: 'arrow',
          x: 650,
          y: 420,
          width: 300,
          height: 0,
          points: [
            [0, 0],
            [300, 0],
          ],
          strokeColor: '#1e1e1e',
          endArrowhead: 'arrow',
        },
        {
          id: 's1-target',
          type: 'ellipse',
          x: 1000,
          y: 360,
          width: 200,
          height: 120,
          strokeColor: '#1e1e1e',
          backgroundColor: '#ffec99',
          fillStyle: 'solid',
        },
      ],
    },
    {
      id: 'scene-2',
      narration: 'Scene two: a second beat.',
      elements: [
        {
          id: 's2-title',
          type: 'text',
          x: 300,
          y: 250,
          text: 'Scene two.',
          fontSize: 56,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
        },
        {
          id: 's2-circle',
          type: 'ellipse',
          x: 350,
          y: 400,
          width: 320,
          height: 320,
          strokeColor: '#1e1e1e',
          backgroundColor: '#b2f2bb',
          fillStyle: 'solid',
        },
      ],
    },
  ],
};

async function generateSilentWav(): Promise<string> {
  const path = join(tmpdir(), `chalkboard-silent-${Date.now()}.wav`);
  await new Promise<void>((res, rej) => {
    const ff = spawn('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-t',
      '0.5',
      path,
    ]);
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg ${code}`))));
  });
  return path;
}

async function main() {
  const silentWav = await generateSilentWav();
  const workDir = await mkdtemp(join(tmpdir(), 'chalkboard-smoke-'));
  const outputPath = resolve(process.cwd(), 'smoke.mp4');
  console.log('workDir:', workDir);
  console.log('output: ', outputPath);

  const audioInfo = SCRIPT.scenes.map(() => ({ durationMs: 3000 }));

  const rendered = await renderScript({
    script: SCRIPT,
    audioInfo,
    workDir,
    onProgress: (msg) => console.log('  •', msg),
  });

  await muxFinal({
    silentVideoPath: rendered.silentVideoPath,
    audioTracks: rendered.timings.map(() => ({ path: silentWav, durationMs: 500 })),
    timings: rendered.timings,
    outputPath,
    workDir,
    onProgress: (msg) => console.log('  •', msg),
  });

  const info = await stat(outputPath);
  console.log(`\n✓ wrote ${outputPath} (${(info.size / 1024).toFixed(0)} KB)`);

  await rm(workDir, { recursive: true, force: true });
  await rm(silentWav, { force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
