// Build burned-in captions from the narration we already have. We don't have
// word-level timestamps, so the granularity is: each scene's narration is split
// into a few cues that share the scene's known audio window proportionally.
//
// Captions are drawn directly onto the canvas during the silent-video pass
// (see page/player.js). That bakes them into the pixels of every frame, so they
// appear on EVERY output regardless of the player AND regardless of whether the
// system ffmpeg was built with libass — which the `subtitles`/`ass` filters
// require and many builds (incl. some Homebrew) omit.

import type { SceneTiming } from './timing.js';

export interface CaptionScene {
  narration: string;
}

export interface Cue {
  /** Scene-relative start (ms from the scene's first frame). */
  startMs: number;
  /** Scene-relative end (ms). */
  endMs: number;
  text: string;
}

const MAX_CUE_CHARS = 90; // ~2 lines worth
const MIN_CUE_MS = 900;

// Split one scene's narration into display cues, each ≤ MAX_CUE_CHARS, with the
// scene's window divided proportionally to each cue's length. Timings are
// scene-relative (start at 0) because the player runs a per-scene clock.
export function cuesForScene(narration: string, durationMs: number): Cue[] {
  const clean = String(narration ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > MAX_CUE_CHARS) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...hardSplit(sentence, MAX_CUE_CHARS));
      continue;
    }
    const test = current ? `${current} ${sentence}` : sentence;
    if (test.length > MAX_CUE_CHARS) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      current = test;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length === 0) return [];

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
  const cues: Cue[] = [];
  let cursor = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const isLast = i === chunks.length - 1;
    let span = Math.round((durationMs * chunk.length) / totalChars);
    span = Math.max(span, MIN_CUE_MS);
    const end = isLast ? durationMs : Math.min(cursor + span, durationMs);
    cues.push({ startMs: cursor, endMs: Math.max(end, cursor + 1), text: chunk });
    cursor = end;
  }
  return cues;
}

// Split a too-long sentence into word-boundary chunks under `max` chars.
function hardSplit(sentence: string, max: number): string[] {
  const words = sentence.split(' ');
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > max && current) {
      out.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Per-scene cue lists, aligned to `scenes`/`timings`, for injection into the page. */
export function planSceneCaptions(scenes: CaptionScene[], timings: SceneTiming[]): Cue[][] {
  return scenes.map((scene, i) => cuesForScene(scene.narration, timings[i]?.durationMs ?? 0));
}

export function hasCaptions(scenes: CaptionScene[]): boolean {
  return scenes.some((s) => String(s.narration ?? '').trim().length > 0);
}
