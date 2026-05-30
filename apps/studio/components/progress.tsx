'use client';

import { PHASES, PHASE_LABELS, type Job, type Phase, type ProgressEvent } from '@/lib/types';
import { Check } from './icons';

function latestForPhase(progress: ProgressEvent[], phase: Phase): string | null {
  const matches = progress.filter((p) => p.phase === phase);
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  if (last.phase === 'narration') return `scene ${last.sceneIndex + 1} of ${last.sceneCount}`;
  if ('message' in last) return last.message;
  return null;
}

type State = 'pending' | 'active' | 'done';

export function ProgressTracker({ job }: { job: Job }) {
  const reached = new Set(job.progress.map((p) => p.phase));
  const isDone = job.status === 'done';

  // A phase is "done" if a later phase has started (or the whole job finished).
  function stateFor(phase: Phase, idx: number): State {
    if (isDone) return 'done';
    const laterStarted = PHASES.slice(idx + 1).some((p) => reached.has(p)) || reached.has('done');
    if (laterStarted) return 'done';
    if (reached.has(phase)) return 'active';
    return 'pending';
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {PHASES.map((phase, idx) => {
        const st = stateFor(phase, idx);
        const detail = latestForPhase(job.progress, phase);
        return (
          <li key={phase} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center">
              {st === 'done' ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : st === 'active' ? (
                <span className="spinner" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-[var(--border)]" />
              )}
            </span>
            <div className="min-w-0">
              <div
                className={
                  st === 'pending'
                    ? 'text-sm text-[var(--muted)]/60'
                    : st === 'active'
                      ? 'text-sm font-medium text-[var(--text)]'
                      : 'text-sm text-[var(--muted)]'
                }
              >
                {PHASE_LABELS[phase]}
              </div>
              {st === 'active' && detail && (
                <div className="mono mt-0.5 truncate text-xs text-[var(--muted)]">{detail}</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
