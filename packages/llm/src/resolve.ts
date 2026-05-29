import type { LLMProviderConfig } from '@chalkboard/shared';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import type { LLMProvider } from './provider.js';
import { StubLLMProvider } from './stub.js';

export function resolveLLMProvider(config: LLMProviderConfig | undefined): LLMProvider {
  const c = config ?? defaultConfigFromEnv();
  switch (c.kind) {
    case 'anthropic':
      return new AnthropicProvider({
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        ...(c.model ? { model: c.model } : {}),
      });
    case 'openai':
      return new OpenAIProvider({
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        ...(c.model ? { model: c.model } : {}),
        ...(c.baseURL ? { baseURL: c.baseURL } : {}),
      });
    case 'ollama':
      return new OllamaProvider({
        ...(c.baseURL ? { baseURL: c.baseURL } : {}),
        ...(c.model ? { model: c.model } : {}),
      });
    case 'stub':
      return new StubLLMProvider();
  }
}

function defaultConfigFromEnv(): LLMProviderConfig {
  if (process.env['CHALKBOARD_LLM'] === 'stub') return { kind: 'stub' };
  if (process.env['ANTHROPIC_API_KEY']) return { kind: 'anthropic' };
  if (process.env['OPENAI_API_KEY']) return { kind: 'openai' };
  return { kind: 'ollama' };
}
