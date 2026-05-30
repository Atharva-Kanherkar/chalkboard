'use client';

import { useRef } from 'react';
import type { AspectRatio, GenerateOptions } from '@/lib/types';
import { Send } from './icons';

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

function Toggle({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={
        'rounded-full px-3 py-1 text-xs font-medium transition ' +
        (on
          ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40'
          : 'chip text-[var(--muted)]')
      }
    >
      {label}
    </button>
  );
}

export function Composer({
  value,
  onChange,
  onSubmit,
  options,
  setOptions,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  options: GenerateOptions;
  setOptions: (o: GenerateOptions) => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy;

  function autosize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  return (
    <div className="glass rounded-2xl p-2.5 shadow-2xl shadow-black/40">
      {/* options */}
      <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-2">
        <div className="flex overflow-hidden rounded-full ring-1 ring-[var(--border)]">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setOptions({ ...options, aspectRatio: a.value })}
              className={
                'px-2.5 py-1 text-xs font-medium transition ' +
                (options.aspectRatio === a.value
                  ? 'bg-violet-500/20 text-violet-200'
                  : 'text-[var(--muted)] hover:text-[var(--text)]')
              }
            >
              {a.label}
            </button>
          ))}
        </div>
        <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
        <Toggle
          label="Subtitles"
          on={options.subtitles}
          onClick={() => setOptions({ ...options, subtitles: !options.subtitles })}
        />
        <Toggle
          label="Music"
          on={options.music}
          onClick={() => setOptions({ ...options, music: !options.music })}
        />
        <Toggle
          label="Images"
          on={options.images}
          title="Generate real images for visual topics (costs API credits)"
          onClick={() => setOptions({ ...options, images: !options.images })}
        />
        <Toggle
          label="Self-correct"
          on={options.selfCorrect}
          title="Vision model reviews and fixes each scene before render"
          onClick={() => setOptions({ ...options, selfCorrect: !options.selfCorrect })}
        />
        <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
        <Toggle
          label="⚡ Demo"
          on={options.demo}
          title="Instant render with stub providers — no API cost, great for trying the UI"
          onClick={() => setOptions({ ...options, demo: !options.demo })}
        />
      </div>

      {/* input */}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          placeholder="Explain anything — “how a hash table works”, “why the sky is blue”…"
          onChange={(e) => {
            onChange(e.target.value);
            autosize();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-[var(--text)] placeholder:text-[var(--muted)]/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => canSend && onSubmit()}
          disabled={!canSend}
          className="btn-accent flex h-10 w-10 flex-none items-center justify-center rounded-xl"
          aria-label="Generate"
        >
          {busy ? <span className="spinner" /> : <Send className="h-4.5 w-4.5" />}
        </button>
      </div>
    </div>
  );
}
