// Fill fields the Excalidraw renderer needs but the LLM may omit, so we don't
// spam enum warnings or crash on minimal element shapes.

import type { ExcalidrawElementLike } from '@chalkboard/shared';

export function normalizeElement(el: ExcalidrawElementLike): ExcalidrawElementLike {
  const normalized: ExcalidrawElementLike = {
    opacity: typeof el.opacity === 'number' ? el.opacity : 100,
    roughness: typeof el.roughness === 'number' ? el.roughness : 1,
    ...el,
  };

  if (el.type === 'text') {
    normalized['textAlign'] = (el['textAlign'] as string) ?? 'left';
    normalized['verticalAlign'] = (el['verticalAlign'] as string) ?? 'top';
    normalized.fontFamily = (el.fontFamily as number) ?? 1;
    normalized.fontSize = (el.fontSize as number) ?? 20;
    normalized['lineHeight'] = (el['lineHeight'] as number) ?? 1.25;
  }

  // Excalidraw reads points.length on linear/freedraw; missing or single-point
  // arrays crash the canvas. Guarantee >= 2 points.
  if (el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') {
    const points = el['points'];
    if (!Array.isArray(points) || points.length < 2) {
      const w = typeof el.width === 'number' && el.width !== 0 ? el.width : 100;
      const h = typeof el.height === 'number' ? el.height : 0;
      normalized['points'] = [
        [0, 0],
        [w, h],
      ];
    }
  }

  return normalized;
}

export function normalizeElements(elements: ExcalidrawElementLike[]): ExcalidrawElementLike[] {
  return elements.map(normalizeElement);
}

export function ensureElementIds(elements: ExcalidrawElementLike[]): ExcalidrawElementLike[] {
  return elements.map((el, i) => ({
    ...el,
    id: el.id || `el-${Date.now().toString(36)}-${i}`,
  }));
}
