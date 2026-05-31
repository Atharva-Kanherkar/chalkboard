import { describe, expect, it } from 'vitest';
import type { SceneScript } from '@chalkboard/shared';
import { groundScriptInBrief } from './ground.js';
import type { ScriptBrief } from './prompt.js';

const brief: ScriptBrief = {
  summary: 's',
  findings: [{ text: 'f', cites: ['s1'] }],
  sources: [
    { id: 's1', url: 'https://a.test', title: 'A' },
    { id: 's2', url: 'https://b.test' },
  ],
};

const script: SceneScript = {
  version: '2',
  meta: { language: 'en', aspectRatio: '16:9', format: 'cinematic' },
  // The model authored a bogus source + an invalid cite id; both must be corrected.
  sources: [{ id: 'sX', url: 'https://hallucinated.test' }],
  scenes: [
    { id: '1', narration: 'a', cites: ['s1', 'sX', 's2'], elements: [] },
    { id: '2', narration: 'b', elements: [] },
  ],
};

describe('groundScriptInBrief', () => {
  it('replaces sources with the brief authoritative table', () => {
    const g = groundScriptInBrief(script, brief);
    expect(g.sources).toEqual([
      { id: 's1', url: 'https://a.test', title: 'A' },
      { id: 's2', url: 'https://b.test' },
    ]);
    // The hallucinated source is gone.
    expect(g.sources!.some((s) => s.url.includes('hallucinated'))).toBe(false);
  });

  it('drops cites that do not resolve to a real source id', () => {
    const g = groundScriptInBrief(script, brief);
    expect(g.scenes[0]!.cites).toEqual(['s1', 's2']); // 'sX' dropped
    expect(g.scenes[1]!.cites).toBeUndefined(); // untouched when absent
  });

  it('marks the doc as version 2', () => {
    expect(groundScriptInBrief(script, brief).version).toBe('2');
  });

  it('every surviving cite resolves to a real source (grounding gate)', () => {
    const g = groundScriptInBrief(script, brief);
    const ids = new Set(g.sources!.map((s) => s.id));
    for (const sc of g.scenes) for (const c of sc.cites ?? []) expect(ids.has(c)).toBe(true);
  });
});
