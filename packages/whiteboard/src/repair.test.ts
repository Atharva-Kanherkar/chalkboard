import { describe, expect, it } from 'vitest';
import { estimateBox, repairScript } from './repair.js';
import type { SceneScript } from '@chalkboard/shared';

function script(elements: SceneScript['scenes'][number]['elements']): SceneScript {
  return {
    version: '1',
    meta: { language: 'en', aspectRatio: '16:9' },
    scenes: [{ id: 's1', narration: 'n', elements }],
  };
}

describe('repairScript — overflow', () => {
  it('moves a shape that runs off the right edge back inside', () => {
    const { script: out, report } = repairScript(
      script([{ id: 'r', type: 'rectangle', x: 1800, y: 200, width: 400, height: 100 }]),
    );
    const r = out.scenes[0]!.elements![0]!;
    expect((r.x as number) + (r.width as number)).toBeLessThanOrEqual(1920 - 32);
    expect(report.clamped).toBe(1);
  });

  it('moves a shape off the top/left edge back inside', () => {
    const { script: out } = repairScript(
      script([{ id: 'r', type: 'rectangle', x: -50, y: -20, width: 200, height: 100 }]),
    );
    const r = out.scenes[0]!.elements![0]!;
    expect(r.x as number).toBeGreaterThanOrEqual(32);
    expect(r.y as number).toBeGreaterThanOrEqual(32);
  });

  it('scales down a shape larger than the safe area', () => {
    const { script: out, report } = repairScript(
      script([{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 5000, height: 3000 }]),
    );
    const r = out.scenes[0]!.elements![0]!;
    expect(r.width as number).toBeLessThanOrEqual(1920 - 64);
    expect(r.height as number).toBeLessThanOrEqual(1080 - 64);
    expect(report.scaled).toBe(1);
  });

  it('leaves an in-bounds shape untouched', () => {
    const el = { id: 'r', type: 'rectangle', x: 200, y: 200, width: 400, height: 100 };
    const { script: out, report } = repairScript(script([{ ...el }]));
    expect(out.scenes[0]!.elements![0]).toMatchObject(el);
    expect(report.clamped).toBe(0);
    expect(report.scaled).toBe(0);
  });

  it('does not clamp arrows (geometry is derived)', () => {
    const { script: out, report } = repairScript(
      script([{ id: 'a', type: 'arrow', x: -100, y: -100, width: 200, height: 0 }]),
    );
    expect(out.scenes[0]!.elements![0]!.x).toBe(-100);
    expect(report.clamped).toBe(0);
  });
});

describe('repairScript — duplicate text', () => {
  it('removes identical text stamped at the same spot', () => {
    const { script: out, report } = repairScript(
      script([
        { id: 't1', type: 'text', x: 100, y: 100, text: 'Hash Tables' },
        { id: 't2', type: 'text', x: 105, y: 102, text: 'hash tables' },
      ]),
    );
    expect(out.scenes[0]!.elements!.length).toBe(1);
    expect(report.dedupedText).toBe(1);
  });

  it('keeps identical text at clearly different spots', () => {
    const { script: out, report } = repairScript(
      script([
        { id: 't1', type: 'text', x: 100, y: 100, text: 'A' },
        { id: 't2', type: 'text', x: 100, y: 800, text: 'A' },
      ]),
    );
    expect(out.scenes[0]!.elements!.length).toBe(2);
    expect(report.dedupedText).toBe(0);
  });
});

describe('repairScript — text overlap', () => {
  it('nudges a text box that overlaps another downward', () => {
    const { script: out, report } = repairScript(
      script([
        { id: 't1', type: 'text', x: 200, y: 200, text: 'first line of body', fontSize: 32 },
        { id: 't2', type: 'text', x: 200, y: 205, text: 'second line body', fontSize: 32 },
      ]),
    );
    const ys = out.scenes[0]!.elements!.map((e) => e.y as number).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(20);
    expect(report.movedOverlaps).toBeGreaterThanOrEqual(1);
  });
});

describe('estimateBox', () => {
  it('estimates a multi-line text height from font size', () => {
    const box = estimateBox({ id: 't', type: 'text', x: 0, y: 0, text: 'a\nb\nc', fontSize: 40 });
    expect(box.h).toBeGreaterThan(40 * 3);
  });
  it('uses width/height for shapes', () => {
    const box = estimateBox({ id: 'r', type: 'rectangle', x: 10, y: 20, width: 300, height: 80 });
    expect(box).toEqual({ x: 10, y: 20, w: 300, h: 80 });
  });
});
