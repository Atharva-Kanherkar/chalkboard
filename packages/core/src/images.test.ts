import { describe, expect, it } from 'vitest';
import { generateSceneImages } from './images.js';
import type { SceneScript } from '@chalkboard/shared';

function scriptWith(elements: SceneScript['scenes'][number]['elements']): SceneScript {
  return {
    version: '1',
    meta: { language: 'en', aspectRatio: '16:9' },
    scenes: [{ id: 's1', narration: 'n', elements }],
  };
}

describe('generateSceneImages', () => {
  it('is a no-op when there are no image elements', async () => {
    const s = scriptWith([{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }]);
    const res = await generateSceneImages(s, { workDir: '/tmp', apiKey: undefined });
    expect(res.generated).toBe(0);
    expect(res.skippedForNoKey).toBe(false);
  });

  it('draws placeholders (skips) when image elements exist but no key is available', async () => {
    const s = scriptWith([
      { id: 'img', type: 'image', x: 0, y: 0, width: 600, height: 400, prompt: 'a galaxy' },
    ]);
    const res = await generateSceneImages(s, { workDir: '/tmp', apiKey: '' });
    expect(res.skippedForNoKey).toBe(true);
    expect(res.generated).toBe(0);
    // element left without a src so the renderer can placeholder it
    expect(res.script.scenes[0]!.elements![0]!['src']).toBeUndefined();
  });

  it('ignores image elements that already have a src', async () => {
    const s = scriptWith([
      { id: 'img', type: 'image', x: 0, y: 0, width: 600, height: 400, src: 'data:...' },
    ]);
    const res = await generateSceneImages(s, { workDir: '/tmp', apiKey: 'sk-test' });
    // already has src → not a generation target → no key path hit, no skip flag
    expect(res.generated).toBe(0);
    expect(res.skippedForNoKey).toBe(false);
  });
});
