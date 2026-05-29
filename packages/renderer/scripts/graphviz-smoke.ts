// Graphviz pre-processor smoke. Renders a SceneScript whose scenes are
// authored as DOT — proves the layout + element-fanout path end-to-end.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SceneScript } from '@chalkboard/shared';
import { muxFinal } from '../src/mux.js';
import { renderScript } from '../src/render.js';

const SCRIPT: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9', title: 'Graphviz smoke' },
  scenes: [
    {
      id: 'scene-1',
      narration: 'A linked list, laid out by graphviz.',
      elements: [
        {
          id: 's1-title',
          type: 'text',
          x: 160,
          y: 120,
          text: 'Linked list',
          fontSize: 48,
          fontFamily: 1,
        },
        {
          id: 's1-graph',
          type: 'graphviz',
          x: 160,
          y: 260,
          width: 1600,
          height: 480,
          dot: [
            'digraph {',
            '  rankdir=LR;',
            '  node [shape=box, style=filled, fillcolor="#a5d8ff"];',
            '  head [label="head"];',
            '  n1 [label="42"];',
            '  n2 [label="17"];',
            '  n3 [label="99"];',
            '  tail [label="null", shape=ellipse, fillcolor="#ffec99"];',
            '  head -> n1; n1 -> n2; n2 -> n3; n3 -> tail;',
            '}',
          ].join('\n'),
        } as Record<string, unknown> as never,
      ],
    },
    {
      id: 'scene-2',
      narration: 'A binary tree, top-down.',
      elements: [
        {
          id: 's2-title',
          type: 'text',
          x: 160,
          y: 120,
          text: 'Binary tree',
          fontSize: 48,
          fontFamily: 1,
        },
        {
          id: 's2-graph',
          type: 'graphviz',
          x: 160,
          y: 240,
          width: 1600,
          height: 700,
          dot: [
            'digraph {',
            '  rankdir=TB;',
            '  node [shape=circle, style=filled, fillcolor="#b2f2bb"];',
            '  root [label="8"]; l [label="3"]; r [label="10"];',
            '  ll [label="1"]; lr [label="6"]; rr [label="14"];',
            '  root -> l; root -> r;',
            '  l -> ll; l -> lr;',
            '  r -> rr;',
            '}',
          ].join('\n'),
        } as Record<string, unknown> as never,
      ],
    },
  ],
};

async function silentWav(): Promise<string> {
  const path = join(tmpdir(), `gv-silent-${Date.now()}.wav`);
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
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`))));
  });
  return path;
}

async function main() {
  const wav = await silentWav();
  const workDir = await mkdtemp(join(tmpdir(), 'gv-smoke-'));
  const outputPath = resolve(process.cwd(), 'graphviz-smoke.mp4');

  const audioInfo = SCRIPT.scenes.map(() => ({ durationMs: 4000 }));
  const rendered = await renderScript({
    script: SCRIPT,
    audioInfo,
    workDir,
    onProgress: (m) => console.log('  •', m),
  });

  await muxFinal({
    silentVideoPath: rendered.silentVideoPath,
    audioTracks: rendered.timings.map(() => ({ path: wav, durationMs: 500 })),
    timings: rendered.timings,
    outputPath,
    workDir,
    onProgress: (m) => console.log('  •', m),
  });

  const info = await stat(outputPath);
  console.log(`\n✓ wrote ${outputPath} (${(info.size / 1024).toFixed(0)} KB)`);
  await rm(workDir, { recursive: true, force: true });
  await rm(wav, { force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
