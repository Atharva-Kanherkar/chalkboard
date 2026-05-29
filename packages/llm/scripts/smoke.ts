// M3 smoke: exercise the LLM stage in isolation. Prints the SceneScript JSON
// to stdout so prompt iteration is fast.
//
//   pnpm --filter @chalkboard/llm smoke "topic"
//
// Provider is auto-resolved from env:
//   ANTHROPIC_API_KEY -> anthropic
//   OPENAI_API_KEY    -> openai
//   else              -> ollama (http://localhost:11434)
// Set CHALKBOARD_LLM=stub to use the offline stub.

import { resolveLLMProvider } from '../src/index.js';

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim() || 'photosynthesis';
  const provider = resolveLLMProvider(undefined);
  process.stderr.write(`provider: ${provider.name}\nprompt:   ${prompt}\n\n`);

  const t0 = Date.now();
  const script = await provider.generateScript({
    prompt,
    language: 'en',
    aspectRatio: '16:9',
  });
  const elapsedMs = Date.now() - t0;
  process.stderr.write(`generated in ${elapsedMs} ms — ${script.scenes.length} scenes\n\n`);
  console.log(JSON.stringify(script, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
