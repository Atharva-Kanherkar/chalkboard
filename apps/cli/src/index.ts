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
  subtitleLang?: string;
  music?: boolean;
  musicTrack?: string;
  musicMood?: 'wonder' | 'mystery' | 'dramatic' | 'upbeat' | 'calm' | 'none';
  musicSource?: 'bundled' | 'jamendo';
  images?: boolean;
  imageModel?: string;
  imageQuality?: 'low' | 'medium' | 'high' | 'auto';
  renderConcurrency?: string;
  selfCorrect?: string | boolean;
  short?: boolean;
  cinematic?: boolean;
  draw?: boolean;
  research?: 'openai-deep-research' | 'basic' | 'stub';
  depth?: 'quick' | 'standard' | 'deep';
  languages?: string;
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
  .option('--short', 'Vertical hook-first reel (defaults aspect to 9:16)')
  .option('--cinematic', 'Research-backed full-frame documentary (Ken Burns + emotional VO)')
  .option('--draw', 'Hand-drawn animation: trace each element on like a pen (default: fade in)')
  .option(
    '--research <kind>',
    'Research provider for --cinematic: openai-deep-research | basic | stub',
  )
  .option('--depth <level>', 'Research depth for --cinematic: quick | standard | deep')
  .option(
    '--languages <list>',
    'Dub into multiple languages, comma-separated (e.g. en,hi,es) → one mp4 per language',
  )
  .option('--voice <id>', 'Voice id (provider-specific)')
  .option('--llm <kind>', 'LLM provider: anthropic | openai | ollama | stub')
  .option('--llm-model <id>', 'LLM model id')
  .option('--tts <kind>', 'TTS provider: piper | openai | elevenlabs | stub')
  .option('--tts-model <id>', 'TTS model id')
  .option('--tts-voice <id>', 'TTS voice id')
  .option('--work-dir <path>', 'Working dir (kept around if set)')
  .option('--keep', "Don't clean the working dir")
  .option('--no-subtitles', 'Disable burned-in captions (on by default)')
  .option(
    '--subtitle-lang <bcp47>',
    'Burn subtitles in this language even if the narration differs (e.g. English subs over Hindi audio)',
  )
  .option('--no-music', 'Disable background music (on by default)')
  .option('--music-track <path>', 'Custom background music file (overrides the mood track)')
  .option(
    '--music-mood <mood>',
    'Music mood: wonder | mystery | dramatic | upbeat | calm | none (default: chosen by the model)',
  )
  .option(
    '--music-source <src>',
    'Music source: bundled (default) | jamendo (needs JAMENDO_CLIENT_ID)',
  )
  .option('--no-images', 'Disable image generation for image elements (on by default)')
  .option('--image-model <id>', 'Image model id (default gpt-image-2)')
  .option('--image-quality <q>', 'Image quality: low | medium | high | auto (default medium)')
  .option('--render-concurrency <n>', 'Scenes to render in parallel (default: auto, up to 4)')
  .option(
    '--self-correct [passes]',
    'Vision-critique each scene and fix layout before render (needs OPENAI_API_KEY)',
  )
  .option('-q, --quiet', 'Suppress progress output')
  .action(async (promptParts: string[], rawFlags: CliFlags) => {
    const prompt = promptParts.join(' ').trim();
    if (!prompt) {
      console.error('chalkboard: prompt is required');
      process.exit(2);
    }

    const flags = rawFlags;
    // --short defaults the aspect to vertical unless the user pinned a non-default one.
    const aspectRatio = flags.short && flags.aspect === '16:9' ? '9:16' : flags.aspect;
    const opts: GenerateOptions = {
      prompt,
      outputPath: flags.output,
      language: flags.lang,
      aspectRatio,
      ...(flags.cinematic ? { format: 'cinematic' } : flags.short ? { format: 'short' } : {}),
      ...(flags.draw ? { animation: 'draw' } : {}),
      ...(flags.research ? { research: flags.research } : {}),
      ...(flags.depth ? { researchDepth: flags.depth } : {}),
      ...(flags.languages
        ? {
            languages: flags.languages
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
      ...(flags.voice ? { voice: flags.voice } : {}),
      ...(flags.workDir ? { workDir: flags.workDir } : {}),
      ...(flags.keep ? { keepWorkDir: true } : {}),
      ...(flags.subtitles === false ? { subtitles: false } : {}),
      ...(flags.subtitleLang ? { subtitleLanguage: flags.subtitleLang } : {}),
      ...(flags.music === false ? { music: false } : {}),
      ...(flags.musicTrack ? { musicTrack: flags.musicTrack } : {}),
      ...(flags.musicMood ? { musicMood: flags.musicMood } : {}),
      ...(flags.musicSource ? { musicSource: flags.musicSource } : {}),
      ...(flags.images === false ? { images: false } : {}),
      ...(flags.imageModel ? { imageModel: flags.imageModel } : {}),
      ...(flags.imageQuality ? { imageQuality: flags.imageQuality } : {}),
      ...(flags.renderConcurrency && Number.parseInt(flags.renderConcurrency, 10) > 0
        ? { renderConcurrency: Number.parseInt(flags.renderConcurrency, 10) }
        : {}),
      ...(flags.selfCorrect ? { selfCorrect: parseSelfCorrect(flags.selfCorrect) } : {}),
      ...(flags.llm ? { llm: buildLLMConfig(flags) } : {}),
      ...(flags.tts ? { tts: buildTTSConfig(flags) } : {}),
      onProgress: flags.quiet ? () => undefined : printProgress,
    };

    try {
      const result = await generate(opts);
      if (!flags.quiet) {
        if (result.outputs && result.outputs.length > 1) {
          console.error(`\n✓ wrote ${result.outputs.length} language cuts:`);
          for (const o of result.outputs) console.error(`  [${o.language}] ${o.outputPath}`);
        } else {
          console.error(`\n✓ wrote ${result.outputPath}`);
        }
        if (result.music) {
          console.error(
            `  music: ${result.music.mood} (${result.music.source})` +
              (result.music.attribution ? ` — ${result.music.attribution}` : ''),
          );
        }
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
  .description(
    'Generate just the SceneScript/ScriptDoc JSON (no render). Useful for prompt iteration.',
  )
  .argument('<prompt...>', 'The topic to explain.')
  .option('-l, --lang <bcp47>', 'Narration language', 'en')
  .option('-a, --aspect <ratio>', 'Aspect ratio', '16:9')
  .option('--format <fmt>', 'explainer | short | cinematic (cinematic researches first)')
  .option('--draw', 'Tag the script for hand-drawn animation (sets meta.animation=draw)')
  .option('--llm <kind>', 'LLM provider: anthropic | openai | ollama | stub')
  .option('--llm-model <id>', 'LLM model id')
  .option(
    '--research <kind>',
    'Research provider for cinematic: openai-deep-research | basic | stub',
  )
  .option('--depth <level>', 'Research depth: quick | standard | deep')
  .action(async (promptParts: string[], rawFlags) => {
    const prompt = promptParts.join(' ').trim();
    if (!prompt) {
      console.error('chalkboard script: prompt is required');
      process.exit(2);
    }
    const flags = rawFlags as {
      lang: string;
      aspect: '16:9' | '9:16' | '1:1';
      format?: 'explainer' | 'short' | 'cinematic';
      draw?: boolean;
      llm?: CliFlags['llm'];
      llmModel?: string;
      research?: 'openai-deep-research' | 'basic' | 'stub';
      depth?: 'quick' | 'standard' | 'deep';
    };
    const { resolveLLMProvider, groundScriptInBrief } = await import('@chalkboard/llm');
    const provider = resolveLLMProvider(
      flags.llm ? buildLLMConfig({ ...(flags as unknown as CliFlags), llm: flags.llm }) : undefined,
    );

    // Cinematic: research the topic first, then write a grounded ScriptDoc.
    let brief;
    if (flags.format === 'cinematic') {
      const { resolveResearchProvider } = await import('@chalkboard/research');
      const research = resolveResearchProvider(
        flags.research ? { kind: flags.research } : undefined,
      );
      const cited = await research.research({
        topic: prompt,
        ...(flags.depth ? { depth: flags.depth } : {}),
        language: flags.lang,
        onProgress: (m) => console.error(`[research] ${m}`),
      });
      brief = {
        summary: cited.summary,
        findings: cited.findings.map((f) => ({ text: f.text, cites: f.cites })),
        sources: cited.sources.map((s) => ({
          id: s.id,
          url: s.url,
          ...(s.title ? { title: s.title } : {}),
        })),
      };
    }

    let script = await provider.generateScript({
      prompt,
      language: flags.lang,
      aspectRatio: flags.aspect,
      ...(flags.format ? { format: flags.format } : {}),
      ...(brief ? { brief } : {}),
    });
    // Ground the script: inject the brief's authoritative sources + drop stray cites.
    if (brief) script = groundScriptInBrief(script, brief);
    if (flags.draw) script.meta.animation = 'draw';

    console.log(JSON.stringify(script, null, 2));
  });

program
  .command('research')
  .description('Research a topic into a grounded, cited brief (no script/render).')
  .argument('<topic...>', 'The topic or question to research.')
  .option(
    '--provider <kind>',
    'Research provider: openai-deep-research | basic | stub (default: auto)',
  )
  .option('--model <id>', 'Override the research model')
  .option('--depth <level>', 'quick | standard | deep (default standard)')
  .option('-l, --lang <bcp47>', 'Language for the brief', 'en')
  .option('--base-url <url>', 'OpenAI-compatible base URL (e.g. local Ollama)')
  .option('--json', 'Print the raw CitedBrief JSON')
  .action(async (topicParts: string[], rawFlags) => {
    const topic = topicParts.join(' ').trim();
    if (!topic) {
      console.error('chalkboard research: topic is required');
      process.exit(2);
    }
    const flags = rawFlags as {
      provider?: 'openai-deep-research' | 'basic' | 'stub';
      model?: string;
      depth?: 'quick' | 'standard' | 'deep';
      lang: string;
      baseUrl?: string;
      json?: boolean;
    };
    const { resolveResearchProvider } = await import('@chalkboard/research');
    const provider = resolveResearchProvider(
      flags.provider
        ? {
            kind: flags.provider,
            ...(flags.model ? { model: flags.model } : {}),
            ...(flags.baseUrl ? { baseURL: flags.baseUrl } : {}),
          }
        : undefined,
    );
    const brief = await provider.research({
      topic,
      ...(flags.depth ? { depth: flags.depth } : {}),
      language: flags.lang,
      onProgress: (m) => console.error(`[research] ${m}`),
    });

    if (flags.json) {
      console.log(JSON.stringify(brief, null, 2));
      return;
    }

    const out: string[] = [];
    out.push(`# ${brief.topic}`);
    out.push('');
    out.push(brief.summary);
    out.push('');
    out.push(`## Findings`);
    brief.findings.forEach((f, i) => {
      const refs = f.cites.length ? ` [${f.cites.join(', ')}]` : '';
      out.push(`${i + 1}. ${f.text}${refs}`);
    });
    if (brief.sources.length) {
      out.push('');
      out.push(`## Sources`);
      for (const s of brief.sources) {
        out.push(`- ${s.id}: ${s.title ? `${s.title} — ` : ''}${s.url}`);
      }
    }
    out.push('');
    out.push(
      `— ${brief.provider}${brief.model ? ` (${brief.model})` : ''} · ` +
        `${brief.grounded ? 'grounded' : 'UNGROUNDED (no live sources)'}` +
        (typeof brief.estCostUsd === 'number' ? ` · ~$${brief.estCostUsd.toFixed(4)} est.` : ''),
    );
    console.log(out.join('\n'));
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});

// `--self-correct` → true (1 pass); `--self-correct 2` → 2 passes.
function parseSelfCorrect(value: string | boolean): boolean | number {
  if (value === true) return true;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : true;
}

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
