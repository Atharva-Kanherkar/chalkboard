// DOT → chalkboard elements via @hpcc-js/wasm-graphviz.
//
// The LLM emits a "graphviz" element containing a DOT string and a target
// bounding box. We run Graphviz's `dot` layout, parse the JSON output, and
// fan out each node into a rectangle/ellipse (with label text inside) and
// each edge into an arrow that uses from/to ids — so all the rest of the
// rendering pipeline (progressive draw, hand-drawn aesthetic, alpha ramps)
// applies unchanged.
//
// Key conventions for the input element:
//
//   {
//     "id": "g1",
//     "type": "graphviz",
//     "dot": "digraph { a [label=\"head\"]; b [label=\"42\"]; a -> b; }",
//     "x": 200, "y": 200, "width": 1520, "height": 700,
//     "nodeFill": "#a5d8ff" // optional default fill
//   }
//
// The output of expandGraphvizElement() is the list of concrete elements
// that *replace* the graphviz element in the scene.

import type { ExcalidrawElementLike, Scene, SceneScript } from '@chalkboard/shared';

interface GraphvizNode {
  _gvid: number;
  name: string;
  /** "x,y" in graphviz points (bottom-left origin). */
  pos?: string;
  /** Inches. */
  width?: string | number;
  height?: string | number;
  shape?: string;
  label?: string;
  /** Fill color from DOT attrs, optional. */
  fillcolor?: string;
  style?: string;
}

interface GraphvizEdge {
  _gvid: number;
  /** _gvid of source / target nodes. */
  tail: number;
  head: number;
  label?: string;
}

interface GraphvizLayout {
  /** "llx,lly,urx,ury" */
  bb?: string;
  objects?: GraphvizNode[];
  edges?: GraphvizEdge[];
}

// Lazy singleton — wasm load is ~200ms, we only want it once per process.
let graphvizPromise: Promise<unknown> | null = null;
async function loadGraphviz(): Promise<{
  layout: (dot: string, fmt: string, engine: string) => string;
}> {
  if (!graphvizPromise) {
    graphvizPromise = (async () => {
      const mod = await import('@hpcc-js/wasm-graphviz');
      const Graphviz = (mod as { Graphviz: { load(): Promise<unknown> } }).Graphviz;
      return Graphviz.load();
    })();
  }
  return graphvizPromise as Promise<{
    layout: (dot: string, fmt: string, engine: string) => string;
  }>;
}

/**
 * Expand every `graphviz` element in a scene into concrete rectangle/
 * ellipse/arrow elements. Non-graphviz elements pass through unchanged.
 */
export async function expandGraphvizInScene(scene: Scene): Promise<Scene> {
  const elements = scene.elements ?? [];
  if (!elements.some((el) => el.type === 'graphviz')) return scene;

  const gv = await loadGraphviz();
  const next: ExcalidrawElementLike[] = [];

  for (const el of elements) {
    if (el.type !== 'graphviz') {
      next.push(el);
      continue;
    }
    try {
      const expanded = await expandOne(gv, el);
      next.push(...expanded);
    } catch (err) {
      // Don't blow up the whole render — leave a placeholder rectangle so
      // the issue is visible in the output, and continue.
      console.error(
        '[graphviz] expansion failed for element',
        el.id,
        err instanceof Error ? err.message : err,
      );
      next.push({
        ...el,
        type: 'rectangle',
        strokeColor: '#c92a2a',
        backgroundColor: '#fff5f5',
        fillStyle: 'solid',
      });
    }
  }

  return { ...scene, elements: next };
}

export async function expandGraphvizInScript(script: SceneScript): Promise<SceneScript> {
  const scenes = await Promise.all(script.scenes.map(expandGraphvizInScene));
  return { ...script, scenes };
}

// --- internals ---

interface ExpansionBox {
  /** Target rect on the chalkboard canvas. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional default fill for nodes that don't supply fillcolor. */
  nodeFill?: string;
  /** Prefix for synthesized ids so multiple graphviz elements don't collide. */
  idPrefix: string;
}

