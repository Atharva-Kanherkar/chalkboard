// chalkboard scene player. Runs inside headless Chromium under Playwright.
//
// Reads window.__chalkboard__ injected by the renderer process. Renders each
// scene's elements onto a single <canvas> using RoughJS for the hand-drawn
// look. Animates by fading elements in (opacity ramp), staggered, matching the
// pacing of skillware's draw-animation. Audio is muxed post-hoc.
//
// Signals to the host:
//   - logs `[chalkboard] READY` once the canvas is ready and the page has had
//     one paint, so Playwright can start recording.
//   - logs `[chalkboard] DONE` when the last scene finishes, so Playwright
//     can stop.

(() => {
  const cfg = window.__chalkboard__;
  if (!cfg) {
    console.error('[chalkboard] missing window.__chalkboard__');
    return;
  }

  const canvas = document.getElementById('canvas');
  canvas.width = cfg.canvas.width;
  canvas.height = cfg.canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[chalkboard] failed to get 2D context');
    return;
  }

  // Wait for RoughJS to be available.
  const waitFor = (test, label, timeoutMs = 10000) =>
    new Promise((resolve, reject) => {
      const start = performance.now();
      (function spin() {
        if (test()) return resolve();
        if (performance.now() - start > timeoutMs) {
          return reject(new Error(`[chalkboard] timed out waiting for ${label}`));
        }
        setTimeout(spin, 16);
      })();
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // -------- drawing primitives --------
  function paintBg() {
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function rcFor() {
    return window.rough.canvas(canvas);
  }

  function fillStyleFor(el) {
    const fs = el.fillStyle;
    if (fs === 'solid') return 'solid';
    if (fs === 'cross-hatch') return 'cross-hatch';
    if (fs === 'zigzag') return 'zigzag';
    if (fs === 'dots') return 'dots';
    return 'hachure';
  }

  function commonOpts(el, alpha) {
    const stroke = el.strokeColor || '#1e1e1e';
    const fill =
      el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined;
    const opts = {
      stroke,
      strokeWidth: el.strokeWidth || 2,
      roughness: typeof el.roughness === 'number' ? el.roughness : 1,
      seed: el.seed || hashSeed(el.id || ''),
    };
    if (fill) {
      opts.fill = fill;
      opts.fillStyle = fillStyleFor(el);
    }
    return opts;
  }

  function hashSeed(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  function drawRect(rc, el) {
    rc.rectangle(el.x, el.y, el.width, el.height, commonOpts(el));
  }

  function drawEllipse(rc, el) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    rc.ellipse(cx, cy, el.width, el.height, commonOpts(el));
  }

  function drawDiamond(rc, el) {
    const x = el.x;
    const y = el.y;
    const w = el.width;
    const h = el.height;
    const pts = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ];
    rc.polygon(pts, commonOpts(el));
  }

  function drawLine(rc, el) {
    const pts = el.points || [
      [0, 0],
      [el.width || 100, el.height || 0],
    ];
    const opts = commonOpts(el);
    delete opts.fill; // never fill a line
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      rc.line(el.x + a[0], el.y + a[1], el.x + b[0], el.y + b[1], opts);
    }
  }

  function drawArrow(rc, el) {
    drawLine(rc, el);
    // Arrowhead at the last point.
    const pts = el.points || [
      [0, 0],
      [el.width || 100, el.height || 0],
    ];
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2] || [0, 0];
    const tipX = el.x + last[0];
    const tipY = el.y + last[1];
    const dx = last[0] - prev[0];
    const dy = last[1] - prev[1];
    const angle = Math.atan2(dy, dx);
    const headLen = 22;
    const spread = Math.PI / 7;
    const opts = commonOpts(el);
    delete opts.fill;
    rc.line(
      tipX,
      tipY,
      tipX - headLen * Math.cos(angle - spread),
      tipY - headLen * Math.sin(angle - spread),
      opts,
    );
    rc.line(
      tipX,
      tipY,
      tipX - headLen * Math.cos(angle + spread),
      tipY - headLen * Math.sin(angle + spread),
      opts,
    );
  }

  function drawText(el) {
    const fontSize = el.fontSize || 24;
    const family = el.fontFamily === 2 ? 'Helvetica, Arial, sans-serif' : "'Virgil', cursive";
    ctx.fillStyle = el.strokeColor || '#1e1e1e';
    ctx.font = `${fontSize}px ${family}`;
    ctx.textBaseline = 'top';
    const lines = String(el.text || '').split('\n');
    const lineHeight = fontSize * 1.25;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], el.x, el.y + i * lineHeight);
    }
  }

  function drawElement(rc, el) {
    switch (el.type) {
      case 'rectangle':
        return drawRect(rc, el);
      case 'ellipse':
        return drawEllipse(rc, el);
      case 'diamond':
        return drawDiamond(rc, el);
      case 'line':
        return drawLine(rc, el);
      case 'arrow':
        return drawArrow(rc, el);
      case 'text':
        return drawText(el);
      default:
        // Unknown type → skip silently.
        return undefined;
    }
  }

  // -------- animation --------
  function easeOutCubic(t) {
    const c = Math.min(1, Math.max(0, t));
    return 1 - (1 - c) ** 3;
  }

  /**
   * Re-paint the canvas showing element `i` at progress `p` and all prior
   * elements fully drawn. Implemented by painting everything into an offscreen
   * canvas at full opacity, then blitting with globalAlpha for the current
   * element.
   */
  function paintScene(elements, currentIdx, currentProgress) {
    paintBg();
    const rc = rcFor();
    for (let j = 0; j < elements.length; j++) {
      const el = elements[j];
      if (j < currentIdx) {
        ctx.globalAlpha = 1;
        drawElement(rc, el);
      } else if (j === currentIdx) {
        ctx.globalAlpha = easeOutCubic(currentProgress);
        drawElement(rc, el);
      }
      // j > currentIdx: invisible — skip entirely.
    }
    ctx.globalAlpha = 1;
  }

  function rafLoop(durationMs, onTick) {
    return new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        onTick(t);
        if (t >= 1) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  async function playScene(scene, timing) {
    const elements = Array.isArray(scene.elements) ? scene.elements : [];
    // Clear board.
    paintBg();

    if (elements.length === 0) {
      await sleep(timing.durationMs);
      return;
    }

    const stagger = timing.staggerMs;
    const drawDur = timing.drawDurationMs;
    for (let i = 0; i < elements.length; i++) {
      await rafLoop(drawDur, (t) => paintScene(elements, i, t));
      // Fix this element fully painted, advance.
      paintScene(elements, i + 1, 0); // makes [0..i] all 'prior' = fully drawn
      const isLast = i === elements.length - 1;
      if (!isLast && stagger > drawDur) await sleep(stagger - drawDur);
    }

    // Hold tail: visuals already final; just wait until scene duration is up.
    const usedMs = (elements.length - 1) * Math.max(stagger, drawDur) + drawDur;
    const remaining = Math.max(0, timing.durationMs - usedMs);
    if (remaining > 0) await sleep(remaining);
  }

  async function run() {
    try {
      await waitFor(() => typeof window.rough !== 'undefined', 'roughjs', 8000);
    } catch (err) {
      console.error(err.message);
      // Keep going with no rough — at least text scenes will render.
    }
    paintBg();
    // Give the document a paint to make sure the canvas is on screen before
    // recording starts.
    await sleep(150);
    console.log('[chalkboard] READY');

    for (let i = 0; i < cfg.script.scenes.length; i++) {
      const scene = cfg.script.scenes[i];
      const timing = cfg.timings[i];
      console.log(`[chalkboard] scene ${i + 1}/${cfg.script.scenes.length}`);
      await playScene(scene, timing);
    }

    console.log('[chalkboard] DONE');
    window.__chalkboard_done__ = true;
  }

  run().catch((err) => {
    console.error('[chalkboard] player error:', err && err.message ? err.message : err);
  });
})();
