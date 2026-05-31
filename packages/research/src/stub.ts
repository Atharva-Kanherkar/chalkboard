// A deterministic research provider for tests and the smoke pipeline — returns
// a fixed, grounded-looking brief without any network call.

import type { ResearchInput, ResearchProvider } from './provider.js';
import type { CitedBrief } from './types.js';

export class StubResearchProvider implements ResearchProvider {
  readonly name = 'stub';
  private readonly brief: CitedBrief | undefined;

  constructor(opts: { brief?: CitedBrief } = {}) {
    this.brief = opts.brief;
  }

  async research(input: ResearchInput): Promise<CitedBrief> {
    if (this.brief) return { ...this.brief, topic: input.topic };
    return {
      topic: input.topic,
      summary: `A stubbed research brief about "${input.topic}".`,
      findings: [
        { text: `Most people misunderstand a key aspect of ${input.topic}.`, cites: ['s1'] },
        {
          text: `The accepted explanation rests on well-documented evidence.`,
          cites: ['s1', 's2'],
        },
        { text: `There are important caveats worth noting.`, cites: ['s2'] },
      ],
      sources: [
        { id: 's1', url: 'https://example.org/primary', title: 'Primary source' },
        { id: 's2', url: 'https://example.org/review', title: 'Review article' },
      ],
      grounded: true,
      provider: this.name,
    };
  }
}
