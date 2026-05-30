import { describe, expect, it } from 'vitest';
import { cuesForScene, hasCaptions, planSceneCaptions } from './subtitles.js';
import type { SceneTiming } from './timing.js';

const timing = (durationMs: number): SceneTiming => ({
  durationMs,
  staggerMs: 0,
  drawDurationMs: 0,
  holdMs: 0,
});

describe('cuesForScene', () => {
  it('returns no cues for empty narration', () => {
    expect(cuesForScene('', 3000)).toEqual([]);
    expect(cuesForScene('   ', 3000)).toEqual([]);
  });

  it('keeps a short narration as one cue spanning the scene window', () => {
    const cues = cuesForScene('A hash maps keys to values.', 4000);
    expect(cues.length).toBe(1);
    expect(cues[0]!.startMs).toBe(0);
    expect(cues[0]!.endMs).toBe(4000);
  });

  it('splits long narration into ordered, contiguous cues ending at the window', () => {
    const long =
      'Imagine you have a million names. Scanning the list one by one is painfully slow. So instead we hash the key. That gives us the slot directly. Now lookup is basically instant.';
    const cues = cuesForScene(long, 10000);
    expect(cues.length).toBeGreaterThan(1);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.startMs).toBeGreaterThanOrEqual(cues[i - 1]!.endMs - 1);
    }
    expect(cues[cues.length - 1]!.endMs).toBe(10000);
  });

  it('hard-splits a single sentence longer than the cue limit', () => {
    const oneLong =
      'this is a single very long run-on sentence with no punctuation that just keeps going and going well past any reasonable caption length so it must be broken into pieces';
    const cues = cuesForScene(oneLong, 6000);
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(90);
  });
});

describe('planSceneCaptions', () => {
  it('produces one cue list per scene aligned by index', () => {
    const plan = planSceneCaptions(
      [{ narration: 'Scene one is here.' }, { narration: '' }, { narration: 'Three.' }],
      [timing(3000), timing(2000), timing(1500)],
    );
    expect(plan.length).toBe(3);
    expect(plan[0]!.length).toBe(1);
    expect(plan[1]!.length).toBe(0); // blank narration → no cues
    expect(plan[2]![0]!.endMs).toBe(1500);
  });
});

describe('hasCaptions', () => {
  it('is false when all narration is blank', () => {
    expect(hasCaptions([{ narration: '' }, { narration: '  ' }])).toBe(false);
  });
  it('is true when any scene has narration', () => {
    expect(hasCaptions([{ narration: '' }, { narration: 'hi' }])).toBe(true);
  });
});
