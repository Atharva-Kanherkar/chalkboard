'use client';

import { PHASE_LABELS, type Job, type Phase } from '@/lib/types';

/**
 * A single, understated status line for the loading card — the current phase
 * plus a small detail. Replaces the old step-by-step checklist; progress still
 * reads clearly on a multi-minute render without the visual noise.
 */
export function currentStatus(job: Job | null | undefined): string {
  if (!job || job.progress.length === 0) return 'Starting up';
  const last = job.progress[job.progress.length - 1];
  if (last.phase === 'done') return 'Finishing up';
  const label = PHASE_LABELS[last.phase as Phase] ?? 'Working';
  if (last.phase === 'narration') {
    return `${label} · scene ${last.sceneIndex + 1} of ${last.sceneCount}`;
  }
  return label;
}
