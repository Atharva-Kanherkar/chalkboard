import OpenAI from 'openai';
import type { SynthesizeInput, SynthesizeOutput, TTSProvider } from './provider.js';
import { accentInstruction, openAIInstructions } from './delivery.js';

export interface OpenAITTSProviderOptions {
  apiKey?: string;
  model?: string;
  voice?: string;
}

export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai-tts';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly voice: string;

  constructor(opts: OpenAITTSProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) throw new Error('OpenAITTSProvider: OPENAI_API_KEY not set.');
    this.client = new OpenAI({ apiKey });
    // Default to the steerable model so per-scene delivery (emotion/pace) works.
    this.model = opts.model ?? process.env['OPENAI_TTS_MODEL'] ?? 'gpt-4o-mini-tts';
    this.voice = opts.voice ?? 'alloy';
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    // `instructions` only steers the gpt-4o-mini-tts family; harmless to omit.
    // Combine language-accent steering (so Hinglish/Hindi sounds native) with
    // any per-scene delivery direction (emotion/pace).
    let instructions: string | undefined;
    if (this.model.includes('gpt-4o')) {
      const parts = [accentInstruction(input.language), openAIInstructions(input.delivery)].filter(
        (p): p is string => Boolean(p),
      );
      instructions = parts.length ? parts.join(' ') : undefined;
    }
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: (input.voice ?? this.voice) as 'alloy',
      input: input.text,
      response_format: 'mp3',
      ...(instructions ? { instructions } : {}),
    });
    const arrayBuffer = await response.arrayBuffer();
    return { bytes: new Uint8Array(arrayBuffer), format: 'mp3' };
  }
}
