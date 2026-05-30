'use client';

import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { videoUrl } from '@/lib/api';
import { ProgressTracker } from './progress';
import { Alert, Download, Logo } from './icons';

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - since) / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return (
    <span className="mono text-xs text-[var(--muted)]">
      {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}

export function MessageView({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="animate-rise flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[var(--panel-2)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)] ring-1 ring-[var(--border)]">
          {msg.text}
        </div>
      </div>
    );
  }

  const running = msg.job?.status === 'running' || msg.job?.status === 'queued' || !msg.job;
  const done = msg.videoId && msg.job?.status === 'done';

  return (
    <div className="animate-rise flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/25 to-pink-500/25 text-violet-300 ring-1 ring-[var(--border)]">
        <Logo className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        {msg.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <Alert className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <div className="font-medium">Generation failed</div>
              <div className="mono mt-1 text-xs text-red-300/80">{msg.error}</div>
            </div>
          </div>
        ) : done ? (
          <div className="glass overflow-hidden rounded-2xl">
            <video
              className="block w-full bg-black"
              src={videoUrl(msg.videoId!)}
              controls
              playsInline
            />
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--muted)]">Done — “{msg.text}”</span>
              <a
                href={videoUrl(msg.videoId!)}
                download="chalkboard.mp4"
                className="chip inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text)]">Generating your video</span>
              {msg.startedAt ? <Elapsed since={msg.startedAt} /> : null}
            </div>
            {msg.job ? (
              <ProgressTracker job={msg.job} />
            ) : (
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <span className="spinner" /> starting…
              </div>
            )}
            {running && (
              <p className="mt-3 text-xs text-[var(--muted)]/70">
                Real renders record in real time, so this takes a few minutes. Demo mode is
                near-instant.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
