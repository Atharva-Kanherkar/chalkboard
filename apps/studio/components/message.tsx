'use client';

import { useEffect, useState } from 'react';
import { type AspectRatio, type ChatMessage, languageLabel } from '@/lib/types';
import { videoUrl } from '@/lib/api';
import { currentStatus } from './progress';
import { Alert, Download } from './icons';

const ASPECT_CSS: Record<AspectRatio, string> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '1:1': '1 / 1',
};

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
    <span className="mono text-xs text-[var(--faint)]">
      {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}

export function MessageView({ msg }: { msg: ChatMessage }) {
  // A multilingual dub exposes several language cuts; track which one is shown.
  const langs = msg.job?.languages ?? null;
  const [lang, setLang] = useState<string | null>(null);
  const activeLang = lang ?? langs?.[0] ?? undefined;

  if (msg.role === 'user') {
    return (
      <div className="animate-rise flex justify-end">
        <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-[var(--surface-2)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)]">
          {msg.text}
        </div>
      </div>
    );
  }

  const done = msg.videoId && msg.job?.status === 'done';
  const aspect = ASPECT_CSS[msg.aspectRatio ?? '16:9'];

  if (msg.error) {
    return (
      <div className="animate-rise flex items-start gap-2.5 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300/90">
        <Alert className="mt-0.5 h-4 w-4 flex-none" />
        <div>
          <div className="font-medium text-red-200/90">Generation failed</div>
          <div className="mono mt-1 text-xs text-red-300/70">{msg.error}</div>
        </div>
      </div>
    );
  }

  if (done) {
    const src = videoUrl(msg.videoId!, activeLang);
    return (
      <div className="animate-rise card overflow-hidden rounded-2xl">
        <video
          key={activeLang ?? 'default'}
          className="mx-auto block max-h-[72vh] max-w-full bg-black"
          src={src}
          controls
          playsInline
        />
        {langs && langs.length > 1 && (
          <div className="flex flex-wrap gap-1 px-4 pt-3">
            {langs.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={
                  'rounded-full px-3 py-1 text-xs font-medium transition ' +
                  (code === activeLang
                    ? 'bg-white/10 text-[var(--text)] ring-1 ring-white/15'
                    : 'text-[var(--muted)] hover:text-[var(--text)]')
                }
              >
                {languageLabel(code)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="truncate text-sm text-[var(--muted)]">{msg.text}</span>
          <a
            href={src}
            download={`chalkboard${activeLang ? '.' + activeLang : ''}.mp4`}
            className="chip inline-flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      </div>
    );
  }

  // loading — pulsating skeleton figures + one understated status line
  return (
    <div className="animate-rise card rounded-2xl p-3">
      <div className="skeleton w-full" style={{ aspectRatio: aspect }} />
      <div className="mt-3 flex items-center gap-3 px-1">
        <div className="skeleton h-3 flex-1" style={{ animationDelay: '0.2s' }} />
        <div className="skeleton h-3 w-12" style={{ animationDelay: '0.4s' }} />
      </div>
      <div className="mt-3.5 flex items-center justify-between px-1 pb-0.5">
        <span className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <span className="animate-dot h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
          {currentStatus(msg.job)}
        </span>
        {msg.startedAt ? <Elapsed since={msg.startedAt} /> : null}
      </div>
    </div>
  );
}
