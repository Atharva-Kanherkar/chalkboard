import { describe, expect, it } from 'vitest';
import { accentInstruction, elevenAudioTagPrefix, openAIInstructions } from './delivery.js';

describe('accentInstruction', () => {
  it('steers a native Indian accent for Hindi/Hinglish languages', () => {
    for (const lang of ['hi', 'Hindi', 'Hinglish (casual mix)', 'indian english']) {
      expect(accentInstruction(lang)).toMatch(/native Indian/i);
    }
  });

  it('is undefined for unspecified or unhandled languages', () => {
    expect(accentInstruction()).toBeUndefined();
    expect(accentInstruction('en')).toBeUndefined();
    expect(accentInstruction('fr')).toBeUndefined();
  });
});

describe('openAIInstructions', () => {
  it('is undefined when there is nothing to direct', () => {
    expect(openAIInstructions()).toBeUndefined();
    expect(openAIInstructions({})).toBeUndefined();
  });

  it('encodes emotion and pace', () => {
    const i = openAIInstructions({ emotion: 'curious, hushed', pace: 'slow' });
    expect(i).toContain('curious, hushed');
    expect(i).toContain('slow');
    expect(i).toContain('narrator');
  });
});

describe('elevenAudioTagPrefix', () => {
  it('is empty without emotion', () => {
    expect(elevenAudioTagPrefix()).toBe('');
    expect(elevenAudioTagPrefix({ pace: 'slow' })).toBe('');
  });

  it('maps emotion keywords to documented v3 tags', () => {
    expect(elevenAudioTagPrefix({ emotion: 'hushed and curious' })).toBe('[whispers] ');
    expect(elevenAudioTagPrefix({ emotion: 'building urgency, tense' })).toBe('[nervous] ');
    expect(elevenAudioTagPrefix({ emotion: 'warm, resolved' })).toBe('[calm] ');
  });

  it('returns empty for an unmatched emotion', () => {
    expect(elevenAudioTagPrefix({ emotion: 'matter-of-fact' })).toBe('');
  });
});
