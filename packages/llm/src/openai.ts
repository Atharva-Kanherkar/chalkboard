import OpenAI from 'openai';
import { parseSceneScript } from './parse.js';
import { SYSTEM_PROMPT, userPromptFor } from './prompt.js';
import type { LLMProvider, ScriptGenerationInput } from './provider.js';

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: OpenAIProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('OpenAIProvider: OPENAI_API_KEY not set.');
    }
    this.client = new OpenAI({
      apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
    this.model = opts.model ?? 'gpt-4o-mini';
  }

  async generateScript(input: ScriptGenerationInput) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPromptFor(input) },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('OpenAIProvider: empty response');
    return parseSceneScript(text);
  }
}
