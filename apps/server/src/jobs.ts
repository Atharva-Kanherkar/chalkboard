import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { generate } from '@chalkboard/core';
import type {
  GenerateOptions,
  LLMProviderConfig,
  ProgressEvent,
  TTSProviderConfig,
} from '@chalkboard/shared';
import type { Storage } from './storage.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  status: JobStatus;
  progress: ProgressEvent[];
  error?: string;
  outputKey?: string;
  /** For multilingual dubs: one storage key per language (primary first). */
  outputs?: { language: string; key: string }[];
  /** Storage key for the persisted SceneScript JSON. */
  scriptKey?: string;
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

  succeed(
    id: string,
    outputKey: string,
    scriptKey?: string,
    outputs?: { language: string; key: string }[],
  ): void {
    const job = this.map.get(id);
    if (!job) return;
    job.status = 'done';
    job.outputKey = outputKey;
    if (outputs && outputs.length > 1) job.outputs = outputs;
    if (scriptKey) job.scriptKey = scriptKey;
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
  format?: 'explainer' | 'short' | 'cinematic';
  research?: 'openai-deep-research' | 'basic' | 'stub';
  researchDepth?: 'quick' | 'standard' | 'deep';
  /** Dub: render the same production in each of these languages. */
  languages?: string[];
  /** Burn subtitles in this language even when narration differs. */
  subtitleLanguage?: string;
  voice?: string;
  llm?: LLMProviderConfig;
  tts?: TTSProviderConfig;
  subtitles?: boolean;
  music?: boolean;
  musicMood?: 'wonder' | 'mystery' | 'dramatic' | 'upbeat' | 'calm' | 'none';
  musicSource?: 'bundled' | 'jamendo';
  images?: boolean;
  imageQuality?: 'low' | 'medium' | 'high' | 'auto';
  selfCorrect?: boolean | number;
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
    ...(input.format ? { format: input.format } : {}),
    ...(input.research ? { research: input.research } : {}),
    ...(input.researchDepth ? { researchDepth: input.researchDepth } : {}),
    ...(input.languages && input.languages.length ? { languages: input.languages } : {}),
    ...(input.subtitleLanguage ? { subtitleLanguage: input.subtitleLanguage } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
    ...(input.llm ? { llm: input.llm } : {}),
    ...(input.tts ? { tts: input.tts } : {}),
    ...(input.subtitles === false ? { subtitles: false } : {}),
    ...(input.music === false ? { music: false } : {}),
    ...(input.musicMood ? { musicMood: input.musicMood } : {}),
    ...(input.musicSource ? { musicSource: input.musicSource } : {}),
    ...(input.images === false ? { images: false } : {}),
    ...(input.imageQuality ? { imageQuality: input.imageQuality } : {}),
    ...(input.selfCorrect ? { selfCorrect: input.selfCorrect } : {}),
    onProgress: (e) => store.pushProgress(job.id, e),
  };

  const result = await generate(opts);

  // For a multilingual dub, generate() writes one file per language
  // (`<id>.<lang>.mp4`) and `outputPath` points at the primary. Derive storage
  // keys from the real filenames so each language is independently servable.
  const primaryKey = basename(result.outputPath);
  const outputs = result.outputs?.map((o) => ({
    language: o.language,
    key: basename(o.outputPath),
  }));

  // Persist the SceneScript alongside the mp4 so the exact LLM output that
  // produced a given video is recoverable. Failures here must not fail the
  // job — the video is already on disk.
  const scriptKey = `${job.id}.script.json`;
  try {
    const scriptPath = await storage.absolutePath(scriptKey);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(scriptPath, JSON.stringify(result.script, null, 2), 'utf8');
  } catch (err) {
    console.warn(
      '[chalkboard] failed to persist SceneScript for job %s: %s',
      job.id,
      err instanceof Error ? err.message : err,
    );
  }

  store.succeed(job.id, primaryKey, scriptKey, outputs);
}
