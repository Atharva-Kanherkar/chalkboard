// M2 smoke: full pipeline (stub LLM → stub TTS → renderer → mp4).
// Run with: pnpm --filter @chalkboard/core smoke

import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generate } from '../src/generate.js';

async function main() {
  const outputPath = resolve(process.cwd(), 'core-smoke.mp4');
  const result = await generate({
    prompt: 'photosynthesis — quick demo',
    outputPath,
    language: 'en',
    aspectRatio: '16:9',
    llm: { kind: 'stub' },
    tts: { kind: 'stub' },
    onProgress: (e) => {
      if (e.phase === 'narration') {
        process.stderr.write(`  • narration scene ${e.sceneIndex + 1}/${e.sceneCount}\n`);
      } else if (e.phase === 'done') {
        process.stderr.write(`  • done\n`);
      } else {
        process.stderr.write(`  • [${e.phase}] ${(e as { message?: string }).message ?? ''}\n`);
      }
    },
  });
  const info = await stat(result.outputPath);
  console.log(`\n✓ wrote ${result.outputPath} (${(info.size / 1024).toFixed(0)} KB)`);
  console.log(`  scenes: ${result.script.scenes.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
