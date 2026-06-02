# feat-handdrawn-stroke-draw — Test Contract

Goal: diagrams should look **drawn in real time** — strokes progressively traced
onto the board like a "draw my life" video — instead of the current opacity
fade-in. A little faster than today. Core change is in
`packages/renderer/page/player.js`; pacing knob in `packages/renderer/src/timing.ts`.

## Functional Behavior

1. **Progressive stroke reveal.** During an element's draw window, its RoughJS
   outline strokes are revealed _along their length_ (pen-drawing look), not faded
   in via opacity. Implemented with `Path2D` + `ctx.setLineDash` + `lineDashOffset`.
2. **No re-trace artifact.** RoughJS traces each outline ~twice (multi-stroke).
   Each subpath (split at every `move` op) reveals **in parallel** on the same
   progress `p`, so the pen never finishes then visibly re-traces the same shape.
   Multi-stroke stays ON — final geometry/seeds unchanged from today.
3. **Lengths from ops.** Per-subpath length is computed from the generator ops
   (line segments exact; bezier `bcurveTo` sampled), NOT via detached
   `SVGPathElement.getTotalLength()`.
4. **Per-element caching.** The RoughJS Drawable, its subpath `Path2D`s, and their
   lengths are generated **once per element (keyed by id)** and reused every frame.
   Rough geometry is never regenerated inside the RAF loop (no flicker, no perf cliff).
5. **Fills.** `path`/stroke OpSets reveal with the dash; `fillSketch`/`fill*` OpSets
   draw with `globalAlpha = ease(p)` so fill materializes as the outline completes.
6. **Text** reveals with a **per-line left-to-right clip wipe**, lines in reading
   order across the draw window (line k reveals over its slice). No single
   block-wide clip (would reveal stacked line-middles simultaneously).
7. **Arrows.** The shaft reveals progressively; the **arrowhead and any label are
   drawn last** (after the shaft reaches the tip, p ≳ 0.85), not concurrently.
8. **Images / SVG / highlight.** `image` and `svg` keep the opacity fade (cannot be
   stroke-drawn); `highlight` stays a marker band (alpha ramps with p). Unchanged feel.
9. **Speed.** `DEFAULT_DRAW_MS` reduced `540 → 420` (steady, uniform per shape).
   Stagger / audio-sync budget in `timing.ts` otherwise unchanged.
10. **Final-state parity.** `paintSceneFinal` (snapshot mode → vision self-correct)
    and the scene tail-hold render the fully-revealed state (p=1): strokes fully
    drawn, fills full alpha, text fully shown — visually identical end-state to
    today so the vision critic is not disturbed.
11. **Cinematic untouched.** `playCinematicScene` (Ken Burns) is not modified.
12. **No new dependencies.** Uses the CDN RoughJS already loaded; no npm additions.

## Unit Tests

The animation code is browser-only (`player.js`, no module system, runs under
Playwright) so it has no existing unit harness. The pure geometry helper is the one
piece worth isolating conceptually, but extracting it to a tested module is out of
scope for this PR. Covered instead by the spike + visual review below.

- `packages/renderer/src/timing.test.ts` — existing tests must still pass with
  `DEFAULT_DRAW_MS = 420` (any test asserting the old 540 default is updated to 420).

## Integration / Functional Tests

- `pnpm --filter @chalkboard/renderer build` (or repo typecheck) passes — no TS
  breakage from the timing change.
- `pnpm --filter @chalkboard/renderer test` passes.

## Smoke Tests

- **Visual spike (the key gate).** A Playwright harness loads `page/index.html` with
  a synthetic one-scene script (rectangle + ellipse + arrow-with-label + multi-line
  text + an svg motif) and captures PNGs at progress p ≈ 0.0, 0.35, 0.7, 1.0.
  Assertions (by eye, screenshots read in-session):
  - p=0.35 / 0.7: shapes are **partially drawn** (strokes mid-reveal), not just dim.
  - No double-drawn/re-traced outline visible.
  - Text shows only the left portion of each line at mid-progress.
  - Arrowhead absent until the shaft is nearly complete.
  - p=1.0 frame is visually equivalent to today's final frame (parity).
- Existing renderer smoke (`packages/renderer/scripts/smoke.ts`) still produces a
  playable mp4.

## E2E Tests

- N/A for automated E2E. Manual end-to-end: render a real short video and confirm
  the diagrams visibly draw themselves in sync with narration.

## Manual / cURL Tests

No HTTP surface. Manual steps:

```bash
# Build
pnpm -w build  # or: pnpm --filter @chalkboard/renderer build

# Run the visual spike harness (added in scripts/), inspect the PNGs it writes
pnpm --filter @chalkboard/renderer exec tsx scripts/draw-spike.ts

# Existing smoke render still works
pnpm --filter @chalkboard/renderer exec tsx scripts/smoke.ts
```
