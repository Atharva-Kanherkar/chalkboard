# Contributing to chalkboard

Thanks for considering a contribution. chalkboard is intentionally small —
the goal is one well-scoped pipeline with swappable parts, not a feature
catalog. Keep that in mind when proposing changes.

## Setup

```bash
pnpm install
pnpm --filter @chalkboard/renderer exec playwright install chromium
# system deps: node >= 20, ffmpeg, ffprobe on PATH
```

## Day-to-day

```bash
pnpm typecheck    # all packages
pnpm test         # unit tests (no Playwright, no network)
pnpm --filter @chalkboard/core smoke   # end-to-end pipeline (stub LLM+TTS)
```

The smoke runs in ~6 seconds on a developer laptop and is the best signal
that a change didn't break the renderer or mux. Always run it before
opening a PR.

## Pull requests

- Keep the change focused. Don't smuggle refactors into feature PRs.
- Add tests for pure-logic changes (parsers, timing, normalization).
- For visual changes, update the renderer smoke or examples/ to demonstrate
  before/after.
- One feature per PR.

## Code style

- Prettier configured at repo root; `pnpm format` to fix.
- TypeScript strict; no `any` except at provider boundaries.
- Don't introduce a new top-level dep unless it replaces something or
  earns its weight.

## Provider adapters

New LLM or TTS provider? Add it as a new module in `packages/{llm,narration}/src/`,
implement the existing `LLMProvider` / `TTSProvider` interface, expose it in
`resolve.ts`, and add the `kind` to `LLMProviderConfig` / `TTSProviderConfig`
in `packages/shared`. Keep the adapter dependency-free where possible
(`fetch` over an SDK) — slim deps make chalkboard easier to embed.

## What we won't merge

- A new renderer (Remotion, Manim, etc.) without a clear performance or
  quality argument backed by numbers.
- Provider-specific features leaking into `@chalkboard/core` — the core
  must stay provider-agnostic.
- Drive-by lockfile churn.

## License

By contributing, you agree your contribution is licensed under MIT.
