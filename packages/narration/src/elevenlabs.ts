// ElevenLabs adapter. Uses the REST API directly (no SDK) to keep deps slim.

import type { SynthesizeInput, SynthesizeOutput, TTSProvider } from './provider.js';

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
    this.modelId = opts.modelId ?? 'eleven_multilingual_v2';
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const voiceId = input.voice ?? this.voiceId;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input.text,
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
