import { describe, expect, it } from 'vitest';
import { drawSnapshot, easeOutCubic, finalSnapshot } from './draw-animation.js';

describe('easeOutCubic', () => {
  it('clamps to [0,1]', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
  });
  it('is monotonic over [0,1]', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('drawSnapshot', () => {
  it('scales target opacity to progress', () => {
    const el = { id: 'a', type: 'rectangle', opacity: 100 };
    const half = drawSnapshot(el, 0.5);
    expect(half.opacity).toBeGreaterThan(0);
    expect(half.opacity).toBeLessThan(100);

    const full = drawSnapshot(el, 1);
    expect(full.opacity).toBe(100);
  });

  it('bumps version + versionNonce so Excalidraw re-renders', () => {
    const el = { id: 'a', type: 'rectangle', version: 1 };
    const snap = drawSnapshot(el, 0.5);
    expect(snap.version).toBeGreaterThan(1);
    expect(snap.versionNonce).toBeDefined();
  });
});

describe('finalSnapshot', () => {
  it('preserves opacity and bumps version', () => {
    const el = { id: 'a', type: 'rectangle', opacity: 80, version: 5 };
    const fin = finalSnapshot(el);
    expect(fin.opacity).toBe(80);
    expect(fin.version).toBeGreaterThan(5);
  });
});
