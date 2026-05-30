'use client';

import type { ChatMessage } from '@/lib/types';
import { Logo } from './icons';

const MODES = [
  { key: 'explainer', label: 'Explainer', hint: 'Concept → video', live: true },
  { key: 'reels', label: 'Reels', hint: 'Faceless shorts', live: false },
  { key: 'repurpose', label: 'Repurpose', hint: 'Doc → series', live: false },
];

function statusDot(m: ChatMessage) {
  if (m.error) return 'bg-red-400';
  if (m.videoId) return 'bg-emerald-400';
  return 'bg-violet-400 animate-pulse-soft';
}

export function Sidebar({
  history,
  onNew,
  onSelect,
}: {
  history: ChatMessage[];
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="hidden w-64 flex-none flex-col border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_50%,transparent)] md:flex">
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-pink-500/30 text-violet-200 ring-1 ring-[var(--border)]">
          <Logo className="h-5 w-5" />
        </span>
        <div className="text-sm font-semibold tracking-tight">
          chalkboard <span className="gradient-text">studio</span>
        </div>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="btn-accent w-full rounded-xl px-3 py-2 text-sm font-medium"
        >
          + New video
        </button>
      </div>

      <nav className="mt-5 px-3">
        <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]/60">
          Studios
        </div>
        {MODES.map((m) => (
          <div
            key={m.key}
            className={
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm ' +
              (m.live
                ? 'bg-[var(--panel-2)] text-[var(--text)] ring-1 ring-[var(--border)]'
                : 'cursor-default text-[var(--muted)]/70')
            }
            title={m.live ? undefined : 'On the roadmap'}
          >
            <span className="flex flex-col">
              <span className="font-medium">{m.label}</span>
              <span className="text-[11px] text-[var(--muted)]/70">{m.hint}</span>
            </span>
            {!m.live && (
              <span className="rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] ring-1 ring-[var(--border)]">
                soon
              </span>
            )}
          </div>
        ))}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
        <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]/60">
          History
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <p className="px-1 text-xs text-[var(--muted)]/60">Your generations show up here.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {history
                .slice()
                .reverse()
                .map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(m.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                    >
                      <span className={'h-1.5 w-1.5 flex-none rounded-full ' + statusDot(m)} />
                      <span className="truncate">{m.text}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <a
          href="https://github.com/Atharva-Kanherkar/chalkboard"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          GitHub ↗ · MIT · v0.1
        </a>
      </div>
    </aside>
  );
}
