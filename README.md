# chalkboard

> Open-source whiteboard-style explainer videos. Prompt → mp4.

`chalkboard` turns a prompt like _"explain hash tables"_ into a short
whiteboard-style explainer video — narration, hand-drawn diagrams, multiple
scenes, downloaded as an mp4. It's designed for programming/learning content,
runs entirely on your own machine, and falls back to free local providers
(Ollama + Piper TTS) so the marginal cost per video can be zero.

It's a self-hostable counterpart to closed offerings like Simi/Lamina Labs —
fewer voices, less polish, but yours to fork, embed, and bill for.

```
prompt                 → "explain hash tables"
  llm (any provider)   → SceneScript JSON
  tts (any provider)   → audio per scene
  renderer (Playwright)→ silent webm
  ffmpeg               → final mp4
```

## Quickstart

```bash
# 0. system deps
#   - node >= 20, pnpm
#   - ffmpeg + ffprobe on PATH
#   - (optional) piper for local TTS

git clone https://github.com/<you>/chalkboard
cd chalkboard
pnpm install
pnpm --filter @chalkboard/renderer exec playwright install chromium

# 1. dry-run with stubs (no API keys, no piper)
pnpm --filter chalkboard start generate "explain hash tables" \
  --llm stub --tts stub -o out.mp4

# 2. real run with Anthropic + Piper
export ANTHROPIC_API_KEY=...
# piper model: download e.g.
# https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
export PIPER_MODEL=/path/to/en_US-lessac-medium.onnx
pnpm --filter chalkboard start generate "explain hash tables" -o out.mp4
```

## Project layout

```
packages/
  shared/      types (SceneScript, GenerateOptions, ProgressEvent)
  whiteboard/  pure helpers (draw animation, element normalization)
  llm/         LLMProvider + Anthropic/OpenAI/Ollama/Stub adapters
  narration/   TTSProvider + Piper/OpenAI/ElevenLabs/Stub adapters
  renderer/    Playwright headless Chromium + ffmpeg mux
  core/        generate() orchestrator
apps/
  cli/         `chalkboard generate ...`
  server/      HTTP API: POST /generate, GET /jobs/:id, GET /jobs/:id/video
```

## Configuration

### LLM provider

| kind        | env / setup                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------- |
| `anthropic` | `ANTHROPIC_API_KEY` (default model: `claude-haiku-4-5`)                                      |
| `openai`    | `OPENAI_API_KEY`                                                                             |
| `ollama`    | `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `llama3.1:8b`) |
| `stub`      | none — returns a fixed SceneScript, for tests                                                |

Auto-resolution order: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `ollama`.
Force a provider with `--llm <kind>` or `CHALKBOARD_LLM=stub`.

### TTS provider

| kind         | env / setup                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| `piper`      | `piper` on PATH, `PIPER_MODEL` (or `PIPER_MODEL_<LANG>`) to a `.onnx` voice |
| `openai`     | `OPENAI_API_KEY` (default model `tts-1`, voice `alloy`)                     |
| `elevenlabs` | `ELEVENLABS_API_KEY`                                                        |
| `stub`       | none — emits a sine-wave WAV, for tests                                     |

## Usage

### CLI

```bash
# Render a video
chalkboard generate "explain pointers" \
  --lang en --aspect 16:9 \
  --llm anthropic --tts piper \
  -o pointers.mp4

# Just dump the SceneScript JSON (no render — useful for prompt iteration)
chalkboard script "explain pointers" --llm anthropic > script.json
```

Run `chalkboard --help` for the full flag list.

### Library

```ts
import { generate } from '@chalkboard/core';

await generate({
  prompt: 'explain hash tables',
  outputPath: './hash-tables.mp4',
  language: 'en',
  aspectRatio: '16:9',
  llm: { kind: 'anthropic' },
  tts: { kind: 'piper' },
  onProgress: (e) => console.log(e),
});
```

### HTTP service

```bash
pnpm --filter @chalkboard/server start
# → chalkboard server listening on http://0.0.0.0:4140

curl -X POST http://localhost:4140/generate \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "explain pointers",
    "llm": { "kind": "anthropic" },
    "tts": { "kind": "piper" }
  }'
# → { "jobId": "...", "status": "running" }

curl http://localhost:4140/jobs/$ID            # poll
curl http://localhost:4140/jobs/$ID/video -o out.mp4
```

The default storage backend writes to `./out`; configure with `STORAGE_DIR`.
The default port is 4140 (`PORT`).

### SceneScript

The contract between LLM and renderer is a typed JSON document:

```jsonc
{
  "version": "1",
  "meta": { "language": "en", "aspectRatio": "16:9", "title": "Hash Tables" },
  "scenes": [
    {
      "id": "scene-1",
      "narration": "A hash table maps keys to values...",
      "elements": [
        {
          "id": "s1-rect",
          "type": "rectangle",
          "x": 200,
          "y": 200,
          "width": 400,
          "height": 80,
          "strokeColor": "#1e1e1e",
          "backgroundColor": "#a5d8ff",
          "fillStyle": "solid",
        },
        {
          "id": "s1-text",
          "type": "text",
          "x": 220,
          "y": 220,
          "text": "hash(key)",
          "fontSize": 32,
          "fontFamily": 1,
        },
      ],
    },
  ],
}
```

Allowed element types: `rectangle`, `ellipse`, `diamond`, `line`, `arrow`,
`text`. Elements appear progressively (opacity ramp, staggered) while the
narration plays; visual timing stretches to match audio.

## Smoke tests

```bash
# Pure-logic tests (parse, timing, normalize, draw)
pnpm test

# Renderer smoke (hardcoded SceneScript → mp4) — ~10 sec
pnpm --filter @chalkboard/renderer smoke

# Full pipeline smoke (stub LLM + stub TTS → mp4) — ~6 sec
pnpm --filter @chalkboard/core smoke
```

## Costs (approximate)

| Setup                          | Per-video cost |
| ------------------------------ | -------------- |
| Ollama (local) + Piper (local) | $0             |
| Claude Haiku + Piper           | ~$0.0002       |
| Claude Haiku + OpenAI TTS      | ~$0.002        |
| Claude Sonnet + ElevenLabs     | $0.05–0.20     |

The 3–5 min wall-clock per video on a modest VPS is dominated by Playwright
recording the canvas in real time. There is no way to make it 20 seconds with
this architecture; we trade speed for portability and the absence of a render
farm.

## How this compares

|                     | Simi (Lamina Labs)   | chalkboard                                  |
| ------------------- | -------------------- | ------------------------------------------- |
| License             | closed               | MIT                                         |
| Self-host           | no                   | yes                                         |
| Cost per video      | paid                 | $0 with local stack                         |
| Speed (3 min video) | ~20 sec              | ~3 min                                      |
| Languages           | 70+                  | depends on TTS (Piper: ~50; OpenAI: 50+)    |
| Best for            | marketing explainers | programming/learning content, OSS embedding |

## Status

Early. The pipeline works end-to-end and is testable in CI via the stub
providers. Real-world quality is gated on prompt tuning and asset vocabulary,
not on the rendering plumbing — see `packages/llm/src/prompt.ts`.

## License

[MIT](./LICENSE)
