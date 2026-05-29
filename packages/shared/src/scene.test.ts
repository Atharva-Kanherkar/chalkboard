import { describe, expect, it } from 'vitest';
import { emptyScript, SCENE_SCRIPT_VERSION } from './scene.js';

describe('emptyScript', () => {
  it('defaults to en + 16:9', () => {
    const s = emptyScript();
    expect(s.version).toBe(SCENE_SCRIPT_VERSION);
    expect(s.meta.language).toBe('en');
    expect(s.meta.aspectRatio).toBe('16:9');
    expect(s.scenes).toEqual([]);
  });

  it('honors language + aspect overrides', () => {
    const s = emptyScript({ language: 'fr', aspectRatio: '9:16' });
    expect(s.meta.language).toBe('fr');
    expect(s.meta.aspectRatio).toBe('9:16');
  });

  it('omits voice/title when not provided', () => {
    const s = emptyScript();
    expect(s.meta.voice).toBeUndefined();
    expect(s.meta.title).toBeUndefined();
  });
});
