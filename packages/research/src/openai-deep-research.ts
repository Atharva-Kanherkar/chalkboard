// Research provider backed by OpenAI's Deep Research API (o4-mini-deep-research
// by default, o3-deep-research for depth). It runs an autonomous search →
// synthesize loop via the Responses API + the web_search tool and returns a
// report whose citations are grounded in actually-fetched sources, which we
// normalize into a CitedBrief.

import OpenAI from 'openai';
import type { ResearchInput, ResearchProvider } from './provider.js';
import type { CitedBrief } from './types.js';
import { buildBriefFromAnnotatedReport, type UrlCitation } from './citations.js';

export interface OpenAIDeepResearchOptions {
  apiKey?: string;
  /** Override the model. Default chosen from `depth`. */
  model?: string;
  baseURL?: string;
}

// USD per 1M tokens. Update if OpenAI changes pricing.
const PRICING: Record<string, { in: number; out: number }> = {
  'o4-mini-deep-research': { in: 2, out: 8 },
  'o3-deep-research': { in: 10, out: 40 },
};

function modelForDepth(depth: ResearchInput['depth']): string {
  return depth === 'deep' ? 'o3-deep-research' : 'o4-mini-deep-research';
}

const SYSTEM = `You are a research analyst for a science/explainer video creator.
Research the topic from primary and high-quality secondary sources. Produce a
well-structured brief in clear paragraphs covering: the surprising hook or
common misconception, the core mechanism/explanation, the key evidence, and any
caveats. Ground every non-obvious claim with a citation. Be accurate over
comprehensive; prefer authoritative sources.`;

export class OpenAIDeepResearchProvider implements ResearchProvider {
  readonly name = 'openai-deep-research';
  private readonly client: OpenAI;
  private readonly modelOverride: string | undefined;

  constructor(opts: OpenAIDeepResearchOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) throw new Error('openai-deep-research: OPENAI_API_KEY is required');
    this.client = new OpenAI({ apiKey, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) });
    this.modelOverride = opts.model;
  }

  async research(input: ResearchInput): Promise<CitedBrief> {
    const model = this.modelOverride ?? modelForDepth(input.depth);
    input.onProgress?.(`deep research via ${model} (this can take a few minutes)`);

    // The Responses API with a deep-research model requires a data source; the
    // built-in web_search tool is what grounds the citations.
    const res = await this.client.responses.create({
      model,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: SYSTEM }] },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `Topic: ${input.topic}` +
                (input.language && input.language !== 'en'
                  ? `\nWrite the brief in language: ${input.language}.`
                  : ''),
            },
          ],
        },
      ],
      tools: [{ type: 'web_search_preview' }],
    } as unknown as Parameters<typeof this.client.responses.create>[0]);

    const { text, annotations } = extractReport(res);
    if (!text) throw new Error('openai-deep-research: empty report');

    const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    const price = PRICING[model];
    const estCostUsd =
      usage && price
        ? Math.round(
            (((usage.input_tokens ?? 0) / 1e6) * price.in +
              ((usage.output_tokens ?? 0) / 1e6) * price.out) *
              10000,
          ) / 10000
        : undefined;

    const brief = buildBriefFromAnnotatedReport({
      topic: input.topic,
      text,
      annotations,
      provider: this.name,
      model,
      ...(typeof estCostUsd === 'number' ? { estCostUsd } : {}),
    });
    input.onProgress?.(
      `brief ready: ${brief.findings.length} findings, ${brief.sources.length} sources`,
    );
    return brief;
  }
}

/** Pull the final assistant message text + url_citation annotations from a Responses result. */
export function extractReport(res: unknown): { text: string; annotations: UrlCitation[] } {
  const r = res as {
    output_text?: string;
    output?: Array<{
      type?: string;
      role?: string;
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{
          type?: string;
          url?: string;
          title?: string;
          start_index?: number;
          end_index?: number;
        }>;
      }>;
    }>;
  };

  const annotations: UrlCitation[] = [];
  let text = '';

  const messages = (r.output ?? []).filter((o) => o.type === 'message');
  // The final message is the report.
  const last = messages[messages.length - 1];
  for (const part of last?.content ?? []) {
    if (typeof part.text === 'string') text += part.text;
    for (const a of part.annotations ?? []) {
      if (a.type === 'url_citation' && a.url) {
        annotations.push({
          url: a.url,
          ...(a.title ? { title: a.title } : {}),
          start_index: a.start_index ?? 0,
          end_index: a.end_index ?? 0,
        });
      }
    }
  }

  // Fallback to the convenience field if the structured walk found nothing.
  if (!text && typeof r.output_text === 'string') text = r.output_text;
  return { text, annotations };
}
