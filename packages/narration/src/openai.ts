import OpenAI from 'openai';
import type { SynthesizeInput, SynthesizeOutput, TTSProvider } from './provider.js';

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
    this.model = opts.model ?? 'tts-1';
    this.voice = opts.voice ?? 'alloy';
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: (input.voice ?? this.voice) as 'alloy',
      input: input.text,
      response_format: 'mp3',
    });
    const arrayBuffer = await response.arrayBuffer();
    return { bytes: new Uint8Array(arrayBuffer), format: 'mp3' };
  }
}
