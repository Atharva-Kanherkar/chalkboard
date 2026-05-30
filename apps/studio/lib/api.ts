import type { GenerateOptions, Job } from './types';

// All requests go through Next's /api/* rewrite to the chalkboard server.
export async function createJob(prompt: string, opts: GenerateOptions): Promise<string> {
  const body: Record<string, unknown> = {
    prompt,
    aspectRatio: opts.aspectRatio,
    subtitles: opts.subtitles,
    music: opts.music,
    images: opts.images,
  };
  if (opts.selfCorrect) body.selfCorrect = true;
  if (opts.demo) {
    body.llm = { kind: 'stub' };
    body.tts = { kind: 'stub' };
    body.images = false; // stub script has no image elements anyway
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`server ${res.status}: ${text || 'failed to start job'}`);
  }
  const data = (await res.json()) as { jobId: string };
  return data.jobId;
}

export async function fetchJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`server ${res.status}`);
  return (await res.json()) as Job;
}

export function videoUrl(id: string): string {
  return `/api/jobs/${id}/video`;
}

/** Poll a job to completion, calling `onUpdate` on every change. */
export async function pollJob(
  id: string,
  onUpdate: (job: Job) => void,
  signal?: AbortSignal,
): Promise<Job> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new Error('aborted');
    const job = await fetchJob(id);
    onUpdate(job);
    if (job.status === 'done' || job.status === 'error') return job;
    await new Promise((r) => setTimeout(r, 1200));
  }
}
