// Adapted from skillware/apps/web/lib/whiteboard/draw-animation.ts.
// Makes Excalidraw elements appear progressively (fade in, staggered) so the
// board looks like a tutor drawing on it rather than the whole diagram
// snapping into place. We mutate opacity only; geometry is untouched, so the
// canvas renderer always receives valid elements.

import type { ExcalidrawElementLike } from '@chalkboard/shared';

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

let nonceSeed = 1;
function nextNonce(): number {
  nonceSeed = (nonceSeed + 1) % 2_000_000_000;
  return nonceSeed;
}

/** Snapshot of one element at reveal progress p (0..1), forced to re-render. */
export function drawSnapshot(el: ExcalidrawElementLike, p: number): ExcalidrawElementLike {
  const eased = easeOutCubic(p);
  const targetOpacity = typeof el.opacity === 'number' ? el.opacity : 100;
  return {
    ...el,
    opacity: Math.max(0, Math.round(targetOpacity * eased)),
    version: ((el.version as number) ?? 1) + Math.ceil(p * 1000) + 1,
    versionNonce: nextNonce(),
  };
}

/** Final, fully-revealed element, bumped so it sticks after the animation. */
export function finalSnapshot(el: ExcalidrawElementLike): ExcalidrawElementLike {
  return {
    ...el,
    opacity: typeof el.opacity === 'number' ? el.opacity : 100,
    version: ((el.version as number) ?? 1) + 1002,
    versionNonce: nextNonce(),
  };
}

export function elementId(el: ExcalidrawElementLike): string {
  return String(el.id ?? '');
}
