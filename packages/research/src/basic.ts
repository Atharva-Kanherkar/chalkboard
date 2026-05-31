// A dependency-light fallback research provider: one LLM completion that
// synthesises a brief from the model's own knowledge. It does NOT perform live
// search, so it is honestly flagged `grounded: false` and returns no sources.
// Works with any OpenAI-compatible endpoint (incl. a local Ollama via baseURL),
// preserving chalkboard's $0 / self-hostable promise.

import OpenAI from 'openai';
import type { ResearchInput, ResearchProvider } from './provider.js';
import type { CitedBrief, Finding } from './types.js';

export interface BasicResearchOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

const SYSTEM = `You are a research analyst for a science/explainer video creator.
Write a focused brief on the topic in 4-6 short paragraphs: the surprising hook
or common misconception, the core explanation, the key evidence, and caveats.
You are working from general knowledge without live web access, so do NOT invent
citations, URLs, statistics, or quotes. Keep claims to what you are confident is
broadly established.`;

export class BasicResearchProvider implements ResearchProvider {
  readonly name = 'basic';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: BasicResearchOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'] ?? 'not-needed';
    this.client = new OpenAI({ apiKey, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) });
    this.model = opts.model ?? 'gpt-4o-mini';
  }

  async research(input: ResearchInput): Promise<CitedBrief> {
    input.onProgress?.(`basic (ungrounded) research via ${this.model}`);
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content:
            `Topic: ${input.topic}` +
            (input.language && input.language !== 'en'
              ? `\nWrite in language: ${input.language}.`
              : ''),
        },
      ],
    });
    const text = res.choices?.[0]?.message?.content?.trim() ?? '';
    const findings: Finding[] = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 40)
      .map((p) => ({ text: p, cites: [] }));

    return {
      topic: input.topic,
      summary: findings[0]?.text ?? text.slice(0, 500),
      findings,
      sources: [],
      grounded: false,
      provider: this.name,
      model: this.model,
    };
  }
}
