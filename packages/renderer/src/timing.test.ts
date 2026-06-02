import { describe, expect, it } from 'vitest';
import { planSceneTiming } from './timing.js';
import type { Scene } from '@chalkboard/shared';

const scene = (els: number, overrides: Partial<Scene> = {}): Scene => ({
  id: 's',
  narration: 'x',
  elements: Array.from({ length: els }, (_, i) => ({ id: `e${i}`, type: 'rectangle' })),
  ...overrides,
});

describe('planSceneTiming', () => {
  it('floors duration when there is no audio', () => {
    const t = planSceneTiming(scene(3), undefined);
    expect(t.durationMs).toBeGreaterThanOrEqual(1500);
  });

  it('stretches duration to match audio length + hold', () => {
    const t = planSceneTiming(scene(3), { durationMs: 5000 });
    // audio 5s + holdMs default 600 = 5600
    expect(t.durationMs).toBe(5600);
  });

  it('distributes reveal time across gaps', () => {
    // 4 elements, 4s audio. revealWindow ≈ 4000 - 600 - 420 = 2980 over 3 gaps → ~993ms
    const t = planSceneTiming(scene(4), { durationMs: 4000 });
    expect(t.staggerMs).toBeGreaterThan(500);
    expect(t.staggerMs).toBeLessThan(1500);
  });

  it('honors explicit stagger override', () => {
    const t = planSceneTiming(scene(4, { staggerMs: 333 }), { durationMs: 4000 });
    expect(t.staggerMs).toBe(333);
  });
});
