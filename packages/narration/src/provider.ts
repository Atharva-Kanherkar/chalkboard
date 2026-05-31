export interface SynthesizeInput {
  text: string;
  language: string;
  voice?: string;
  /**
   * Delivery direction, mapped per provider (OpenAI `instructions`, ElevenLabs
   * v3 audio tags). Provider-agnostic so a ScriptDoc's `delivery` flows through.
   */
  delivery?: { emotion?: string; pace?: 'slow' | 'normal' | 'fast' };
}

export interface SynthesizeOutput {
  /** Audio bytes, format determined by provider. */
  bytes: Uint8Array;
  /** Container format ("mp3" | "wav" | "ogg"). */
  format: 'mp3' | 'wav' | 'ogg';
  /** Sample rate in Hz, when known. */
  sampleRate?: number;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(input: SynthesizeInput): Promise<SynthesizeOutput>;
}
