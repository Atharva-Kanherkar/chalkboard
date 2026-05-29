import { describe, expect, it } from 'vitest';
import { ensureElementIds, normalizeElement } from './normalize.js';

describe('normalizeElement', () => {
  it('fills text-element defaults', () => {
    const n = normalizeElement({ id: 't1', type: 'text', text: 'hi' });
    expect(n['textAlign']).toBe('left');
    expect(n['verticalAlign']).toBe('top');
    expect(n.fontFamily).toBe(1);
    expect(n.fontSize).toBe(20);
  });

  it('synthesizes points for malformed arrows', () => {
    const n = normalizeElement({
      id: 'a',
      type: 'arrow',
      width: 200,
      height: 0,
    });
    const points = n['points'] as Array<[number, number]>;
    expect(points.length).toBe(2);
    expect(points[0]).toEqual([0, 0]);
    expect(points[1]).toEqual([200, 0]);
  });

  it('preserves valid points', () => {
    const original: Array<[number, number]> = [
      [0, 0],
      [50, 0],
      [100, 50],
    ];
    const n = normalizeElement({
      id: 'a',
      type: 'arrow',
      points: original,
    });
    expect(n['points']).toEqual(original);
  });

  it('defaults opacity and roughness', () => {
    const n = normalizeElement({ id: 'r', type: 'rectangle' });
    expect(n.opacity).toBe(100);
    expect(n.roughness).toBe(1);
  });
});

describe('ensureElementIds', () => {
  it('preserves existing ids', () => {
    const result = ensureElementIds([{ id: 'keep', type: 'rectangle' }]);
    expect(result[0]?.id).toBe('keep');
  });
  it('synthesizes missing ids', () => {
    const result = ensureElementIds([{ id: '', type: 'rectangle' }]);
    expect(result[0]?.id).toBeTruthy();
  });
});
