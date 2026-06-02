// Compute scene durations from narration audio so the visual timeline matches
// the spoken track. The LLM provides hints (staggerMs, holdMs, drawDurationMs)
// but the audio length is the ground truth — visuals stretch/squeeze to fit.

import type { Scene } from '@chalkboard/shared';

export interface SceneTiming {
  /** Total scene duration in ms (audio length + holdMs, with a floor). */
  durationMs: number;
  /** ms between consecutive element reveals. */
  staggerMs: number;
  /** ms each element takes to fade in. */
  drawDurationMs: number;
  /** Time after last element finishes drawing before scene ends. */
  holdMs: number;
}

export interface AudioInfo {
  /** Duration of the narration audio for this scene, in ms. */
  durationMs: number;
}

const MIN_SCENE_MS = 1500;
// Per-element draw window. The player traces each element on like a pen over
// this span; a touch faster than a passive fade so the board feels alive.
const DEFAULT_DRAW_MS = 420;
const DEFAULT_HOLD_MS = 600;

export function planSceneTiming(scene: Scene, audio: AudioInfo | undefined): SceneTiming {
  const audioMs = audio?.durationMs ?? 0;
  const elementCount = scene.elements?.length ?? 1;
  const drawDurationMs = scene.drawDurationMs ?? DEFAULT_DRAW_MS;
  const holdMs = scene.holdMs ?? DEFAULT_HOLD_MS;

  // We want the last element to finish drawing slightly before narration ends.
  // Reveal window = audio - holdMs - small tail. Distribute across (n-1) gaps.
  const revealWindow = Math.max(audioMs - holdMs - drawDurationMs, 0);
  const gaps = Math.max(elementCount - 1, 1);
  const computedStagger = revealWindow / gaps;
  const staggerMs = scene.staggerMs ?? Math.max(150, Math.min(1500, computedStagger || 600));

  const durationMs = Math.max(MIN_SCENE_MS, audioMs + holdMs);

  return { durationMs, staggerMs, drawDurationMs, holdMs };
}
