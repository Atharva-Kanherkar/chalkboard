import Anthropic from '@anthropic-ai/sdk';
import { parseSceneScript } from './parse.js';
import { SYSTEM_PROMPT, userPromptFor } from './prompt.js';
import type { LLMProvider, ScriptGenerationInput } from './provider.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'AnthropicProvider: ANTHROPIC_API_KEY not set. Pass apiKey option or set the env var.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = opts.model ?? 'claude-haiku-4-5-20251001';
  }

  async generateScript(input: ScriptGenerationInput) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPromptFor(input) }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error(`AnthropicProvider: expected text block, got ${block?.type ?? 'none'}`);
    }
    return parseSceneScript(block.text);
  }
}
