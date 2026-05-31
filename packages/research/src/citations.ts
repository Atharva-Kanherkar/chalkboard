// Turn a Deep Research report (markdown text + url_citation annotations with
// character offsets) into a grounded CitedBrief. Kept pure + provider-agnostic
// so it's easy to unit-test without hitting the API.

import type { CitedBrief, Finding, Source } from './types.js';

/** A url_citation annotation as returned on a Responses API output_text item. */
export interface UrlCitation {
  url: string;
  title?: string;
  /** Inclusive start offset into the report text. */
  start_index: number;
  /** Exclusive end offset into the report text. */
  end_index: number;
}

export interface BuildBriefInput {
  topic: string;
  /** The full report text the annotations index into. */
  text: string;
  annotations: UrlCitation[];
  provider: string;
  model?: string;
  estCostUsd?: number;
}

/**
 * Build a grounded brief from an annotated report. Sources are the deduped
 * citations; each finding (a paragraph of the report) is grounded by the
 * sources whose annotation spans fall within it.
 */
export function buildBriefFromAnnotatedReport(input: BuildBriefInput): CitedBrief {
  const { topic, text, annotations } = input;

  // Dedupe sources by URL, assigning stable ids in first-seen order.
  const idByUrl = new Map<string, string>();
  const sources: Source[] = [];
  for (const a of annotations) {
    if (!a.url || idByUrl.has(a.url)) continue;
    const id = `s${sources.length + 1}`;
    idByUrl.set(a.url, id);
    sources.push({ id, url: a.url, ...(a.title ? { title: a.title } : {}) });
  }

  // Split into paragraphs, tracking char offsets so we can attribute citations.
  const findings: Finding[] = [];
  const paraRe = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; // runs of non-blank lines
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const body = m[0].trim();
    if (body.length < 40) continue; // skip headings / scraps
    const cites: string[] = [];
    for (const a of annotations) {
      if (a.start_index < end && a.end_index > start) {
        const id = idByUrl.get(a.url);
        if (id && !cites.includes(id)) cites.push(id);
      }
    }
    findings.push({ text: stripCitationMarkers(body), cites });
  }

  const summary = findings[0]?.text ?? stripCitationMarkers(text.trim()).slice(0, 500);

  return {
    topic,
    summary,
    findings,
    sources,
    grounded: sources.length > 0,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    ...(typeof input.estCostUsd === 'number' ? { estCostUsd: input.estCostUsd } : {}),
  };
}

/** Drop inline markdown link/citation noise that hurts readability of a finding. */
function stripCitationMarkers(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, '') // markdown heading markers
    .replace(/\(\s*https?:\/\/[^)]+\)/g, '') // bare (https://...) refs
    .replace(/\[\d+\]/g, '') // [1] style markers
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