async function expandOne(
  gv: { layout: (dot: string, fmt: string, engine: string) => string },
  el: ExcalidrawElementLike,
): Promise<ExcalidrawElementLike[]> {
  const dot = String(el['dot'] || '').trim();
  if (!dot) return [];

  const target: ExpansionBox = {
    x: typeof el.x === 'number' ? el.x : 120,
    y: typeof el.y === 'number' ? el.y : 120,
    width: typeof el.width === 'number' ? el.width : 1680,
    height: typeof el.height === 'number' ? el.height : 840,
    nodeFill: typeof el['nodeFill'] === 'string' ? (el['nodeFill'] as string) : undefined,
    idPrefix: el.id || `gv-${Math.random().toString(36).slice(2, 8)}`,
  };

  const raw = gv.layout(dot, 'json', 'dot');
  const layout = JSON.parse(raw) as GraphvizLayout;
  if (!layout.bb) return [];

  const bb = layout.bb.split(',').map(Number);
  if (bb.length !== 4) return [];
  const [llx, lly, urx, ury] = bb as [number, number, number, number];
  const gvW = Math.max(1, urx - llx);
  const gvH = Math.max(1, ury - lly);

  // Uniform scale that fits the entire graph into the target box.
  const scale = Math.min(target.width / gvW, target.height / gvH);
  // Centered translation: extra space split between left/right + top/bottom.
  const ox = target.x + (target.width - gvW * scale) / 2 - llx * scale;
  const oy = target.y + (target.height - gvH * scale) / 2;

  // Graphviz y is bottom-up; canvas y is top-down. Flip relative to ury.
  const flipY = (y: number) => oy + (ury - y) * scale;
  const tx = (x: number) => ox + x * scale;

  const nodeIdByGvid = new Map<number, string>();
  const out: ExcalidrawElementLike[] = [];

  for (const node of layout.objects ?? []) {
    const id = `${target.idPrefix}-${node.name || `n${node._gvid}`}`;
    nodeIdByGvid.set(node._gvid, id);

    const [cxStr, cyStr] = (node.pos || '0,0').split(',');
    const cx = Number(cxStr || 0);
    const cy = Number(cyStr || 0);
    const w = Number(node.width || 0.75) * 72 * scale;
    const h = Number(node.height || 0.5) * 72 * scale;
    const x = tx(cx) - w / 2;
    const y = flipY(cy) - h / 2;

    const label = decodeLabel(node.label, node.name);
    const shapeType = mapShape(node.shape);
    const fill = pickFill(node, target.nodeFill);

    const shapeEl: ExcalidrawElementLike = {
      id,
      type: shapeType,
      x,
      y,
      width: w,
      height: h,
      strokeColor: '#1e1e1e',
      ...(fill ? { backgroundColor: fill, fillStyle: 'solid' } : {}),
      roughness: 1,
    };
    out.push(shapeEl);

    if (label) {
      out.push({
        id: `${id}-label`,
        type: 'text',
        x,
        y,
        text: label,
        fontSize: pickFontSize(w, h, label),
        fontFamily: 1,
        strokeColor: '#1e1e1e',
        containerId: id,
        textAlign: 'center',
        verticalAlign: 'middle',
      });
    }
  }

  for (const edge of layout.edges ?? []) {
    const from = nodeIdByGvid.get(edge.tail);
    const to = nodeIdByGvid.get(edge.head);
    if (!from || !to) continue;
    const id = `${target.idPrefix}-e${edge._gvid}`;
    out.push({
      id,
      type: 'arrow',
      x: 0,
      y: 0,
      from,
      to,
      strokeColor: '#1e1e1e',
      ...(edge.label ? { label: decodeLabel(edge.label, '') } : {}),
    });
  }

  return out;
}

function mapShape(s: string | undefined): string {
  if (!s) return 'rectangle';
  const lower = s.toLowerCase();
  if (lower === 'ellipse' || lower === 'circle' || lower === 'oval') return 'ellipse';
  if (lower === 'diamond') return 'diamond';
  // record / Mrecord / box / box3d / folder / etc → rectangle.
  return 'rectangle';
}

function pickFill(node: GraphvizNode, fallback: string | undefined): string | undefined {
  if (node.fillcolor) return node.fillcolor;
  if (node.style && /filled/i.test(node.style)) return fallback ?? '#a5d8ff';
  return fallback;
}

function pickFontSize(w: number, h: number, label: string): number {
  // Estimate a size that won't overflow horizontally; clamp to a useful range.
  const ideal = Math.min(h * 0.45, (w * 1.6) / Math.max(label.length, 4));
  return Math.max(14, Math.min(48, Math.round(ideal)));
}

function decodeLabel(label: string | undefined, fallback: string): string {
  if (!label) return fallback;
  // Graphviz uses \N as the node-name placeholder; \\n / \\l / \\r for newlines.
  let s = label;
  if (s === '\\N') return fallback;
  s = s.replace(/\\[lrn]/g, '\n');
  s = s.replace(/\\"/g, '"');
  return s.trim();
}
