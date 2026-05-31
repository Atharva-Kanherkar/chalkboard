import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, systemPromptFor, userPromptFor } from './prompt.js';

describe('systemPromptFor', () => {
  it('returns the base prompt for explainer (default)', () => {
    expect(systemPromptFor()).toBe(SYSTEM_PROMPT);
    expect(systemPromptFor('explainer')).toBe(SYSTEM_PROMPT);
  });

  it('appends the short-form override for shorts', () => {
    const p = systemPromptFor('short');
    expect(p.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(p).toContain('SHORT-FORM OVERRIDE');
    expect(p).toContain('VERTICAL 1080x1920');
  });

  it('appends the cinematic override for cinematic', () => {
    const p = systemPromptFor('cinematic');
    expect(p.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(p).toContain('CINEMATIC OVERRIDE');
    expect(p).toContain('knowledge-gap arc');
  });
});

describe('userPromptFor', () => {
  const base = { prompt: 'black holes', language: 'en', aspectRatio: '9:16' as const };

  it('uses the short-form user prompt when format is short', () => {
    const u = userPromptFor({ ...base, format: 'short' });
    expect(u).toContain('vertical short');
    expect(u).toContain('HOOK');
  });

  it('uses the standard user prompt otherwise', () => {
    const u = userPromptFor({ ...base, aspectRatio: '16:9' });
    expect(u).toContain('open the first scene with a concrete scenario');
  });

  it('embeds the research brief (findings + source ids) for cinematic', () => {
    const u = userPromptFor({
      ...base,
      aspectRatio: '16:9',
      format: 'cinematic',
      brief: {
        summary: 'why the sky is blue',
        findings: [{ text: 'Rayleigh scattering favours short wavelengths.', cites: ['s1'] }],
        sources: [{ id: 's1', url: 'https://nasa.gov/x', title: 'NASA' }],
      },
    });
    expect(u).toContain('RESEARCH BRIEF');
    expect(u).toContain('Rayleigh scattering');
    expect(u).toContain('s1');
    expect(u).toContain('CINEMATIC ScriptDoc');
  });
});
