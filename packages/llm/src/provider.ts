import type { SceneScript } from '@chalkboard/shared';

export interface ScriptGenerationInput {
  prompt: string;
  language: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

export interface LLMProvider {
  readonly name: string;
  generateScript(input: ScriptGenerationInput): Promise<SceneScript>;
}
