# Diagram Library Research for Chalkboard

Survey of open-source programmatic diagram libraries / DSLs that an LLM can emit text for, renderable headlessly (or convertible into Excalidraw skeletons) without forcing the LLM to compute pixel coordinates.

Today chalkboard speaks Excalidraw JSON + Mermaid. The gap: data structures, neural nets, rich state machines, code, charts, math, timing.

---

## Candidates

### 1. D2 (Terrastruct)

- **License:** MPL 2.0
- **Input:** Indentation-light DSL (`a -> b: label`)
- **Output:** SVG (PNG/PDF via CLI)
- **Strong at:** Software architecture, nested containers, sequence diagrams, classes, SQL tables, grid layouts, multi-board "layers/scenarios" (animation-friendly)
- **LLM friendliness:** High. Syntax is shorter and more consistent than Mermaid; auto-layout via dagre/ELK/TALA so the LLM never names coordinates. Token-efficient benchmarks rank D2 alongside Mermaid for generation accuracy.
- **Integration cost:** Low-medium. `@terrastruct/d2` ships D2 compiled to WASM with web workers; both Node and browser. Renders to SVG that headless Chromium can rasterize. We can also walk the SVG to map shapes to Excalidraw skeletons for the hand-drawn aesthetic.
- **Snippet:**
  ```
  users -> api: GET /me
  api -> db: SELECT
  db -> api -> users: 200
  ```

### 2. Mermaid (extended types)

- **License:** MIT
- **Input:** DSL per diagram type
- **Output:** SVG
- **Strong at:** Beyond what we already use — `sankey`, `timeline`, `mindmap`, `block-beta`, `packet-beta`, `quadrantChart`, `xychart-beta`, `treemap`, `architecture-beta`, expanded `stateDiagram-v2`. Covers many gap cases without leaving the format we already convert.
- **LLM friendliness:** Highest — models are heavily trained on it. Caveat: minor syntax drift between versions; LLMs frequently emit slightly stale grammar for newer diagram types.
- **Integration cost:** Zero marginal — already wired. We just need to add the new types to the system prompt and confirm `@excalidraw/mermaid-to-excalidraw` supports them (currently flowchart/sequence/class only; others would need SVG passthrough).
- **Snippet:**
  ```
  packet-beta
    0-7: "Src Port"
    8-15: "Dst Port"
  ```

### 3. Graphviz / DOT (via @hpcc-js/wasm-graphviz)

- **License:** EPL 1.0 (Graphviz); wrapper Apache 2.0
- **Input:** DOT language
- **Output:** SVG (also JSON layout with `-Tjson`)
- **Strong at:** Trees, linked lists (HTML-like `record` / `Mrecord` nodes are _perfect_ for hash buckets and struct visualization), large directed graphs, neural-net layers, computation DAGs.
- **LLM friendliness:** Very high. DOT is decades old, in every model's training corpus, and stable. Record nodes are an underused superpower for data-structure visualization.
- **Integration cost:** Low. `@hpcc-js/wasm-graphviz` runs fully in browser/Node. The `json` output gives us node positions, so we can convert to Excalidraw skeletons cleanly (no SVG scraping). Best single-shot win for data structures.
- **Snippet:**
  ```
  digraph { node [shape=record]
    h [label="<0>|<1>42|<2>|<3>7"]; }
  ```

### 4. Excalidraw Element Skeleton API (deeper use)

- **License:** MIT
- **Input:** `ExcalidrawElementSkeleton[]` JSON — simplified element schema with auto-binding for arrows, containers, frames
- **Output:** Native Excalidraw elements via `convertToExcalidrawElements()`
- **Strong at:** Anything we want to draw natively — but specifically: side-by-side comparisons, freeform annotated layouts, anything where we need progressive reveal (we already animate these).
- **LLM friendliness:** Medium-high. Lower than DSLs because the LLM still authors `x/y` for top-level groupings, but `frame` + `containerId` + `boundElements` collapse a lot of arithmetic. We can wrap it in a "lane" helper (rows/columns) the LLM targets symbolically.
- **Integration cost:** Zero — this is the home format. Underused today: frames, image elements, arrow binding by id, magic `start`/`end` references between elements.
- **Snippet:**
  ```js
  [
    { type: 'rectangle', id: 'a', label: { text: 'User' } },
    { type: 'arrow', start: { id: 'a' }, end: { id: 'b' } },
  ];
  ```

### 5. Vega-Lite

- **License:** BSD-3
- **Input:** JSON grammar of graphics
- **Output:** SVG or Canvas via `vega-embed`
- **Strong at:** Bar / pie / line / scatter / heatmap / area — exactly the "10x faster" claim charts. Declarative encoding ⇒ no coordinates.
- **LLM friendliness:** High; Databricks, OpenAI Code Interpreter, and Claude all reliably emit valid Vega-Lite. Compact, JSON-schema-validatable — failure mode is "spec rejected" rather than "diagram looks wrong".
- **Integration cost:** Low. `vega-embed` runs in browser/headless Chromium. SVG output is easy to splice next to Excalidraw frames. Not worth converting to Excalidraw shapes — keep it as a rasterized "chart panel".
- **Snippet:**
  ```json
  { "mark": "bar", "encoding": { "x": { "field": "lang" }, "y": { "field": "ms" } } }
  ```

### 6. WaveDrom

- **License:** MIT
- **Input:** WaveJSON (compact JSON describing signals)
- **Output:** SVG
- **Strong at:** Digital timing diagrams, register/bitfield layouts. Fills the _timing diagram_ gap completely.
- **LLM friendliness:** High. WaveJSON is small, regular, JSON — easy to validate.
- **Integration cost:** Low. Pure-JS, npm `wavedrom`, drop-in SVG. Niche but uniquely capable.
- **Snippet:**
  ```json
  {
    "signal": [
      { "name": "clk", "wave": "p....." },
      { "name": "data", "wave": "x.34.x", "data": ["A", "B"] }
    ]
  }
  ```

