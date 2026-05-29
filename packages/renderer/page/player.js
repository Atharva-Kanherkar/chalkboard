// chalkboard scene player. Runs inside headless Chromium under Playwright.
//
// Reads `window.__chalkboard__` injected by the renderer process:
//   { script: SceneScript,
//     timings: SceneTiming[],
//     canvas: { width, height },
//     readyMarker: 'CHALKBOARD_READY',
//     doneMarker: 'CHALKBOARD_DONE' }
//
// Plays through each scene by mounting an Excalidraw instance and progressively
// fading elements in (opacity-only animation matching skillware's tutor feel).
// Audio is muxed post-hoc — this file does NOT play audio; it just controls the
// visual timeline so the recorded video matches the audio durations the
// renderer planned.
//
// Signals to the host:
//   - logs `[chalkboard] READY` once the canvas is mounted and the first frame
//     is painted, so Playwright can start recording.
//   - logs `[chalkboard] DONE` once the last scene finishes, so Playwright can
//     stop recording.

(() => {
  const cfg = window.__chalkboard__;
  if (!cfg) {
    console.error('[chalkboard] missing window.__chalkboard__');
    return;
  }

  const { ExcalidrawLib } = window;
  // The Excalidraw UMD build exposes a global `ExcalidrawLib` (React component
  // factory) and `Excalidraw` (the component itself). Names changed across
  // versions; try the modern shape first, fall back to legacy.
  const Excalidraw =
    (ExcalidrawLib && (ExcalidrawLib.Excalidraw || ExcalidrawLib.default)) ||
    window.Excalidraw ||
    null;
  if (!Excalidraw) {
    console.error('[chalkboard] Excalidraw global not found');
    return;
  }

  const root = ReactDOM.createRoot(document.getElementById('canvas-host'));
  let api = null;

  // Mount Excalidraw with viewMode (no UI). The `excalidrawAPI` callback gives
  // us imperative control over the scene.
  const host = document.getElementById('canvas-host');
  host.style.width = cfg.canvas.width + 'px';
  host.style.height = cfg.canvas.height + 'px';

  const initialData = {
    elements: [],
    appState: {
      viewBackgroundColor: '#fafafa',
      currentItemRoughness: 1,
      currentItemFontFamily: 1,
      gridSize: null,
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
    },
  };

  root.render(
    React.createElement(Excalidraw, {
      initialData,
      viewModeEnabled: true,
      zenModeEnabled: true,
      gridModeEnabled: false,
      UIOptions: {
        canvasActions: {
          changeViewBackgroundColor: false,
          clearCanvas: false,
          export: false,
          loadScene: false,
          saveAsImage: false,
          saveToActiveFile: false,
          theme: false,
          toggleTheme: false,
        },
      },
      excalidrawAPI: (a) => {
        api = a;
      },
    }),
  );

  // ---------- animation helpers (mirrors skillware/draw-animation.ts) ----------
  let nonceSeed = 1;
  const nextNonce = () => ((nonceSeed = (nonceSeed + 1) % 2_000_000_000), nonceSeed);
  const easeOutCubic = (t) => {
    const c = Math.min(1, Math.max(0, t));
    return 1 - (1 - c) ** 3;
  };

  function drawSnapshot(el, p) {
    const eased = easeOutCubic(p);
    const targetOpacity = typeof el.opacity === 'number' ? el.opacity : 100;
    return {
      ...el,
      opacity: Math.max(0, Math.round(targetOpacity * eased)),
      version: (el.version ?? 1) + Math.ceil(p * 1000) + 1,
      versionNonce: nextNonce(),
    };
  }

  function finalSnapshot(el) {
    return {
      ...el,
      opacity: typeof el.opacity === 'number' ? el.opacity : 100,
      version: (el.version ?? 1) + 1002,
      versionNonce: nextNonce(),
    };
  }

  function normalizeElement(el) {
    const norm = {
      opacity: 100,
      roughness: 1,
      strokeColor: '#1e1e1e',
      ...el,
    };
    if (el.type === 'text') {
      norm.textAlign = norm.textAlign ?? 'left';
      norm.verticalAlign = norm.verticalAlign ?? 'top';
      norm.fontFamily = norm.fontFamily ?? 1;
      norm.fontSize = norm.fontSize ?? 24;
      norm.lineHeight = norm.lineHeight ?? 1.25;
    }
    if (el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') {
      const points = el.points;
      if (!Array.isArray(points) || points.length < 2) {
        const w = el.width || 100;
        const h = typeof el.height === 'number' ? el.height : 0;
        norm.points = [
          [0, 0],
          [w, h],
        ];
      }
    }
    return norm;
  }

  // ---------- mermaid → elements (optional) ----------
  async function renderMermaidToElements(code) {
    try {
      const [{ parseMermaidToExcalidraw }, exc] = await Promise.all([
        import('https://unpkg.com/@excalidraw/mermaid-to-excalidraw@1.1.1/dist/index.es.js'),
        import(
          'https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/excalidraw.production.min.js'
        ),
      ]);
      const { elements } = await parseMermaidToExcalidraw(code, {
        themeVariables: { fontSize: '20px' },
      });
      const converted = exc.convertToExcalidrawElements(elements);
      return converted.map((el) => ({
        ...el,
        roughness: 1,
        fontFamily: el.type === 'text' ? 1 : el.fontFamily,
      }));
    } catch (err) {
      console.warn('[chalkboard] mermaid render failed, skipping:', err);
      return [];
    }
  }

  // ---------- sleep / RAF loop ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function rafLoop(durationMs, onTick) {
    return new Promise((resolveLoop) => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / durationMs);
        onTick(t);
        if (t >= 1) {
          resolveLoop();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  // ---------- main playback ----------
  async function waitForApi() {
    while (!api) await sleep(16);
    return api;
  }

  async function playScene(scene, timing) {
    const a = await waitForApi();
    // Resolve elements (mermaid scenes turn into elements on first play).
    let elements = scene.elements ?? [];
    if (!elements.length && scene.mermaid) {
      elements = await renderMermaidToElements(scene.mermaid);
    }
    elements = elements.map(normalizeElement).map((el) => ({ ...el, opacity: 0 }));

    // Clear board, put placeholders in (all at opacity 0).
    a.updateScene({ elements });
    // Pan/zoom to fit, then lock view.
    try {
      a.scrollToContent(elements, { fitToContent: true, animate: false });
    } catch {
      /* older versions silently noop */
    }

    // Reveal each element in sequence.
    const stagger = timing.staggerMs;
    const drawDur = timing.drawDurationMs;
    for (let i = 0; i < elements.length; i++) {
      const target = elements[i];
      await rafLoop(drawDur, (t) => {
        const updated = elements.map((el, idx) => {
          if (idx < i) return finalSnapshot(el);
          if (idx === i) return drawSnapshot(target, t);
          return el; // still invisible
        });
        a.updateScene({ elements: updated });
      });
      const isLast = i === elements.length - 1;
      if (!isLast && stagger > drawDur) {
        await sleep(stagger - drawDur);
      }
    }

    // Ensure final state is set, then hold.
    a.updateScene({ elements: elements.map(finalSnapshot) });

    const elapsedMs =
      elements.length === 0
        ? 0
        : (elements.length - 1) * Math.max(stagger, drawDur) + drawDur;
    const remaining = Math.max(0, timing.durationMs - elapsedMs);
    await sleep(remaining);
  }

  async function run() {
    await waitForApi();
    // Mark READY once API and an initial paint are ready.
    await sleep(120);
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

  // Kick off, but give React a few frames to mount first.
  setTimeout(run, 250);
})();
