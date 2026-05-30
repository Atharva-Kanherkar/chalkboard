#!/usr/bin/env node
import { Command } from 'commander';
import { generate } from '@chalkboard/core';
import type {
  GenerateOptions,
  LLMProviderConfig,
  TTSProviderConfig,
  ProgressEvent,
} from '@chalkboard/shared';

interface CliFlags {
  output: string;
  lang: string;
  aspect: '16:9' | '9:16' | '1:1';
  voice?: string;
  llm?: 'anthropic' | 'openai' | 'ollama' | 'stub';
  llmModel?: string;
  tts?: 'piper' | 'openai' | 'elevenlabs' | 'stub';
  ttsModel?: string;
  ttsVoice?: string;
  workDir?: string;
  keep?: boolean;
  quiet?: boolean;
  subtitles?: boolean;
  music?: boolean;
  musicTrack?: string;
  images?: boolean;
  imageModel?: string;
}

const program = new Command();
program
  .name('chalkboard')
  .description('Generate a whiteboard-style explainer video from a prompt.')
  .version('0.1.0');

program
  .command('generate', { isDefault: true })
  .description('Generate an mp4 from a prompt.')
  .argument('<prompt...>', 'The topic to explain. Wrap in quotes for multi-word prompts.')
  .option('-o, --output <path>', 'Output mp4 path', 'chalkboard.mp4')
  .option('-l, --lang <bcp47>', 'Narration language (e.g. en, fr, es)', 'en')
  .option('-a, --aspect <ratio>', 'Aspect ratio: 16:9, 9:16, 1:1', '16:9')
  .option('--voice <id>', 'Voice id (provider-specific)')
  .option('--llm <kind>', 'LLM provider: anthropic | openai | ollama | stub')
  .option('--llm-model <id>', 'LLM model id')
  .option('--tts <kind>', 'TTS provider: piper | openai | elevenlabs | stub')
  .option('--tts-model <id>', 'TTS model id')
  .option('--tts-voice <id>', 'TTS voice id')
  .option('--work-dir <path>', 'Working dir (kept around if set)')
  .option('--keep', "Don't clean the working dir")
  .option('--no-subtitles', 'Disable burned-in captions (on by default)')
  .option('--no-music', 'Disable background music (on by default)')
  .option('--music-track <path>', 'Custom background music file (defaults to bundled loop)')
  .option('--no-images', 'Disable image generation for image elements (on by default)')
  .option('--image-model <id>', 'Image model id (default gpt-image-1)')
  .option('-q, --quiet', 'Suppress progress output')
  .action(async (promptParts: string[], rawFlags: CliFlags) => {
    const prompt = promptParts.join(' ').trim();
    if (!prompt) {
      console.error('chalkboard: prompt is required');
      process.exit(2);
    }

    const flags = rawFlags;
    const opts: GenerateOptions = {
      prompt,
      outputPath: flags.output,
      language: flags.lang,
      aspectRatio: flags.aspect,
      ...(flags.voice ? { voice: flags.voice } : {}),
      ...(flags.workDir ? { workDir: flags.workDir } : {}),
      ...(flags.keep ? { keepWorkDir: true } : {}),
      ...(flags.subtitles === false ? { subtitles: false } : {}),
      ...(flags.music === false ? { music: false } : {}),
      ...(flags.musicTrack ? { musicTrack: flags.musicTrack } : {}),
      ...(flags.images === false ? { images: false } : {}),
      ...(flags.imageModel ? { imageModel: flags.imageModel } : {}),
      ...(flags.llm ? { llm: buildLLMConfig(flags) } : {}),
      ...(flags.tts ? { tts: buildTTSConfig(flags) } : {}),
      onProgress: flags.quiet ? () => undefined : printProgress,
    };

    try {
      const result = await generate(opts);
      if (!flags.quiet) {
        console.error(`\n✓ wrote ${result.outputPath}`);
      } else {
        console.log(result.outputPath);
      }
    } catch (err) {
      console.error('chalkboard: error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('script')
  .description('Generate just the SceneScript JSON (no render). Useful for prompt iteration.')
  .argument('<prompt...>', 'The topic to explain.')
  .option('-l, --lang <bcp47>', 'Narration language', 'en')
  .option('-a, --aspect <ratio>', 'Aspect ratio', '16:9')
  .option('--llm <kind>', 'LLM provider: anthropic | openai | ollama | stub')
  .option('--llm-model <id>', 'LLM model id')
  .action(async (promptParts: string[], rawFlags) => {
    const prompt = promptParts.join(' ').trim();
    if (!prompt) {
      console.error('chalkboard script: prompt is required');
      process.exit(2);
    }
    const flags = rawFlags as {
      lang: string;
      aspect: '16:9' | '9:16' | '1:1';
      llm?: CliFlags['llm'];
      llmModel?: string;
    };
    const { resolveLLMProvider } = await import('@chalkboard/llm');
    const provider = resolveLLMProvider(
      flags.llm ? buildLLMConfig({ ...(flags as unknown as CliFlags), llm: flags.llm }) : undefined,
    );
    const script = await provider.generateScript({
      prompt,
      language: flags.lang,
      aspectRatio: flags.aspect,
    });
    console.log(JSON.stringify(script, null, 2));
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});

function buildLLMConfig(flags: CliFlags): LLMProviderConfig {
  const kind = flags.llm!;
  if (kind === 'anthropic') {
    return { kind: 'anthropic', ...(flags.llmModel ? { model: flags.llmModel } : {}) };
  }
  if (kind === 'openai') {
    return { kind: 'openai', ...(flags.llmModel ? { model: flags.llmModel } : {}) };
  }
  if (kind === 'stub') {
    return { kind: 'stub' };
  }
  return { kind: 'ollama', ...(flags.llmModel ? { model: flags.llmModel } : {}) };
}

function buildTTSConfig(flags: CliFlags): TTSProviderConfig {
  const kind = flags.tts!;
  if (kind === 'piper') return { kind: 'piper' };
  if (kind === 'openai') {
    return {
      kind: 'openai',
      ...(flags.ttsModel ? { model: flags.ttsModel } : {}),
      ...(flags.ttsVoice ? { voice: flags.ttsVoice } : {}),
    };
  }
  if (kind === 'stub') return { kind: 'stub' };
  return { kind: 'elevenlabs', ...(flags.ttsVoice ? { voiceId: flags.ttsVoice } : {}) };
}

function printProgress(event: ProgressEvent): void {
  switch (event.phase) {
    case 'script':
      console.error(`[script] ${event.message}`);
      break;
    case 'narration':
      console.error(`[narration] scene ${event.sceneIndex + 1}/${event.sceneCount}`);
      break;
    case 'render':
      console.error(`[render]   ${event.message}`);
      break;
    case 'mux':
      console.error(`[mux]      ${event.message}`);
      break;
    case 'done':
      // final log handled by caller
      break;
  }
}
