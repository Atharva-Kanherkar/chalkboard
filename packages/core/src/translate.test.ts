import { describe, expect, it } from 'vitest';
import type { SceneScript } from '@chalkboard/shared';
import { translateScript } from './translate.js';

const script: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9', title: 'T' },
  scenes: [
    {
      id: 's1',
      narration: 'Hello world',
      elements: [
        { id: 'e1', type: 'text', x: 10, y: 10, text: 'A label' },
        { id: 'e2', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
      ],
    },
  ],
};

describe('translateScript (no API key)', () => {
  it('falls back to original text but stamps the target language', async () => {
    // apiKey:'' forces the no-key path deterministically (no network).
    const out = await translateScript(script, 'hi', { apiKey: '' });
    expect(out.meta.language).toBe('hi');
    // No key → text unchanged, structure/ids/coords preserved.
    expect(out.scenes[0]!.narration).toBe('Hello world');
    expect(out.scenes[0]!.elements![0]!['text']).toBe('A label');
    expect(out.scenes[0]!.elements![1]!.id).toBe('e2');
    // Original is not mutated.
    expect(script.meta.language).toBe('en');
  });
});
