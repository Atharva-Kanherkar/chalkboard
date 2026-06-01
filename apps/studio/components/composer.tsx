'use client';

import { useRef, useState } from 'react';
import { LANGUAGES, type AspectRatio, type GenerateOptions, type ResearchDepth } from '@/lib/types';
import { Chevron, Send } from './icons';

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

const DEPTHS: { value: ResearchDepth; label: string }[] = [
  { value: 'quick', label: 'Quick' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Deep' },
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
          ? 'bg-white/10 text-[var(--text)] ring-1 ring-white/15'
          : 'text-[var(--muted)] hover:text-[var(--text)]')
      }
    >
      {label}
    </button>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full ring-1 ring-[var(--border)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'px-2.5 py-1 text-xs font-medium transition ' +
            (value === o.value
              ? 'bg-white/10 text-[var(--text)]'
              : 'text-[var(--muted)] hover:text-[var(--text)]')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text)] ring-1 ring-[var(--border)] focus:outline-none"
    >
      {children}
    </select>
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
  const [showMore, setShowMore] = useState(false);
  const canSend = value.trim().length > 0 && !busy;
  const isCinematic = options.format === 'cinematic';

  const narration = options.language;
  const dubExtras = (options.languages ?? []).filter((l) => l !== narration);
  const hasExtras = dubExtras.length > 0 || !!options.subtitleLanguage;

  function autosize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function setNarration(code: string) {
    const extras = dubExtras.filter((l) => l !== code);
    setOptions({
      ...options,
      language: code,
      languages: extras.length ? [code, ...extras] : undefined,
      subtitleLanguage: options.subtitleLanguage === code ? undefined : options.subtitleLanguage,
    });
  }

  function toggleDub(code: string) {
    const extras = dubExtras.includes(code)
      ? dubExtras.filter((l) => l !== code)
      : [...dubExtras, code];
    setOptions({ ...options, languages: extras.length ? [narration, ...extras] : undefined });
  }

  function setSubtitleLang(code: string) {
    setOptions({ ...options, subtitleLanguage: !code || code === narration ? undefined : code });
  }

  return (
    <div className="card rounded-[26px] px-4 pt-3.5 pb-2.5 shadow-xl shadow-black/30">
      {/* input */}
      <textarea
        ref={ref}
        value={value}
        rows={1}
        placeholder="Explain anything — how a hash table works, why the sky is blue…"
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
        className="max-h-[200px] w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
      />

      {/* controls */}
      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {isCinematic ? (
            <Segmented
              options={DEPTHS}
              value={options.researchDepth}
              onChange={(v) => setOptions({ ...options, researchDepth: v })}
            />
          ) : (
            <Segmented
              options={ASPECTS}
              value={options.aspectRatio}
              onChange={(v) => setOptions({ ...options, aspectRatio: v })}
            />
          )}
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
            label="Demo"
            on={options.demo}
            title="Instant render with stub providers — no API cost, great for trying the UI"
            onClick={() => setOptions({ ...options, demo: !options.demo })}
          />
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className={
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ' +
              (showMore || hasExtras
                ? 'bg-white/10 text-[var(--text)] ring-1 ring-white/15'
                : 'text-[var(--muted)] hover:text-[var(--text)]')
            }
          >
            Languages
            <Chevron className={'h-3 w-3 transition-transform ' + (showMore ? 'rotate-180' : '')} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => canSend && onSubmit()}
          disabled={!canSend}
          className="btn-primary flex h-9 w-9 flex-none items-center justify-center rounded-full"
          aria-label="Generate"
        >
          {busy ? (
            <span className="animate-dot h-2 w-2 rounded-full bg-current" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* language options */}
      {showMore && (
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-[var(--border)] px-0.5 pt-3">
          <div className="flex items-center gap-2">
            <span className="w-24 flex-none text-xs text-[var(--muted)]">Narration</span>
            <Select value={narration} onChange={setNarration}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>

          {options.subtitles && (
            <div className="flex items-center gap-2">
              <span className="w-24 flex-none text-xs text-[var(--muted)]">Subtitles in</span>
              <Select value={options.subtitleLanguage ?? ''} onChange={setSubtitleLang}>
                <option value="">Match narration</option>
                {LANGUAGES.filter((l) => l.code !== narration).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-start gap-2">
            <span className="mt-1 w-24 flex-none text-xs text-[var(--muted)]">Also dub into</span>
            <div className="flex flex-wrap gap-1">
              {LANGUAGES.filter((l) => l.code !== narration).map((l) => (
                <Toggle
                  key={l.code}
                  label={l.label}
                  on={dubExtras.includes(l.code)}
                  onClick={() => toggleDub(l.code)}
                />
              ))}
            </div>
          </div>
          {dubExtras.length > 0 && (
            <p className="px-0.5 text-[11px] text-[var(--faint)]">
              Renders {dubExtras.length + 1} videos — one per language, sharing the same visuals.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