### 7. Cytoscape.js

- **License:** MIT
- **Input:** JSON `{nodes, edges}` + style sheet
- **Output:** Canvas / SVG
- **Strong at:** Force-directed graphs, large networks, computation graphs, state machines with rich styling, neural-net layers when graphviz `record` isn't enough.
- **LLM friendliness:** High — plain JSON list of nodes/edges, no coordinates needed; layouts (`cose`, `dagre`, `breadthfirst`, `concentric`) handle placement.
- **Integration cost:** Medium — programmatic API, not a DSL, so we'd wrap it. Headless rendering works but Cytoscape is canvas-first; PNG snapshot is one call.
- **Snippet:**
  ```js
  {nodes:[{data:{id:"a"}},{data:{id:"b"}}],
   edges:[{data:{source:"a",target:"b"}}]}
  ```

### 8. nomnoml

- **License:** MIT; **Input:** tiny DSL `[A]->[B]`; **Output:** SVG/Canvas. UML with a designed look; LLMs handle it easily. Pure JS, trivial integration — but largely redundant with Mermaid `classDiagram` and D2 classes. Low priority.

### 9. TikZJax

- **License:** GPL-ish (TeX) + MIT (wrapper)
- **Input:** TikZ / LaTeX
- **Output:** SVG (via WASM TeX → DVI → SVG)
- **Strong at:** Geometric proofs, commutative diagrams, polished math figures, circuit diagrams.
- **LLM friendliness:** High _content_, medium _reliability_ — LLMs write fluent TikZ but errors are common and hard to recover from.
- **Integration cost:** Heavy — multi-megabyte WASM bundle, slow first paint (1–3s warmup). Best as a sidecar service, not inline. `node-tikzjax` exists for server-side.
- **Snippet:** `\draw (0,0) circle (1); \draw (-1,0) -- (1,0);`

### 10. Shiki (+ transformers)

- **License:** MIT
- **Input:** Source code + language id + optional line annotations
- **Output:** HTML/SVG with TextMate-accurate highlighting
- **Strong at:** Syntax-highlighted code blocks with line highlighting, diff markers, focus regions, callouts.
- **LLM friendliness:** Trivial — LLM emits code + a list of line numbers / notes.
- **Integration cost:** Low. Pure JS, runs in browser. Render to SVG (`shiki` has `codeToHast`), embed as image element in Excalidraw, then layer arrow callouts via the skeleton API. This is the single best answer to "code with line-by-line annotation".
- **Snippet:** `codeToHtml("for x in xs:\n  ...", {lang:"python", transformers:[transformerNotationHighlight()]})`

### 11. PlantUML (plantuml-core / CheerpJ)

- **License:** GPL/LGPL — be careful for embedded use. PlantUML DSL → SVG. Most-trained DSL after Mermaid, so very LLM-friendly. Heavy: browser build via CheerpJ is ~10MB and slow; most teams hit a remote server. License is a real constraint for an OSS project others may embed.

### 12. Manim (community)

- **License:** MIT; **Input:** Python `Scene.construct`; **Output:** MP4 (renders animation itself). Best-in-class math output. LLMs write fluent Manim but runtime errors are frequent (Manimator paper documents the failure modes; planner+coder pipeline needed). **Integration cost: high** — Python sidecar with FFmpeg/Cairo, 30s+ per scene, would break the single-process prompt→mp4 model. Long-tail premium path only.

### Also considered, not recommended now

- **Structurizr DSL** (Apache 2.0) — excellent for C4 software architecture but Java-only renderer; you'd need to ship the JVM or rely on a server. D2 + Mermaid cover the same use cases in JS.
- **Penrose** (MIT, Substance/Style/Domain) — beautiful math diagrams but the DSL is three coupled languages; LLMs don't know it well, and the solver is heavy. Watch, don't adopt.
- **Roughr / Rough.js** — already a transitive dep via Excalidraw; not a diagram source, just a renderer style.
- **roughViz** — fun hand-drawn charts but Vega-Lite is more flexible and equally compact.

---

## Recommendation (opinionated)

Adopt in this order:

1. **Graphviz DOT via `@hpcc-js/wasm-graphviz`.** Biggest immediate win. Record-shape nodes unlock linked lists, trees, hash buckets, neural network layers, computation graphs — most of the "programming/learning explainer" wishlist — using a DSL every LLM already speaks fluently. JSON layout output makes Excalidraw skeleton conversion clean, so the hand-drawn style is preserved. Lowest risk per unit of new capability.

2. **Shiki + Excalidraw frame/skeleton callouts.** Code with syntax highlighting and line-by-line annotation is a top-3 use case for any _programming_ explainer and we currently have nothing. Shiki SVG embedded as an image, with arrows bound to virtual line anchors via the skeleton API, is a half-day integration that ships a marquee feature.

3. **Vega-Lite for chart panels and WaveDrom for timing.** Both are tiny, JSON-input, headless-friendly, and each owns a category (charts / timing) the other tools handle poorly. Pair them because the integration shape is identical: LLM emits a JSON spec, we render to SVG, we splice it into the canvas as an image element.

Hold on D2 until #1–#3 ship — it overlaps with the architecture-diagram capability Mermaid already gives us. Skip Manim, PlantUML, TikZJax, and Penrose for v1: each has either a license, a bundle-size, or an LLM-reliability tax that's not worth paying yet. Lean harder on Mermaid's newer diagram types (`packet-beta`, `block-beta`, `timeline`, `sankey`, `mindmap`) — that's free capability we already render.
