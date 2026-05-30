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

  // -------- empty-scene fallback --------

  const KNOWN_TYPES = new Set([
    'rectangle',
    'ellipse',
    'diamond',
    'line',
    'arrow',
    'text',
    'code-block',
    'step-marker',
    'group',
    'highlight',
    'image',
    'svg',
  ]);

  // Decide whether a scene has at least one visible thing to draw. We accept
  // any element whose type the renderer knows AND which has some meaningful
  // content — non-zero size for shapes, non-empty text for text, etc.
  function hasRenderableContent(elements) {
    if (!Array.isArray(elements) || elements.length === 0) return false;
    for (const el of elements) {
      if (!el || !KNOWN_TYPES.has(el.type)) continue;
      if (el.type === 'text') {
        if (String(el.text || '').trim().length > 0) return true;
        continue;
      }
      if (el.type === 'arrow' || el.type === 'line') {
        // arrows with from/to resolve later; assume valid
        if (el.from && el.to) return true;
        if (Array.isArray(el.points) && el.points.length >= 2) return true;
        if ((el.width || 0) > 1 || (el.height || 0) > 1) return true;
        continue;
      }
      if (el.type === 'image') {
        // A generated image with a source and a box is renderable.
        if ((el.src || el.dataUrl) && (el.width || 0) > 1 && (el.height || 0) > 1) return true;
        continue;
      }
      if (el.type === 'svg') {
        const hasArt =
          (typeof el.svg === 'string' && el.svg.trim()) || typeof el.motif === 'string';
        if (hasArt && (el.width || 0) > 1 && (el.height || 0) > 1) return true;
        continue;
      }
      // shapes
      if ((el.width || 0) > 1 && (el.height || 0) > 1) return true;
    }
    return false;
  }

  // -------- image preload --------
  // Generated images arrive as data URLs on `image` elements. Decode them all
  // up front (before recording) so drawing never blocks on a half-loaded image.
  // A tiny library of reusable vector motifs (simple geometric silhouettes) the
  // model can drop in by name without writing SVG. MIT/CC0 — authored here.
  const MOTIFS = {
    star: 'M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z',
    bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
    heart:
      'M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.2 5c2 0 3.3 1.1 4 2.2C9.8 6.1 11.2 5 13.2 5 16.3 5 18 8.4 16.4 11.7 13.9 16.4 12 21 12 21z',
    check: 'M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z',
    cross:
      'M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z',
    sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1l2 3h-4zM12 23l-2-3h4zM1 12l3-2v4zM23 12l-3 2v-4zM4 4l3 1-2 2zM20 4l-1 3-2-2zM4 20l1-3 2 2zM20 20l-3-1 2-2z',
    cloud: 'M19 18H7a5 5 0 01-.5-9.97A6 6 0 0118 8.5a4.5 4.5 0 011 8.9z',
    gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2.1-.6c-.1-.5-.3-1-.5-1.5l1.1-1.9-1.9-1.9-1.9 1.1c-.5-.2-1-.4-1.5-.5L13.5 3h-2.6L10.3 5c-.5.1-1 .3-1.5.5L6.9 4.4 5 6.3l1.1 1.9c-.2.5-.4 1-.5 1.5L3.5 11v2.6l2.1.6c.1.5.3 1 .5 1.5l-1.1 1.9 1.9 1.9 1.9-1.1c.5.2 1 .4 1.5.5l.6 2.1h2.6l.6-2.1c.5-.1 1-.3 1.5-.5l1.9 1.1 1.9-1.9-1.1-1.9c.2-.5.4-1 .5-1.5L21 13.5z',
    lightbulb: 'M9 21h6v-1H9zm3-19a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z',
    database:
      'M12 2c-4.4 0-8 1.3-8 3v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 1.1 6 1s-2.1 1-6 1-6-1.1-6-1 2.1-1 6-1z',
    'arrow-right': 'M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z',
  };
  function motifSvg(name, color) {
    const path = MOTIFS[name];
    if (!path) return null;
    const fill = color || '#1e1e1e';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}"><path d="${path}"/></svg>`;
  }

  const imageCache = {};
  function imageSrc(el) {
    if (!el) return undefined;
    // `svg` elements carry inline markup OR a named motif; either way we turn it
    // into a data URL and decode it exactly like a generated image (no deps).
    if (el.type === 'svg') {
      let markup = typeof el.svg === 'string' && el.svg.trim() ? el.svg : null;
      if (!markup && typeof el.motif === 'string') markup = motifSvg(el.motif, el.color);
      if (!markup) return undefined;
      try {
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
      } catch (e) {
        return undefined;
      }
    }
    return el.src || el.dataUrl;
  }
  async function preloadImages(script) {
    const srcs = [];
    for (const scene of script.scenes || []) {
      for (const el of scene.elements || []) {
        if (el && (el.type === 'image' || el.type === 'svg') && imageSrc(el) && el.id) {
          srcs.push(el);
        }
      }
    }
    await Promise.all(
      srcs.map(
        (el) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              imageCache[el.id] = img;
              resolve();
            };
            img.onerror = () => {
              console.warn('[chalkboard] image failed to load: %s', el.id);
              resolve();
            };
            img.src = imageSrc(el);
          }),
      ),
    );
  }

  // Build a minimal "title card" from a scene's narration so the canvas
  // never goes blank. Picks the first sentence (or first 90 chars), drawn
  // centered horizontally near the top.
  function synthesizeNarrationFallback(scene) {
    const raw = String(scene && scene.narration ? scene.narration : '').trim();
    if (!raw) return [];
    const firstSentence = raw.split(/(?<=[.!?])\s+/)[0] || raw.slice(0, 90);
    const text = firstSentence.length > 140 ? firstSentence.slice(0, 137) + '…' : firstSentence;
    const id = (scene && scene.id ? scene.id : 'fallback') + '-fallback-title';
    return [
      {
        id,
        type: 'text',
        x: 160,
        y: 420,
        text,
        fontSize: 44,
        fontFamily: 1,
        strokeColor: '#1e1e1e',
        maxWidth: 1600,
        textAlign: 'center',
      },
    ];
  }

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

  function commonOpts(el) {
    const stroke = el.strokeColor || '#1e1e1e';
    const fill =
      el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined;
    const opts = {
      stroke,
      strokeWidth: el.strokeWidth || 2,
      roughness: typeof el.roughness === 'number' ? el.roughness : 1,
      seed: el.seed || hashSeed(el.id || ''),
    };
    if (el.strokeStyle === 'dashed') {
      opts.strokeLineDash = [12, 8];
    } else if (el.strokeStyle === 'dotted') {
      opts.strokeLineDash = [2, 8];
    }
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

  // Bounding-box center for an element (defaults if width/height missing).
  function centerOf(el) {
    const w = el.width || 0;
    const h = el.height || 0;
    return { x: (el.x || 0) + w / 2, y: (el.y || 0) + h / 2 };
  }

  // Where a ray from `from` towards `to` exits the bounding box of `from`.
  // For rectangles/diamonds we use axis-aligned bbox edges; for ellipses we
  // approximate with the ellipse boundary along the ray. This gets arrows to
  // touch shapes cleanly without coordinate math from the LLM.
  function exitPoint(el, towards) {
    const c = centerOf(el);
    const dx = towards.x - c.x;
    const dy = towards.y - c.y;
    if (dx === 0 && dy === 0) return c;
    const w = (el.width || 0) / 2;
    const h = (el.height || 0) / 2;

    if (el.type === 'ellipse') {
      // Solve for t where ((dx*t)/w)^2 + ((dy*t)/h)^2 = 1
      const denom = Math.sqrt((dx * dx) / (w * w || 1) + (dy * dy) / (h * h || 1));
      const t = 1 / denom;
      return { x: c.x + dx * t, y: c.y + dy * t };
    }

    // Rect / diamond / default: intersect the ray with the rect edges.
    const tx = w === 0 ? Infinity : Math.abs(w / dx);
    const ty = h === 0 ? Infinity : Math.abs(h / dy);
    const t = Math.min(tx, ty);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }

  function drawArrow(rc, el, byId) {
    const opts = commonOpts(el);
    delete opts.fill;

    // If from/to are set, look them up and compute endpoints at the edges
    // of each shape facing the other. This lets the LLM omit coordinates
    // entirely for an arrow between two named shapes.
    let startX, startY, tipX, tipY;
    if (el.from && el.to && byId && byId[el.from] && byId[el.to]) {
      const fromEl = byId[el.from];
      const toEl = byId[el.to];
      const fromExit = exitPoint(fromEl, centerOf(toEl));
      const toExit = exitPoint(toEl, centerOf(fromEl));
      startX = fromExit.x;
      startY = fromExit.y;
      tipX = toExit.x;
      tipY = toExit.y;
      rc.line(startX, startY, tipX, tipY, opts);

      // Optional label sitting halfway along the arrow.
      if (el.label) {
        const fontSize = el.labelFontSize || 22;
        ctx.fillStyle = el.strokeColor || '#1e1e1e';
        ctx.font = `${fontSize}px ${familyFor({ fontFamily: 1 })}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        // Slightly offset the label off the line so it doesn't overlap.
        const mx = (startX + tipX) / 2;
        const my = (startY + tipY) / 2 - fontSize * 0.9;
        ctx.fillText(String(el.label), mx, my);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
    } else {
      drawLine(rc, el);
      const pts = el.points || [
        [0, 0],
        [el.width || 100, el.height || 0],
      ];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2] || [0, 0];
      tipX = (el.x || 0) + last[0];
      tipY = (el.y || 0) + last[1];
      startX = (el.x || 0) + prev[0];
      startY = (el.y || 0) + prev[1];
    }

    // Arrowhead at (tipX, tipY) pointing in direction (tipX-startX, tipY-startY).
    const angle = Math.atan2(tipY - startY, tipX - startX);
    const headLen = 22;
    const spread = Math.PI / 7;
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

  // -------- expanded vocabulary --------

  function drawCodeBlock(rc, el) {
    // Sketchy background panel + monospace text. The element behaves like a
    // rectangle that holds its own multi-line code.
    const width = el.width || 600;
    const height = el.height || estimateCodeHeight(el);
    const bgEl = {
      ...el,
      type: 'rectangle',
      width,
      height,
      strokeColor: el.strokeColor || '#1e1e1e',
      backgroundColor: el.backgroundColor || '#f1f3f5',
      fillStyle: el.fillStyle || 'solid',
      roughness: typeof el.roughness === 'number' ? el.roughness : 0.5,
    };
    rc.rectangle(bgEl.x, bgEl.y, bgEl.width, bgEl.height, commonOpts(bgEl));

    // Code text, drawn directly (no wrap — code authors decide their own
    // line breaks). Monospace family picked by familyFor() via type.
    const fontSize = el.fontSize || 22;
    ctx.fillStyle = el.textColor || '#1e1e1e';
    ctx.font = `${fontSize}px ${familyFor(el)}`;
    ctx.textBaseline = 'top';
    const lineHeight = fontSize * 1.35;
    const padX = el.paddingX || 24;
    const padY = el.paddingY || 18;
    const lines = String(el.text || el.code || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], el.x + padX, el.y + padY + i * lineHeight);
    }
  }

  function estimateCodeHeight(el) {
    const fontSize = el.fontSize || 22;
    const lineHeight = fontSize * 1.35;
    const padY = el.paddingY || 18;
    const lines = String(el.text || el.code || '').split('\n').length;
    return Math.max(80, padY * 2 + lines * lineHeight);
  }

  // Numbered circle that you can drop near a step. el.n is the displayed
  // number; el.x/y is the center.
  function drawStepMarker(rc, el) {
    const r = el.radius || 28;
    const cx = el.x + r;
    const cy = el.y + r;
    rc.circle(cx, cy, r * 2, {
      ...commonOpts(el),
      fill: el.backgroundColor || '#ffec99',
      fillStyle: el.fillStyle || 'solid',
    });
    const fontSize = el.fontSize || Math.round(r * 0.95);
    ctx.fillStyle = el.strokeColor || '#1e1e1e';
    ctx.font = `bold ${fontSize}px ${familyFor({ fontFamily: 1 })}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(String(el.n ?? '1'), cx, cy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  // Labeled container: a thin-bordered rectangle with an optional title
  // floating above the top-left corner.
  function drawGroup(rc, el) {
    rc.rectangle(el.x, el.y, el.width || 200, el.height || 200, {
      ...commonOpts(el),
      strokeWidth: el.strokeWidth || 1.5,
    });
    if (el.label) {
      const fontSize = el.fontSize || 22;
      ctx.fillStyle = el.strokeColor || '#1e1e1e';
      ctx.font = `${fontSize}px ${familyFor({ fontFamily: 1 })}`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText(String(el.label), el.x + 8, el.y - 6);
      ctx.textBaseline = 'top';
    }
  }

  // Translucent rectangle painted UNDER content — use it to draw attention to
  // a region of the canvas. No border, no roughness, just a soft color band.
  function drawHighlight(el) {
    const prevComp = ctx.globalCompositeOperation;
    // multiply makes the highlight act like a marker pen — content underneath
    // stays visible but tinted.
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = el.backgroundColor || '#fff3a8';
    ctx.fillRect(el.x, el.y, el.width || 200, el.height || 40);
    ctx.globalCompositeOperation = prevComp;
  }

  function familyFor(el) {
    if (el.fontFamily === 2) return 'Helvetica, Arial, sans-serif';
    if (el.fontFamily === 3 || el.type === 'code-block') {
      return "'JetBrains Mono', 'Fira Code', 'Menlo', monospace";
    }
    return "'Virgil', cursive";
  }

  // Width available for a text element, derived from explicit maxWidth, or
  // from a container element looked up by `containerId`, or null (no wrap).
  function maxWidthFor(el, byId) {
    if (typeof el.maxWidth === 'number') return el.maxWidth;
    if (el.containerId && byId && byId[el.containerId]) {
      const parent = byId[el.containerId];
      if (typeof parent.width === 'number') {
        const pad = typeof el.padding === 'number' ? el.padding : 24;
        return Math.max(40, parent.width - 2 * pad);
      }
    }
    return null;
  }

  // Break a single token that is wider than maxWidth into character chunks that
  // each fit. Without this, a long word (URL, identifier, hashed key) bleeds
  // past the box edge — the #1 horizontal text-overflow bug.
  function breakWord(word, maxWidth) {
    if (ctx.measureText(word).width <= maxWidth) return [word];
    const chunks = [];
    let current = '';
    for (const ch of String(word)) {
      const test = current + ch;
      if (current && ctx.measureText(test).width > maxWidth) {
        chunks.push(current);
        current = ch;
      } else {
        current = test;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // Word-wrap a single logical line to fit within `maxWidth` px on canvas
  // context `ctx`. Hard newlines are honored beforehand (caller splits).
  function wrapLine(text, maxWidth) {
    if (!maxWidth) return [text];
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines = [];
    let current = '';
    for (const word of words) {
      // A word too wide on its own is split into hard chunks first.
      const pieces = breakWord(word, maxWidth);
      for (let k = 0; k < pieces.length; k++) {
        const piece = pieces[k];
        if (!current) {
          current = piece;
          continue;
        }
        const test = current + ' ' + piece;
        // Pieces from a broken word continue on their own lines.
        const sameWord = k > 0;
        if (!sameWord && ctx.measureText(test).width <= maxWidth) {
          current = test;
        } else {
          lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawText(el, byId) {
    const fontSize = el.fontSize || 24;
    const family = familyFor(el);
    ctx.fillStyle = el.strokeColor || '#1e1e1e';
    ctx.font = `${fontSize}px ${family}`;
    ctx.textBaseline = 'top';

    const maxWidth = maxWidthFor(el, byId);
    const align = el.textAlign || 'left';
    const lineHeight = fontSize * 1.25;

    // Hard newlines, then soft-wrap each piece.
    const logical = String(el.text || '').split('\n');
    const lines = [];
    for (const piece of logical) {
      const wrapped = wrapLine(piece, maxWidth);
      for (const w of wrapped) lines.push(w);
    }

    // If text is anchored to a container, center vertically within it when
    // requested via verticalAlign='middle'. Otherwise y is the top anchor.
    let y0 = el.y;
    if (el.containerId && byId && byId[el.containerId]) {
      const parent = byId[el.containerId];
      const parentTop = parent.y ?? el.y;
      const parentH = parent.height ?? 0;
      if (el.verticalAlign === 'middle') {
        const blockH = lines.length * lineHeight;
        y0 = parentTop + Math.max(0, (parentH - blockH) / 2);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x = el.x;
      if (align !== 'left' && maxWidth) {
        const w = ctx.measureText(line).width;
        if (align === 'center') x = el.x + (maxWidth - w) / 2;
        else if (align === 'right') x = el.x + (maxWidth - w);
      }
      ctx.fillText(line, x, y0 + i * lineHeight);
    }
  }

  // Draw a generated image with object-fit: cover into (x,y,w,h), clipped to
  // rounded corners. Honors the current globalAlpha (set by the fade-in).
  function drawImageEl(el) {
    const img = imageCache[el.id];
    const x = el.x || 0;
    const y = el.y || 0;
    const w = el.width || 0;
    const h = el.height || 0;
    if (w <= 0 || h <= 0) return;

    if (!img) {
      // Source missing/failed — draw a soft placeholder box so the slot still
      // reads as intentional rather than a blank gap.
      ctx.save();
      ctx.fillStyle = '#e9ecef';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      return;
    }

    const radius = typeof el.borderRadius === 'number' ? el.borderRadius : 16;
    ctx.save();
    roundedRectPath(x, y, w, h, radius);
    ctx.clip();
    // cover-fit
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // subtle frame
    ctx.save();
    ctx.globalAlpha = Math.min(1, (ctx.globalAlpha ?? 1) * 0.5);
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 2;
    roundedRectPath(x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();
  }

  function roundedRectPath(x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // Draw a decoded inline SVG with object-fit: contain (never crop vector art),
  // centered in the box. No frame — SVG motifs sit directly on the whiteboard.
  function drawSvgEl(el) {
    const img = imageCache[el.id];
    const x = el.x || 0;
    const y = el.y || 0;
    const w = el.width || 0;
    const h = el.height || 0;
    if (w <= 0 || h <= 0 || !img || !img.width || !img.height) return;
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function drawElement(rc, el, byId) {
    switch (el.type) {
      case 'image':
        return drawImageEl(el);
      case 'svg':
        return drawSvgEl(el);
      case 'rectangle':
        return drawRect(rc, el);
      case 'ellipse':
        return drawEllipse(rc, el);
      case 'diamond':
        return drawDiamond(rc, el);
      case 'line':
        return drawLine(rc, el);
      case 'arrow':
        return drawArrow(rc, el, byId);
      case 'text':
        return drawText(el, byId);
      case 'code-block':
        return drawCodeBlock(rc, el);
      case 'step-marker':
        return drawStepMarker(rc, el);
      case 'group':
        return drawGroup(rc, el);
      case 'highlight':
        return drawHighlight(el);
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

  // -------- captions --------
  // Per-scene cue list + the wall-clock time the scene started, set by
  // playScene. drawCaptionOverlay() picks the active cue and draws it
  // bottom-center with an outline so it stays legible over any drawing.
  let captionCues = [];
  let captionSceneStart = 0;

  function captionWrap(text, maxWidth, font) {
    ctx.font = font;
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [String(text)];
  }

  function drawCaptionOverlay() {
    if (!captionCues || captionCues.length === 0) return;
    const elapsed = performance.now() - captionSceneStart;
    const cue = captionCues.find((c) => elapsed >= c.startMs && elapsed < c.endMs);
    if (!cue || !cue.text) return;

    const W = canvas.width;
    const H = canvas.height;
    const portrait = H > W;
    // Vertical reels: slightly larger captions, lifted clear of the TikTok/IG
    // bottom UI (caption bar, buttons) which covers the lowest ~15%.
    const fontSize = Math.round((portrait ? W : H) * 0.045);
    const font = `600 ${fontSize}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;
    const maxWidth = W * 0.84;
    const lines = captionWrap(cue.text, maxWidth, font).slice(0, 3);
    const lineHeight = fontSize * 1.28;
    const marginBottom = Math.round(H * (portrait ? 0.16 : 0.06));

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.18));
    const cx = W / 2;
    let baseY = H - marginBottom - (lines.length - 1) * lineHeight;
    for (const line of lines) {
      ctx.strokeStyle = 'rgba(20,20,20,0.95)';
      ctx.strokeText(line, cx, baseY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, cx, baseY);
      baseY += lineHeight;
    }
    ctx.restore();
  }

  /**
   * Re-paint the canvas showing element `i` at progress `p` and all prior
   * elements fully drawn. Implemented by painting everything into an offscreen
   * canvas at full opacity, then blitting with globalAlpha for the current
   * element.
   */
  function paintScene(elements, currentIdx, currentProgress, byId) {
    paintBg();
    const rc = rcFor();
    for (let j = 0; j < elements.length; j++) {
      const el = elements[j];
      if (j < currentIdx) {
        ctx.globalAlpha = 1;
        drawElement(rc, el, byId);
      } else if (j === currentIdx) {
        ctx.globalAlpha = easeOutCubic(currentProgress);
        drawElement(rc, el, byId);
      }
      // j > currentIdx: invisible — skip entirely.
    }
    ctx.globalAlpha = 1;
    drawCaptionOverlay();
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

  // Repaint `paintFn` every frame for `ms` (instead of a blind sleep) so the
  // caption overlay keeps advancing during holds and inter-element gaps.
  function holdRepaint(ms, paintFn) {
    if (ms <= 0) return Promise.resolve();
    return rafLoop(ms, () => paintFn());
  }

  async function playScene(scene, timing, cues) {
    let elements = Array.isArray(scene.elements) ? scene.elements : [];

    // Arm captions for this scene; the overlay reads these on every paint.
    captionCues = Array.isArray(cues) ? cues : [];
    captionSceneStart = performance.now();

    // Defense-in-depth: if the LLM produced a scene with no usable elements,
    // synthesize a title from the narration so we never leak a fully blank
    // canvas to the recording. Detection: zero elements, OR every element is
    // an unknown type / has zero size / lacks the minimum fields we need.
    if (!hasRenderableContent(elements)) {
      console.warn(
        '[chalkboard] scene "%s" has no renderable elements; falling back to narration title',
        scene.id || '?',
      );
      elements = synthesizeNarrationFallback(scene);
    }

    // Clear board.
    paintBg();

    if (elements.length === 0) {
      // Truly empty (no narration even). Hold the canvas; captions (if any)
      // still advance via the repaint loop.
      await holdRepaint(timing.durationMs, () => {
        paintBg();
        drawCaptionOverlay();
      });
      return;
    }

    // Build an id → element lookup so text can resolve containerId and
    // arrows can resolve from/to targets without rescanning.
    const byId = {};
    for (const el of elements) {
      if (el && el.id) byId[el.id] = el;
    }

    const stagger = timing.staggerMs;
    const drawDur = timing.drawDurationMs;
    for (let i = 0; i < elements.length; i++) {
      await rafLoop(drawDur, (t) => paintScene(elements, i, t, byId));
      // Fix this element fully painted, advance.
      paintScene(elements, i + 1, 0, byId); // [0..i] all 'prior' = fully drawn
      const isLast = i === elements.length - 1;
      if (!isLast && stagger > drawDur) {
        await holdRepaint(stagger - drawDur, () => paintScene(elements, i + 1, 0, byId));
      }
    }

    // Hold tail: visuals already final; keep repainting so captions advance.
    const usedMs = (elements.length - 1) * Math.max(stagger, drawDur) + drawDur;
    const remaining = Math.max(0, timing.durationMs - usedMs);
    await holdRepaint(remaining, () => paintScene(elements, elements.length, 0, byId));
  }

  // Paint a scene's *final* drawn state instantly (no animation, no captions).
  // Used by snapshot mode so the self-correct loop can screenshot what a scene
  // actually looks like and have a vision model critique it.
  function paintSceneFinal(i) {
    const scene = cfg.script.scenes[i];
    if (!scene) {
      paintBg();
      return false;
    }
    let elements = Array.isArray(scene.elements) ? scene.elements : [];
    if (!hasRenderableContent(elements)) elements = synthesizeNarrationFallback(scene);
    const byId = {};
    for (const el of elements) if (el && el.id) byId[el.id] = el;
    captionCues = [];
    paintScene(elements, elements.length, 0, byId);
    return true;
  }

  async function run() {
    try {
      await waitFor(() => typeof window.rough !== 'undefined', 'roughjs', 8000);
    } catch (err) {
      console.error(err.message);
      // Keep going with no rough — at least text scenes will render.
    }
    // Decode any generated images before we start recording.
    try {
      await preloadImages(cfg.script);
    } catch (err) {
      console.warn('[chalkboard] image preload error:', err && err.message ? err.message : err);
    }

    // Snapshot mode: expose a painter and stop. The host drives screenshots.
    if (cfg.snapshot) {
      window.chalkboardPaintScene = (i) => paintSceneFinal(i);
      paintBg();
      await sleep(100);
      console.log('[chalkboard] READY');
      return;
    }

    paintBg();
    // Give the document a paint to make sure the canvas is on screen before
    // recording starts.
    await sleep(150);
    console.log('[chalkboard] READY');

    const captions = Array.isArray(cfg.captions) ? cfg.captions : [];
    for (let i = 0; i < cfg.script.scenes.length; i++) {
      const scene = cfg.script.scenes[i];
      const timing = cfg.timings[i];
      console.log(`[chalkboard] scene ${i + 1}/${cfg.script.scenes.length}`);
      await playScene(scene, timing, captions[i]);
    }

    console.log('[chalkboard] DONE');
    window.__chalkboard_done__ = true;
  }

  run().catch((err) => {
    console.error('[chalkboard] player error:', err && err.message ? err.message : err);
  });
})();
