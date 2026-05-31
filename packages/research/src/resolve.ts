import { BasicResearchProvider } from './basic.js';
import { OpenAIDeepResearchProvider } from './openai-deep-research.js';
import type { ResearchProvider } from './provider.js';
import { StubResearchProvider } from './stub.js';

export type ResearchProviderConfig =
  | { kind: 'openai-deep-research'; apiKey?: string; model?: string; baseURL?: string }
  | { kind: 'basic'; apiKey?: string; model?: string; baseURL?: string }
  | { kind: 'stub' };

export function resolveResearchProvider(
  config: ResearchProviderConfig | undefined,
): ResearchProvider {
  const c = config ?? defaultConfigFromEnv();
  switch (c.kind) {
    case 'openai-deep-research':
      return new OpenAIDeepResearchProvider({
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        ...(c.model ? { model: c.model } : {}),
        ...(c.baseURL ? { baseURL: c.baseURL } : {}),
      });
    case 'basic':
      return new BasicResearchProvider({
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        ...(c.model ? { model: c.model } : {}),
        ...(c.baseURL ? { baseURL: c.baseURL } : {}),
      });
    case 'stub':
      return new StubResearchProvider();
  }
}

function defaultConfigFromEnv(): ResearchProviderConfig {
  if (process.env['CHALKBOARD_RESEARCH'] === 'stub') return { kind: 'stub' };
  if (process.env['CHALKBOARD_RESEARCH'] === 'basic') return { kind: 'basic' };
  // Grounded by default when a key is available; honest fallback otherwise.
  if (process.env['OPENAI_API_KEY']) return { kind: 'openai-deep-research' };
  return { kind: 'basic' };
}
