// Ollama adapter — uses the local Ollama HTTP API. Free, low-latency once the
// model is warm, lower quality than frontier models. Default model is llama3.1
// but any installed model works.

import { parseSceneScript } from './parse.js';
import { SYSTEM_PROMPT, userPromptFor } from './prompt.js';
import type { LLMProvider, ScriptGenerationInput } from './provider.js';

export interface OllamaProviderOptions {
  baseURL?: string;
  model?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private readonly baseURL: string;
  private readonly model: string;

  constructor(opts: OllamaProviderOptions = {}) {
    this.baseURL = opts.baseURL ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
    this.model = opts.model ?? process.env['OLLAMA_MODEL'] ?? 'llama3.1:8b';
  }

  async generateScript(input: ScriptGenerationInput) {
    const url = `${this.baseURL.replace(/\/$/, '')}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPromptFor(input) },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`OllamaProvider: HTTP ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { message?: { content?: string } };
    const text = body.message?.content;
    if (!text) throw new Error('OllamaProvider: empty response');
    return parseSceneScript(text);
  }
}
