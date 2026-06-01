# Contributing to chalkboard

Thanks for your interest in improving chalkboard! This is a small, friendly
open-source project — issues, ideas, and pull requests are all welcome.

## Getting set up

```bash
git clone https://github.com/Atharva-Kanherkar/chalkboard
cd chalkboard
pnpm install
pnpm --filter @chalkboard/renderer exec playwright install chromium
```

System prerequisites: **Node ≥ 20.6**, **pnpm**, and **ffmpeg + ffprobe** on
your `PATH`. No API keys are needed to develop or run the test suite — the stub
providers (`--llm stub --tts stub`) generate a real mp4 with zero cost.

## The monorepo

chalkboard is a pnpm workspace. The packages are layered so changes stay local:

```
packages/  shared · whiteboard · llm · narration · research · renderer · core
apps/      cli · server · studio · web
```

See [README.md → Project layout](./README.md#project-layout) for what each one
owns.

## Before you open a PR

Run the same checks CI runs:

```bash
pnpm -r typecheck     # strict TypeScript across every package
pnpm test             # unit tests (vitest)
pnpm format:check     # prettier
```

Auto-fix formatting with `pnpm format`. To sanity-check the whole pipeline
end to end (no API keys, ~6s), run the smoke test:

```bash
pnpm --filter @chalkboard/core smoke
```

## Guidelines

- **Match the surrounding code.** Keep the style, naming, and comment density
  consistent with the file you're editing.
- **Add tests** for new logic where it's practical — most packages have
  `*.test.ts` files alongside the source.
- **Keep PRs focused.** One change per PR is easier to review and land.
- **Don't commit generated media or secrets.** `dist/`, `node_modules/`,
  rendered `*.mp4` outputs, and `.env` are gitignored — keep them that way.
- **Write a clear PR description** of what changed and why. Screenshots or a
  short clip help a lot for anything that affects the rendered output.

## Reporting bugs

Open an issue with the prompt/command you ran, the providers in use (e.g.
`--llm anthropic --tts piper`), your OS, and what you expected vs. what
happened. For render issues, attaching the output mp4 or a screenshot is gold.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
