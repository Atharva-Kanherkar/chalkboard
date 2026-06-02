import OpenAI from 'openai';
import { parseSceneScript } from './parse.js';
import { systemPromptFor, userPromptFor } from './prompt.js';
import type { LLMProvider, ScriptGenerationInput } from './provider.js';
import { SCENE_SCRIPT_JSON_SCHEMA } from './schema.js';

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  /** "json_schema" (strict), "json_object" (lax), or "text". Default json_object — gpt-4o-mini's json_schema strict mode rejects additionalProperties:true. */
  structuredMode?: 'json_schema' | 'json_object' | 'text';
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly structuredMode: 'json_schema' | 'json_object' | 'text';

  constructor(opts: OpenAIProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('OpenAIProvider: OPENAI_API_KEY not set.');
    }
    this.client = new OpenAI({
      apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
    this.model = opts.model ?? process.env['OPENAI_MODEL'] ?? 'gpt-5.5';
    this.structuredMode = opts.structuredMode ?? 'json_object';
  }

  async generateScript(input: ScriptGenerationInput) {
    const responseFormat = this.buildResponseFormat();
    const response = await this.client.chat.completions.create({
      model: this.model,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      messages: [
        { role: 'system', content: systemPromptFor(input.format, { images: input.images }) },
        { role: 'user', content: userPromptFor(input) },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('OpenAIProvider: empty response');
    return parseSceneScript(text);
  }

  private buildResponseFormat() {
    if (this.structuredMode === 'text') return null;
    if (this.structuredMode === 'json_object') return { type: 'json_object' as const };
    return {
      type: 'json_schema' as const,
      json_schema: {
        name: 'scene_script',
        strict: false,
        schema: SCENE_SCRIPT_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    };
  }
}
