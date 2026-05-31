import { describe, expect, it } from 'vitest';
import { buildBriefFromAnnotatedReport } from './citations.js';
import { extractReport } from './openai-deep-research.js';

describe('buildBriefFromAnnotatedReport', () => {
  const text =
    'Black holes do not suck things in like a vacuum; orbits work the same as around any mass.\n\n' +
    'Light cannot escape past the event horizon because spacetime itself tilts inward there.';

  it('dedupes sources by url and assigns stable ids', () => {
    const a = text.indexOf('vacuum');
    const b = text.indexOf('event horizon');
    const brief = buildBriefFromAnnotatedReport({
      topic: 'black holes',
      text,
      provider: 'test',
      annotations: [
        { url: 'https://nasa.gov/a', title: 'NASA', start_index: a, end_index: a + 6 },
        { url: 'https://nasa.gov/a', title: 'NASA dup', start_index: a, end_index: a + 6 },
        { url: 'https://aps.org/b', title: 'APS', start_index: b, end_index: b + 13 },
      ],
    });
    expect(brief.sources.map((s) => s.url)).toEqual(['https://nasa.gov/a', 'https://aps.org/b']);
    expect(brief.sources[0]!.id).toBe('s1');
    expect(brief.grounded).toBe(true);
  });

  it('attributes citations to the paragraph they fall in', () => {
    const a = text.indexOf('vacuum');
    const b = text.indexOf('event horizon');
    const brief = buildBriefFromAnnotatedReport({
      topic: 'black holes',
      text,
      provider: 'test',
      annotations: [
        { url: 'https://nasa.gov/a', start_index: a, end_index: a + 6 },
        { url: 'https://aps.org/b', start_index: b, end_index: b + 13 },
      ],
    });
    expect(brief.findings).toHaveLength(2);
    expect(brief.findings[0]!.cites).toEqual(['s1']);
    expect(brief.findings[1]!.cites).toEqual(['s2']);
  });

  it('is ungrounded when there are no annotations', () => {
    const brief = buildBriefFromAnnotatedReport({
      topic: 't',
      text,
      provider: 'test',
      annotations: [],
    });
    expect(brief.grounded).toBe(false);
    expect(brief.sources).toEqual([]);
    expect(brief.findings.every((f) => f.cites.length === 0)).toBe(true);
  });
});

describe('extractReport', () => {
  it('pulls text + url_citation annotations from a Responses result', () => {
    const res = {
      output: [
        { type: 'web_search_call' },
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'A grounded finding about the topic.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://example.com/x',
                  title: 'X',
                  start_index: 2,
                  end_index: 10,
                },
              ],
            },
          ],
        },
      ],
    };
    const { text, annotations } = extractReport(res);
    expect(text).toContain('grounded finding');
    expect(annotations).toHaveLength(1);
    expect(annotations[0]!.url).toBe('https://example.com/x');
  });

  it('falls back to output_text when no structured message is present', () => {
    const { text, annotations } = extractReport({ output_text: 'plain', output: [] });
    expect(text).toBe('plain');
    expect(annotations).toEqual([]);
  });
});
