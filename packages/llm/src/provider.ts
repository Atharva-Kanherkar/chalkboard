import type { SceneScript } from '@chalkboard/shared';

export interface ScriptGenerationInput {
  prompt: string;
  language: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  /** 'short' switches to a hook-first vertical reel script. Default 'explainer'. */
  format?: 'explainer' | 'short';
}

export interface LLMProvider {
  readonly name: string;
  generateScript(input: ScriptGenerationInput): Promise<SceneScript>;
}
