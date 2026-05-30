// Deterministic layout repair: run over a SceneScript *after* the LLM produces
// it and *before* render, so every provider benefits (not just via prompting).
//
// It fixes the three defects we see most:
//   1. shapes/text overflowing the canvas safe-area  -> move, then scale to fit
//   2. duplicate text stamped at the same spot        -> de-dupe
//   3. text boxes overlapping each other              -> nudge apart vertically
//
// It is intentionally conservative: arrows/lines are left alone (their geometry
// is driven by from/to and points), and we only ever shrink or shift — never
// invent new content. The returned report is reused by the self-correct loop.

import type { ExcalidrawElementLike, SceneScript } from '@chalkboard/shared';

export interface RepairReport {
  clamped: number; // elements moved back inside the safe area
  scaled: number; // elements shrunk to fit the safe area
  dedupedText: number; // duplicate text elements removed
  movedOverlaps: number; // text elements nudged to clear an overlap
}

export interface RepairResult {
  script: SceneScript;
  report: RepairReport;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SafeArea {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MARGIN = 32; // px kept clear of every canvas edge
const OVERLAP_GAP = 16; // px inserted when separating overlapping text

// Element kinds whose x/y/width/height describe a real on-canvas box we can
// clamp. Arrows/lines/freedraw are excluded — their endpoints are derived.
const BOXED = new Set([
  'rectangle',
  'ellipse',
  'diamond',
  'text',
  'image',
  'svg',
  'code-block',
  'step-marker',
  'group',
  'highlight',
  'graphviz',
]);

export function canvasSizeFor(aspectRatio: SceneScript['meta']['aspectRatio']): {
  width: number;
  height: number;
} {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function safeAreaFor(aspectRatio: SceneScript['meta']['aspectRatio']): SafeArea {
  const { width, height } = canvasSizeFor(aspectRatio);
  return { minX: MARGIN, minY: MARGIN, maxX: width - MARGIN, maxY: height - MARGIN };
}

// Estimate the on-canvas footprint of an element. Text has no width/height in
// the schema, so we approximate from font metrics — good enough to detect gross
// overlap and overflow without a real text-measurement engine.
export function estimateBox(el: ExcalidrawElementLike): Box {
  const x = num(el.x, 0);
  const y = num(el.y, 0);

  if (el.type === 'text') {
    const fontSize = num(el.fontSize, 24);
    const lineHeight = num(el['lineHeight'] as number, 1.25);
    const charW = fontSize * 0.55; // rough average glyph advance for our fonts
    const text = String(el.text ?? '');
    const hardLines = text.split('\n');
    const maxWidth = typeof el.maxWidth === 'number' ? el.maxWidth : undefined;

    let lineCount = 0;
    let widest = 0;
    for (const line of hardLines) {
      const lineW = Math.max(1, line.length) * charW;
      if (maxWidth && lineW > maxWidth) {
        lineCount += Math.ceil(lineW / maxWidth);
        widest = Math.max(widest, maxWidth);
      } else {
        lineCount += 1;
        widest = Math.max(widest, lineW);
      }
    }
    const w = num(el.width, maxWidth ?? widest);
    const h = num(el.height, Math.max(1, lineCount) * fontSize * lineHeight);
    return { x, y, w, h };
  }

  if (el.type === 'step-marker') {
    const r = num(el['radius'] as number, 28);
    return { x, y, w: r * 2, h: r * 2 };
  }

  return { x, y, w: num(el.width, 40), h: num(el.height, 40) };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function boxesOverlap(a: Box, b: Box): number {
  // Returns the vertical overlap (px) if the two boxes intersect, else 0.
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix > 0 && iy > 0) return iy;
  return 0;
}

// Drop later text elements that repeat earlier text at (nearly) the same spot —
// the "text pasted on top of itself" bug.
function dedupeText(
  elements: ExcalidrawElementLike[],
  report: RepairReport,
): ExcalidrawElementLike[] {
  const seen: { key: string; x: number; y: number }[] = [];
  const kept: ExcalidrawElementLike[] = [];
  for (const el of elements) {
    if (el.type !== 'text' || !el.text) {
      kept.push(el);
      continue;
    }
    const key = String(el.text).trim().toLowerCase();
    const x = num(el.x, 0);
    const y = num(el.y, 0);
    const dup = seen.find((s) => s.key === key && Math.abs(s.x - x) < 16 && Math.abs(s.y - y) < 16);
    if (dup) {
      report.dedupedText += 1;
      continue;
    }
    seen.push({ key, x, y });
    kept.push(el);
  }
  return kept;
}

// Nudge overlapping text boxes downward so two captions/labels don't stack on
// the same pixels. Only text is moved (shapes are deliberate composition).
function separateText(
  elements: ExcalidrawElementLike[],
  report: RepairReport,
): ExcalidrawElementLike[] {
  const placed: Box[] = [];
  // Process in vertical order so we always push the lower one down.
  const order = elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => estimateBox(a.el).y - estimateBox(b.el).y);

  const shiftById = new Map<number, number>();
  for (const { el, i } of order) {
    if (el.type !== 'text') continue;
    let box = estimateBox(el);
    let guard = 0;
    while (guard < 8) {
      const hit = placed.find((p) => boxesOverlap(p, box) > 0);
      if (!hit) break;
      const dy = hit.y + hit.h + OVERLAP_GAP - box.y;
      box = { ...box, y: box.y + dy };
      shiftById.set(i, (shiftById.get(i) ?? 0) + dy);
      guard += 1;
    }
    placed.push(box);
  }

  if (shiftById.size === 0) return elements;
  report.movedOverlaps += shiftById.size;
  return elements.map((el, i) => {
    const dy = shiftById.get(i);
    if (!dy) return el;
    return { ...el, y: num(el.y, 0) + dy };
  });
}

// Move (and if necessary scale) one element back inside the safe area.
function clampToSafe(
  el: ExcalidrawElementLike,
  safe: SafeArea,
  report: RepairReport,
): ExcalidrawElementLike {
  if (!BOXED.has(el.type)) return el;
  const box = estimateBox(el);
  const safeW = safe.maxX - safe.minX;
  const safeH = safe.maxY - safe.minY;

  let next = { ...el } as ExcalidrawElementLike;
  let changedPos = false;
  let changedScale = false;

  // 1. Shrink if larger than the whole safe area.
  let w = box.w;
  let h = box.h;
  if (w > safeW || h > safeH) {
    const scale = Math.min(safeW / w, safeH / h, 1);
    w = Math.floor(w * scale);
    h = Math.floor(h * scale);
    if (typeof el.width === 'number') next.width = w;
    if (typeof el.height === 'number') next.height = h;
    if (typeof el.maxWidth === 'number') next.maxWidth = Math.min(el.maxWidth, w);
    if (el.type === 'text' && typeof el.fontSize === 'number') {
      next.fontSize = Math.max(14, Math.floor(num(el.fontSize, 24) * scale));
    }
    changedScale = true;
  }

  // 2. Shift inside the edges.
  let x = num(el.x, 0);
  let y = num(el.y, 0);
  if (x < safe.minX) {
    x = safe.minX;
    changedPos = true;
  }
  if (y < safe.minY) {
    y = safe.minY;
    changedPos = true;
  }
  if (x + w > safe.maxX) {
    x = Math.max(safe.minX, safe.maxX - w);
    changedPos = true;
  }
  if (y + h > safe.maxY) {
    y = Math.max(safe.minY, safe.maxY - h);
    changedPos = true;
  }
  if (changedPos) {
    next.x = x;
    next.y = y;
  }

  if (changedScale) report.scaled += 1;
  if (changedPos) report.clamped += 1;
  return next;
}

/** Repair a whole script. Pure — returns a new script plus a change report. */
export function repairScript(script: SceneScript): RepairResult {
  const report: RepairReport = { clamped: 0, scaled: 0, dedupedText: 0, movedOverlaps: 0 };
  const safe = safeAreaFor(script.meta.aspectRatio);

  const scenes = script.scenes.map((scene) => {
    if (!scene.elements || scene.elements.length === 0) return scene;
    let els = dedupeText(scene.elements, report);
    els = separateText(els, report);
    els = els.map((el) => clampToSafe(el, safe, report));
    return { ...scene, elements: els };
  });

  return { script: { ...script, scenes }, report };
}
