// A tiny TTS provider that synthesizes a deterministic sine wave for any
// input text. Not for production — but invaluable for:
//   - integration tests (no API key, no Piper install)
//   - quick demos of the rendering/mux pipeline
//   - users prototyping a SceneScript before wiring up a real TTS
//
// Duration scales with text length so the renderer's timing planner has
// realistic per-scene audio to align against.

import type { SynthesizeInput, SynthesizeOutput, TTSProvider } from './provider.js';

export interface StubTTSProviderOptions {
  /** Milliseconds of audio per character. Default ~70ms/char ≈ 220 wpm. */
  msPerChar?: number;
  /** Pitch of the tone, in Hz. */
  frequency?: number;
  /** Output sample rate. 22050 keeps file size sane. */
  sampleRate?: number;
  /** Min duration in ms regardless of text length. */
  minMs?: number;
}

export class StubTTSProvider implements TTSProvider {
  readonly name = 'stub';
  private readonly msPerChar: number;
  private readonly frequency: number;
  private readonly sampleRate: number;
  private readonly minMs: number;

  constructor(opts: StubTTSProviderOptions = {}) {
    this.msPerChar = opts.msPerChar ?? 60;
    this.frequency = opts.frequency ?? 220;
    this.sampleRate = opts.sampleRate ?? 22050;
    this.minMs = opts.minMs ?? 800;
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const ms = Math.max(this.minMs, input.text.length * this.msPerChar);
    const sampleCount = Math.round((ms / 1000) * this.sampleRate);
    const wav = buildSineWav(sampleCount, this.sampleRate, this.frequency);
    return { bytes: wav, format: 'wav', sampleRate: this.sampleRate };
  }
}

// Tiny WAV (PCM 16-bit mono) writer.
function buildSineWav(sampleCount: number, sampleRate: number, frequency: number): Uint8Array {
  const byteRate = sampleRate * 2; // 16-bit mono
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Soft envelope so the tone doesn't click at start/end.
  const fadeSamples = Math.min(Math.round(sampleRate * 0.02), Math.floor(sampleCount / 2));
  for (let i = 0; i < sampleCount; i++) {
    let envelope = 1;
    if (i < fadeSamples) envelope = i / fadeSamples;
    else if (i >= sampleCount - fadeSamples) envelope = (sampleCount - i) / fadeSamples;
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * envelope * 0.2;
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }

  return new Uint8Array(buffer);
}
