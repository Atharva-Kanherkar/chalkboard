export type AspectRatio = '16:9' | '9:16' | '1:1';

export type ProgressEvent =
  | { phase: 'script'; message: string }
  | { phase: 'narration'; sceneIndex: number; sceneCount: number }
  | { phase: 'render'; message: string }
  | { phase: 'mux'; message: string }
  | { phase: 'done'; outputPath: string };

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  status: JobStatus;
  progress: ProgressEvent[];
  error: string | null;
  outputUrl: string | null;
  scriptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateOptions {
  aspectRatio: AspectRatio;
  subtitles: boolean;
  music: boolean;
  images: boolean;
  selfCorrect: boolean;
  demo: boolean; // stub providers — instant, no API cost
}

export const PHASES = ['script', 'narration', 'render', 'mux'] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  script: 'Writing the script',
  narration: 'Recording narration',
  render: 'Drawing & rendering',
  mux: 'Mixing audio & music',
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** user message text, or assistant's prompt being generated */
  text: string;
  /** assistant only */
  job?: Job | null;
  videoId?: string | null;
  error?: string | null;
  startedAt?: number;
}
