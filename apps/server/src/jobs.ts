import { randomUUID } from 'node:crypto';
import { generate } from '@chalkboard/core';
import type { GenerateOptions, ProgressEvent } from '@chalkboard/shared';
import type { Storage } from './storage.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  status: JobStatus;
  progress: ProgressEvent[];
  error?: string;
  outputKey?: string;
  createdAt: string;
  updatedAt: string;
}

export class JobStore {
  private readonly map = new Map<string, Job>();

  create(): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      progress: [],
      createdAt: now,
      updatedAt: now,
    };
    this.map.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.map.get(id);
  }

  setStatus(id: string, status: JobStatus): void {
    const job = this.map.get(id);
    if (!job) return;
    job.status = status;
    job.updatedAt = new Date().toISOString();
  }

  pushProgress(id: string, event: ProgressEvent): void {
    const job = this.map.get(id);
    if (!job) return;
    job.progress.push(event);
    job.updatedAt = new Date().toISOString();
  }

  succeed(id: string, outputKey: string): void {
    const job = this.map.get(id);
    if (!job) return;
    job.status = 'done';
    job.outputKey = outputKey;
    job.updatedAt = new Date().toISOString();
  }

  fail(id: string, error: string): void {
    const job = this.map.get(id);
    if (!job) return;
    job.status = 'error';
    job.error = error;
    job.updatedAt = new Date().toISOString();
  }
}

export interface RunJobInput {
  prompt: string;
  language: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  voice?: string;
}

export async function runJob(
  job: Job,
  store: JobStore,
  storage: Storage,
  input: RunJobInput,
): Promise<void> {
  store.setStatus(job.id, 'running');
  const outputKey = `${job.id}.mp4`;
  const outputPath = await storage.absolutePath(outputKey);

  const opts: GenerateOptions = {
    prompt: input.prompt,
    outputPath,
    language: input.language,
    aspectRatio: input.aspectRatio,
    ...(input.voice ? { voice: input.voice } : {}),
    onProgress: (e) => store.pushProgress(job.id, e),
  };

  await generate(opts);
  store.succeed(job.id, outputKey);
}
