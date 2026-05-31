import { describe, expect, it } from 'vitest';
import { resolveResearchProvider } from './resolve.js';
import { StubResearchProvider } from './stub.js';

describe('resolveResearchProvider', () => {
  it('resolves the stub provider', () => {
    const p = resolveResearchProvider({ kind: 'stub' });
    expect(p.name).toBe('stub');
  });

  it('stub returns a grounded brief whose findings cite real source ids', async () => {
    const p = new StubResearchProvider();
    const brief = await p.research({ topic: 'why the sky is blue' });
    expect(brief.topic).toBe('why the sky is blue');
    expect(brief.grounded).toBe(true);
    const ids = new Set(brief.sources.map((s) => s.id));
    // Every cite must resolve to a real source id (the grounding contract).
    for (const f of brief.findings) {
      for (const c of f.cites) expect(ids.has(c)).toBe(true);
    }
  });

  it('basic provider is selectable without a deep-research key', () => {
    const p = resolveResearchProvider({ kind: 'basic', baseURL: 'http://localhost:11434/v1' });
    expect(p.name).toBe('basic');
  });
});
