# feat-handdrawn-stroke-draw — Test Contract

Goal: **opt-in** hand-drawn animation. When a user asks for it (`--draw` →
`meta.animation: 'draw'`), diagrams are **drawn in real time** — strokes
progressively traced onto the board like a "draw my life" video. Without it, the
**default stays the classic opacity fade-in**, unchanged from before. Core change
is in `packages/renderer/page/player.js`; the switch is plumbed CLI → core → meta.

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
9. **Opt-in switch.** `--draw` (CLI) → `GenerateOptions.animation` → core sets
   `script.meta.animation = 'draw'`; the player reads it. Default (omitted) ==
   `'fade'` == today's behavior, byte-identical. `timing.ts` unchanged
   (`DEFAULT_DRAW_MS` stays 540); draw mode finishes tracing at ~0.8 of the
   window so it feels livelier without changing scene length / narration sync.
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

- `packages/renderer/src/timing.test.ts` — unchanged; `DEFAULT_DRAW_MS` stays 540.

## Integration / Functional Tests

- `pnpm --filter @chalkboard/renderer build` (or repo typecheck) passes — no TS
  breakage from the timing change.
- `pnpm --filter @chalkboard/renderer test` passes.

## Smoke Tests

- **Default-fade parity.** With no `--draw` (animation omitted), a smoke render
  must show elements **fading in whole** (classic look), not tracing — confirmed by
  pulling a mid-window frame from the real mp4.
- **Visual spike (the key gate).** A Playwright harness (scene tagged
  `animation: 'draw'`) loads `page/index.html` with a synthetic one-scene script
  holding a hachure rectangle, a solid ellipse, an arrow-with-label, and multi-line
  text, then captures PNGs across progress (rect at
  0.35/0.7, arrow at 0.5/0.95, text at 0.4/0.8, plus the final frame). The
  `svg`/`image`/`highlight` reveal paths just keep the old fade and are not separately
  exercised here (lowest-risk, unchanged behavior). Assertions (by eye, screenshots
  read in-session): shapes are partially drawn mid-progress (not just dim); no
  double-drawn/re-traced outline; text shows only the left portion of each line
  mid-progress; the arrowhead is absent until the shaft is nearly complete; and the
  final frame is visually equivalent to today's.
- Existing renderer smoke (`packages/renderer/scripts/smoke.ts`) still produces a
  playable mp4 — frames pulled from the real mp4 show the title writing on, the
  rectangle tracing edge-by-edge then filling, and the arrow shaft drawing.

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
