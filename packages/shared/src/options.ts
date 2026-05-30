export interface GenerateOptions {
  prompt: string;
  /** Output path for the final mp4. */
  outputPath: string;
  /** BCP-47 language tag (e.g. "en", "fr"). */
  language?: string;
  /** Voice id for the chosen TTS provider. */
  voice?: string;
  /** Aspect ratio of the final video. */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** LLM provider override. */
  llm?: LLMProviderConfig;
  /** TTS provider override. */
  tts?: TTSProviderConfig;
  /** Working directory for intermediate files (audio, frames). Default: os tmpdir. */
  workDir?: string;
  /** Hook for progress reporting. */
  onProgress?: (event: ProgressEvent) => void;
  /** Don't delete the working directory after render — useful for debugging. */
  keepWorkDir?: boolean;
  /** Burn per-scene captions into the video. Default: true. */
  subtitles?: boolean;
  /** Mix background music (ducked under narration) into the video. Default: true. */
  music?: boolean;
  /** Custom background music track. Defaults to the bundled CC0 ambient loop. */
  musicTrack?: string;
}

export type LLMProviderConfig =
  | { kind: 'anthropic'; apiKey?: string; model?: string }
  | { kind: 'openai'; apiKey?: string; model?: string; baseURL?: string }
  | { kind: 'ollama'; baseURL?: string; model?: string }
  | { kind: 'stub' };

export type TTSProviderConfig =
  | { kind: 'piper'; modelPath?: string; binaryPath?: string }
  | { kind: 'openai'; apiKey?: string; model?: string; voice?: string }
  | { kind: 'elevenlabs'; apiKey?: string; voiceId?: string }
  | { kind: 'stub'; msPerChar?: number; frequency?: number };

export type ProgressEvent =
  | { phase: 'script'; message: string }
  | { phase: 'narration'; sceneIndex: number; sceneCount: number }
  | { phase: 'render'; message: string }
  | { phase: 'mux'; message: string }
  | { phase: 'done'; outputPath: string };
