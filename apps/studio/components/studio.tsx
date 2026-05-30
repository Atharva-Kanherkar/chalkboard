'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, GenerateOptions } from '@/lib/types';
import { createJob, pollJob } from '@/lib/api';
import { Composer } from './composer';
import { MessageView } from './message';
import { Sidebar } from './sidebar';

const EXAMPLES = [
  'How does a hash table work?',
  'Why is the sky blue?',
  'Explain how the universe is aging',
  'How does HTTPS keep my data safe?',
];

const DEFAULT_OPTIONS: GenerateOptions = {
  aspectRatio: '16:9',
  subtitles: true,
  music: true,
  images: true,
  selfCorrect: false,
  demo: false,
};

let idSeq = 0;
const nextId = () => `m${Date.now().toString(36)}-${idSeq++}`;

export function Studio() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<GenerateOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function patch(id: string, fields: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  }

  async function handleSubmit() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    setBusy(true);

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text: prompt };
    const aId = nextId();
    const assistantMsg: ChatMessage = {
      id: aId,
      role: 'assistant',
      text: prompt,
      job: null,
      startedAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const jobId = await createJob(prompt, options);
      const final = await pollJob(jobId, (job) => patch(aId, { job }));
      if (final.status === 'done') patch(aId, { videoId: jobId, job: final });
      else patch(aId, { error: final.error || 'render failed' });
    } catch (err) {
      patch(aId, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;
  const history = messages.filter((m) => m.role === 'assistant');

  function startNew() {
    setInput('');
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
  function selectGeneration(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar history={history} onNew={startNew} onSelect={selectGeneration} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile header */}
        <header className="flex items-center justify-between px-5 py-3.5 md:hidden">
          <div className="text-sm font-semibold tracking-tight">
            chalkboard <span className="gradient-text">studio</span>
          </div>
          <a
            href="https://github.com/Atharva-Kanherkar/chalkboard"
            target="_blank"
            rel="noreferrer"
            className="chip rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
          >
            GitHub ↗
          </a>
        </header>

        {/* messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pb-6">
            {empty ? (
              <div className="flex min-h-[68vh] flex-col items-center justify-center text-center">
                <h1 className="text-4xl font-semibold tracking-tight">
                  Turn a sentence into a <span className="gradient-text">video</span>.
                </h1>
                <p className="mt-3 max-w-md text-[15px] text-[var(--muted)]">
                  Type a topic. chalkboard writes the script, draws the diagrams, generates imagery,
                  narrates it, and renders an mp4 — with subtitles and music.
                </p>
                <div className="mt-7 flex max-w-xl flex-wrap justify-center gap-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setInput(ex)}
                      className="chip rounded-full px-3.5 py-1.5 text-sm text-[var(--muted)]"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-xs text-[var(--muted)]/70">
                  Tip: toggle <span className="text-violet-300">⚡ Demo</span> for an instant,
                  no-cost render to try it out.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 pt-4">
                {messages.map((m) => (
                  <div key={m.id} id={`msg-${m.id}`}>
                    <MessageView msg={m} />
                  </div>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        {/* composer */}
        <div className="px-4 pb-5">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              options={options}
              setOptions={setOptions}
              busy={busy}
            />
            <p className="mt-2 text-center text-[11px] text-[var(--muted)]/60">
              Connects to your local chalkboard server on :4140. Open source, MIT.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
