/**
 * Excalidraw element shape, kept loose so we can pass whatever the model
 * emits straight to Excalidraw's renderer without owning its full schema.
 */
export interface ExcalidrawElementLike {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  fontSize?: number;
  fontFamily?: number;
  roughness?: number;
  opacity?: number;
  customData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * One beat of the explainer: a narration line plus the elements that should
 * appear (drawn progressively) while it's being read.
 */
export interface Scene {
  id: string;
  /** Text the narrator says during this scene. */
  narration: string;
  /**
   * Either Excalidraw elements directly, or a Mermaid diagram string that
   * gets converted to elements client-side at render time.
   */
  elements?: ExcalidrawElementLike[];
  mermaid?: string;
  /** ms between consecutive element reveals. Defaults to auto-fit to audio. */
  staggerMs?: number;
  /** ms each element takes to fade in. */
  drawDurationMs?: number;
  /** Hold-still ms at end of scene before transitioning. */
  holdMs?: number;
}

/**
 * Musical mood of a video, used to pick a background track. The LLM sets this
 * based on the subject (e.g. a black-hole explainer → "mystery", a how-it-works
 * → "wonder"). 'none' suppresses music entirely.
 */
export type MusicMood = 'wonder' | 'mystery' | 'dramatic' | 'upbeat' | 'calm' | 'none';

export const MUSIC_MOODS: MusicMood[] = ['wonder', 'mystery', 'dramatic', 'upbeat', 'calm', 'none'];

export interface SceneScriptMeta {
  /** BCP-47 language tag for narration (e.g. "en", "fr-CA"). */
  language: string;
  /** Optional voice id understood by the chosen TTS provider. */
  voice?: string;
  /** "16:9" | "9:16" | "1:1" — drives canvas size. */
  aspectRatio: '16:9' | '9:16' | '1:1';
  /** Title for the video (used in file names, metadata). */
  title?: string;
  /** Musical mood for the background track. Default 'wonder'. */
  mood?: MusicMood;
}

export interface SceneScript {
  version: '1';
  meta: SceneScriptMeta;
  scenes: Scene[];
}

export const SCENE_SCRIPT_VERSION = '1' as const;

export function emptyScript(meta: Partial<SceneScriptMeta> = {}): SceneScript {
  return {
    version: SCENE_SCRIPT_VERSION,
    meta: {
      language: meta.language ?? 'en',
      aspectRatio: meta.aspectRatio ?? '16:9',
      ...(meta.voice ? { voice: meta.voice } : {}),
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.mood ? { mood: meta.mood } : {}),
    },
    scenes: [],
  };
}
