// HTTP API. In-memory job queue, local-fs storage. Designed to be replaced
// piecemeal (queue adapter, storage adapter) later — keep the contracts small.
//
//   POST /generate          { prompt, language?, aspectRatio?, voice? } -> { jobId }
//   GET  /jobs/:id          -> { status, progress[], outputUrl?, error? }
//   GET  /jobs/:id/video    -> 200 video/mp4 if done, 404 otherwise
//   GET  /healthz           -> { ok: true }

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LLMProviderConfig, TTSProviderConfig } from '@chalkboard/shared';
import { JobStore, runJob, type Job } from './jobs.js';
import { LocalFsStorage } from './storage.js';

const port = Number(process.env['PORT'] ?? 4140);
const host = process.env['HOST'] ?? '0.0.0.0';
const storage = new LocalFsStorage(process.env['STORAGE_DIR'] ?? './out');
const jobs = new JobStore();

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true, name: 'chalkboard' }));

app.post('/generate', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const prompt = typeof body['prompt'] === 'string' ? body['prompt'].trim() : '';
  if (!prompt) return c.json({ error: 'prompt is required' }, 400);

  const language = typeof body['language'] === 'string' ? body['language'] : 'en';
  const aspectRatio =
    body['aspectRatio'] === '9:16' || body['aspectRatio'] === '1:1' ? body['aspectRatio'] : '16:9';
  const voice = typeof body['voice'] === 'string' ? body['voice'] : undefined;
  const llm = parseLLMProvider(body['llm']);
  const tts = parseTTSProvider(body['tts']);

  const job = jobs.create();
  // Fire and forget; the worker updates job state in-place.
  void runJob(job, jobs, storage, {
    prompt,
    language,
    aspectRatio,
    ...(voice ? { voice } : {}),
    ...(llm ? { llm } : {}),
    ...(tts ? { tts } : {}),
  }).catch((err) => {
    jobs.fail(job.id, err instanceof Error ? err.message : String(err));
  });

  return c.json({ jobId: job.id, status: job.status }, 202);
});

// Provider config pass-through. Server is meant for a private network; if you
// expose this publicly, validate kinds, deny api-key fields, and add auth.
const LLM_KINDS = new Set(['anthropic', 'openai', 'ollama', 'stub']);
const TTS_KINDS = new Set(['piper', 'openai', 'elevenlabs', 'stub']);

function parseLLMProvider(value: unknown): LLMProviderConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj['kind'] !== 'string' || !LLM_KINDS.has(obj['kind'])) return undefined;
  return obj as unknown as LLMProviderConfig;
}

function parseTTSProvider(value: unknown): TTSProviderConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj['kind'] !== 'string' || !TTS_KINDS.has(obj['kind'])) return undefined;
  return obj as unknown as TTSProviderConfig;
}

app.get('/jobs/:id', (c) => {
  const job = jobs.get(c.req.param('id'));
  if (!job) return c.json({ error: 'not found' }, 404);
  return c.json(toJSON(job));
});

app.get('/jobs/:id/video', async (c) => {
  const job = jobs.get(c.req.param('id'));
  if (!job || !job.outputKey) return c.json({ error: 'not ready' }, 404);
  const stream = await storage.openReadable(job.outputKey);
  if (!stream) return c.json({ error: 'gone' }, 410);
  return new Response(stream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `inline; filename="${job.id}.mp4"`,
    },
  });
});

// Serve the static web UI at /, fallback to the API. Path resolves to
// apps/web/public from the server's source dir (and post-build dist dir).
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolveWebRoot(here);
if (webRoot) {
  app.use(
    '/*',
    serveStatic({
      root: webRoot,
      rewriteRequestPath: (p) => (p === '/' ? '/index.html' : p),
    }),
  );
  console.log(`chalkboard web UI served from ${webRoot}`);
} else {
  console.log('chalkboard: no web UI dir found, serving API only');
}

function resolveWebRoot(serverSrcDir: string): string | null {
  const candidates = [
    resolve(serverSrcDir, '../../web/public'),
    resolve(serverSrcDir, '../../../apps/web/public'),
    resolve(process.cwd(), 'apps/web/public'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`chalkboard server listening on http://${info.address}:${info.port}`);
});

function toJSON(job: Job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error ?? null,
    outputUrl: job.outputKey ? `/jobs/${job.id}/video` : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
