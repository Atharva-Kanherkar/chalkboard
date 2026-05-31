// ElevenLabs adapter. Uses the REST API directly (no SDK) to keep deps slim.

import type { SynthesizeInput, SynthesizeOutput, TTSProvider } from './provider.js';
import { elevenAudioTagPrefix } from './delivery.js';

export interface ElevenLabsProviderOptions {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
}

export class ElevenLabsProvider implements TTSProvider {
  readonly name = 'elevenlabs';
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly modelId: string;

  constructor(opts: ElevenLabsProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['ELEVENLABS_API_KEY'];
    if (!apiKey) throw new Error('ElevenLabsProvider: ELEVENLABS_API_KEY not set.');
    this.apiKey = apiKey;
    this.voiceId = opts.voiceId ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel, default English voice
    // v3 is the expressive model that understands inline audio tags.
    this.modelId = opts.modelId ?? process.env['ELEVENLABS_MODEL'] ?? 'eleven_v3';
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const voiceId = input.voice ?? this.voiceId;
    // Prepend emotion audio tags (v3) so delivery direction is honored.
    const text = `${elevenAudioTagPrefix(input.delivery)}${input.text}`;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabsProvider: HTTP ${response.status} ${await response.text()}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return { bytes: new Uint8Array(arrayBuffer), format: 'mp3' };
  }
}
