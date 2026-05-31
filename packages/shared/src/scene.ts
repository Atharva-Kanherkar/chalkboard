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
 * Narrative beat in a Veritasium-style arc. Used by the `cinematic` format to
 * pace tension and to drive per-scene music/delivery.
 */
export type ScriptBeat = 'hook' | 'setup' | 'tension' | 'reveal' | 'payoff';

export const SCRIPT_BEATS: ScriptBeat[] = ['hook', 'setup', 'tension', 'reveal', 'payoff'];

/**
 * How a scene's narration should be delivered. Provider-agnostic: mapped to
 * ElevenLabs v3 audio tags or OpenAI `gpt-4o-mini-tts` instructions at TTS time.
 */
export interface SceneDelivery {
  /** A role key resolved via `meta.voices` (e.g. "narrator"), or a direct voice id. */
  voice?: string;
  /** Free-text emotion/tone hint, e.g. "curious, hushed" or "building urgency". */
  emotion?: string;
  /** Pace hint. */
  pace?: 'slow' | 'normal' | 'fast';
}

/** A retrievable source backing claims in the script (the citation table). */
export interface SourceRef {
  id: string;
  url: string;
  title?: string;
  publisher?: string;
  quote?: string;
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
  // ---- ScriptDoc v2 (cinematic) fields — all optional, ignored by v1 paths ----
  /** Narrative beat this scene plays in the arc. */
  beat?: ScriptBeat;
  /** Delivery/emotion direction for narration. */
  delivery?: SceneDelivery;
  /** Source ids (into `SceneScript.sources`) backing this scene's claims. */
  cites?: string[];
  /** Per-scene music mood; overrides `meta.mood` so acts can shift. */
  mood?: MusicMood;
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
  /** Output style. 'cinematic' = research-backed full-frame documentary. */
  format?: 'explainer' | 'short' | 'cinematic';
  /** Named voice roles → provider voice ids (e.g. { narrator: "...", quote: "..." }). */
  voices?: Record<string, string>;
}

export interface SceneScript {
  /** '1' = whiteboard SceneScript. '2' = ScriptDoc with cinematic fields + sources. */
  version: '1' | '2';
  meta: SceneScriptMeta;
  scenes: Scene[];
  /** Citation table — sources backing the scenes' claims (ScriptDoc v2). */
  sources?: SourceRef[];
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
