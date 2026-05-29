// Render a committed example SceneScript with stub TTS. Used by examples/
// re-render workflow and as a visual regression entry point.
//
//   pnpm --filter @chalkboard/renderer exec tsx examples/render-script.ts \
//     examples/hash-tables/script.json examples/hash-tables/output.mp4

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generate } from '@chalkboard/core';
import type { SceneScript } from '@chalkboard/shared';

async function main() {
  const [scriptPath, outPath] = process.argv.slice(2);
  if (!scriptPath || !outPath) {
    console.error('usage: render-script.ts <script.json> <out.mp4>');
    process.exit(2);
  }

  const script = JSON.parse(await readFile(scriptPath, 'utf8')) as SceneScript;

  // Wrap script in a stub LLM so generate() can run. Easier path: bypass
  // generate() and call the renderer directly. We do the latter to make the
  // example deterministic.
  const { renderScript, muxFinal, probeAudioDuration } = await import('@chalkboard/renderer');
  const { StubTTSProvider } = await import('@chalkboard/narration');
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const workDir = await mkdtemp(join(tmpdir(), 'chalkboard-example-'));
  try {
    const tts = new StubTTSProvider();
    const audioPaths: string[] = [];
    const audioInfo: { durationMs: number }[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]!;
      const out = await tts.synthesize({ text: scene.narration, language: 'en' });
      const path = join(workDir, `scene-${i}.${out.format}`);
      await writeFile(path, out.bytes);
      audioPaths.push(path);
      audioInfo.push({ durationMs: await probeAudioDuration(path) });
    }

    const rendered = await renderScript({
      script,
      audioInfo,
      workDir,
      onProgress: (m) => console.log('  •', m),
    });

    const absOut = resolve(outPath);
    await muxFinal({
      silentVideoPath: rendered.silentVideoPath,
      audioTracks: audioPaths.map((path, i) => ({ path, durationMs: audioInfo[i]!.durationMs })),
      timings: rendered.timings,
      outputPath: absOut,
      workDir,
      onProgress: (m) => console.log('  •', m),
    });

    const info = await stat(absOut);
    console.log(`\n✓ wrote ${absOut} (${(info.size / 1024).toFixed(0)} KB)`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  // `generate()` is intentionally avoided here: it requires an LLM, but
  // examples store the pre-generated SceneScript as the source of truth.
  void generate;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
