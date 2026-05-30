import { describe, expect, it } from 'vitest';
import { selfCorrectScript } from './self-correct.js';
import type { SceneScript } from '@chalkboard/shared';

const script: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9' },
  scenes: [
    { id: 's1', narration: 'n', elements: [{ id: 't', type: 'text', x: 100, y: 100, text: 'hi' }] },
  ],
};

describe('selfCorrectScript', () => {
  it('skips cleanly (no screenshots, no calls) when no key is available', async () => {
    const res = await selfCorrectScript(script, { workDir: '/tmp', apiKey: '' });
    expect(res.skippedForNoKey).toBe(true);
    expect(res.fixedScenes).toBe(0);
    expect(res.passes).toBe(0);
    expect(res.script).toBe(script);
  });
});
