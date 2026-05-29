import { describe, expect, it } from 'vitest';
import { StubTTSProvider } from './stub.js';

describe('StubTTSProvider', () => {
  it('emits a WAV header', async () => {
    const p = new StubTTSProvider();
    const out = await p.synthesize({ text: 'hello', language: 'en' });
    expect(out.format).toBe('wav');
    expect(out.bytes.length).toBeGreaterThan(44);
    // RIFF...WAVE
    expect(String.fromCharCode(out.bytes[0]!, out.bytes[1]!, out.bytes[2]!, out.bytes[3]!)).toBe(
      'RIFF',
    );
    expect(
      String.fromCharCode(out.bytes[8]!, out.bytes[9]!, out.bytes[10]!, out.bytes[11]!),
    ).toBe('WAVE');
  });

  it('scales duration with text length', async () => {
    const p = new StubTTSProvider({ msPerChar: 50, minMs: 100 });
    const short = await p.synthesize({ text: 'hi', language: 'en' });
    const long = await p.synthesize({ text: 'a'.repeat(50), language: 'en' });
    expect(long.bytes.length).toBeGreaterThan(short.bytes.length);
  });

  it('honors minMs floor for short text', async () => {
    const p = new StubTTSProvider({ msPerChar: 1, minMs: 1000, sampleRate: 22050 });
    const out = await p.synthesize({ text: 'a', language: 'en' });
    // 1s @ 22050 Hz, 16-bit mono = 44100 bytes + 44 header
    expect(out.bytes.length).toBeGreaterThanOrEqual(44100 + 44);
  });
});
