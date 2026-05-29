# Examples

Each subdirectory is a self-contained example: a hand-authored `script.json`
(SceneScript) plus the rendered `output.mp4`. They serve two purposes:

1. **Visual regression**: re-render a known-good script and diff against the
   committed mp4 to catch renderer regressions.
2. **Prompt iteration reference**: a worked example of what a SceneScript
   that produces a watchable explainer actually looks like, so you can shape
   prompts to land in that distribution.

To re-render an example:

```bash
pnpm --filter @chalkboard/renderer exec tsx \
  ../../examples/render-script.ts examples/hash-tables/script.json \
  examples/hash-tables/output.mp4
```
