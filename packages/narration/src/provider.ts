export interface SynthesizeInput {
  text: string;
  language: string;
  voice?: string;
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
