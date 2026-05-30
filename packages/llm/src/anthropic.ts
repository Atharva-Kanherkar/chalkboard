import Anthropic from '@anthropic-ai/sdk';
import { parseSceneScript } from './parse.js';
import { systemPromptFor, userPromptFor } from './prompt.js';
import type { LLMProvider, ScriptGenerationInput } from './provider.js';
import { SCENE_SCRIPT_JSON_SCHEMA, SCENE_SCRIPT_TOOL_NAME } from './schema.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  /** Use tool_use for structured output. Default true; set false to use plain text. */
  structured?: boolean;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly structured: boolean;

  constructor(opts: AnthropicProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'AnthropicProvider: ANTHROPIC_API_KEY not set. Pass apiKey option or set the env var.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = opts.model ?? 'claude-haiku-4-5-20251001';
    this.structured = opts.structured ?? true;
  }

  async generateScript(input: ScriptGenerationInput) {
    if (this.structured) {
      return this.generateViaTool(input);
    }
    return this.generateViaText(input);
  }

  private async generateViaTool(input: ScriptGenerationInput) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPromptFor(input.format),
      tools: [
        {
          name: SCENE_SCRIPT_TOOL_NAME,
          description:
            'Emit a SceneScript JSON document. ALWAYS call this tool exactly once with the full script.',
          input_schema: SCENE_SCRIPT_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: SCENE_SCRIPT_TOOL_NAME },
      messages: [{ role: 'user', content: userPromptFor(input) }],
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === SCENE_SCRIPT_TOOL_NAME) {
        // Anthropic already returns parsed JSON for tool_use input.
        return parseSceneScript(JSON.stringify(block.input));
      }
    }
    throw new Error('AnthropicProvider: expected tool_use block, got none');
  }

  private async generateViaText(input: ScriptGenerationInput) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPromptFor(input.format),
      messages: [{ role: 'user', content: userPromptFor(input) }],
    });
    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error(`AnthropicProvider: expected text block, got ${block?.type ?? 'none'}`);
    }
    return parseSceneScript(block.text);
  }
}
