// Layout helpers for placing elements without overlap. Used by the LLM
// adapter when the model omits explicit coordinates.

import type { ExcalidrawElementLike } from '@chalkboard/shared';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function visibleElements(elements: ExcalidrawElementLike[]): ExcalidrawElementLike[] {
  return elements.filter((el) => !el['isDeleted']);
}

export function boundsOf(elements: ExcalidrawElementLike[]): Bounds | null {
  const live = visibleElements(elements);
  if (live.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of live) {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 40;
    const h = el.height ?? 40;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  return { minX, minY, maxX, maxY };
}

/** Anchor for the next row of content, below everything already drawn. */
export function nextAnchorBelow(elements: ExcalidrawElementLike[]): { x: number; y: number } {
  const bounds = boundsOf(elements);
  if (!bounds) return { x: 140, y: 140 };
  return { x: Math.min(140, bounds.minX), y: bounds.maxY + 48 };
}
