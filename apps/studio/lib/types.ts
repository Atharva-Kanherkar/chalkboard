export type AspectRatio = '16:9' | '9:16' | '1:1';

/** Curated narration/subtitle/dub languages surfaced in the studio UI. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' },
];

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

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
  /** For multilingual dubs: languages available via `/video?lang=`. */
  languages: string[] | null;
  scriptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudioMode = 'explainer' | 'reels' | 'cinematic';

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface GenerateOptions {
  format: 'explainer' | 'short' | 'cinematic';
  aspectRatio: AspectRatio;
  /** Narration language (BCP-47). Default 'en'. */
  language: string;
  /** Research depth for the cinematic format. */
  researchDepth: ResearchDepth;
  /** Dub targets (incl. narration language). undefined/empty = single language. */
  languages?: string[];
  /** Burn subtitles in this language even when narration differs. undefined = match narration. */
  subtitleLanguage?: string;
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
  /** aspect of the requested render — shapes the loading skeleton */
  aspectRatio?: AspectRatio;
}
