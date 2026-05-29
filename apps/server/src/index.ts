// HTTP API. In-memory job queue, local-fs storage. Designed to be replaced
// piecemeal (queue adapter, storage adapter) later — keep the contracts small.
//
//   POST /generate          { prompt, language?, aspectRatio?, voice? } -> { jobId }
//   GET  /jobs/:id          -> { status, progress[], outputUrl?, error? }
//   GET  /jobs/:id/video    -> 200 video/mp4 if done, 404 otherwise
//   GET  /healthz           -> { ok: true }

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
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
    body['aspectRatio'] === '9:16' || body['aspectRatio'] === '1:1'
      ? body['aspectRatio']
      : '16:9';
  const voice = typeof body['voice'] === 'string' ? body['voice'] : undefined;

  const job = jobs.create();
  // Fire and forget; the worker updates job state in-place.
  void runJob(job, jobs, storage, {
    prompt,
    language,
    aspectRatio,
    ...(voice ? { voice } : {}),
  }).catch((err) => {
    jobs.fail(job.id, err instanceof Error ? err.message : String(err));
  });

  return c.json({ jobId: job.id, status: job.status }, 202);
});

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
