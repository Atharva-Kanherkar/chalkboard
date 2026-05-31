import type { SceneScript } from '@chalkboard/shared';
import type { ScriptBrief, ScriptFormat } from './prompt.js';

export interface ScriptGenerationInput {
  prompt: string;
  language: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  /**
   * 'short' = hook-first vertical reel; 'cinematic' = research-backed
   * documentary (consumes `brief`). Default 'explainer'.
   */
  format?: ScriptFormat;
  /** Research brief for the `cinematic` format — its findings/sources ground the script. */
  brief?: ScriptBrief;
}

export interface LLMProvider {
  readonly name: string;
  generateScript(input: ScriptGenerationInput): Promise<SceneScript>;
}
