// A stub LLM provider that returns a fixed SceneScript regardless of input.
// Intended for tests and the M2 smoke pipeline — lets us exercise the full
// generate() orchestrator without paying for inference.

import type { SceneScript } from '@chalkboard/shared';
import type { LLMProvider, ScriptGenerationInput } from './provider.js';

const DEFAULT_SCRIPT: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9', title: 'Stub Lesson' },
  scenes: [
    {
      id: 'scene-1',
      narration: 'Welcome. Today we will see chalkboard generate a video end to end.',
      elements: [
        {
          id: 's1-title',
          type: 'text',
          x: 280,
          y: 200,
          text: 'chalkboard demo',
          fontSize: 64,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
        },
        {
          id: 's1-box',
          type: 'rectangle',
          x: 280,
          y: 340,
          width: 1000,
          height: 240,
          strokeColor: '#1e1e1e',
          backgroundColor: '#a5d8ff',
          fillStyle: 'solid',
        },
        {
          id: 's1-arrow',
          type: 'arrow',
          x: 1330,
          y: 460,
          width: 220,
          height: 0,
          points: [
            [0, 0],
            [220, 0],
          ],
          strokeColor: '#1e1e1e',
          endArrowhead: 'arrow',
        },
        {
          id: 's1-circle',
          type: 'ellipse',
          x: 1580,
          y: 400,
          width: 220,
          height: 140,
          strokeColor: '#1e1e1e',
          backgroundColor: '#ffec99',
          fillStyle: 'solid',
        },
      ],
    },
    {
      id: 'scene-2',
      narration: 'Second beat: a different layout with a diamond and a line.',
      elements: [
        {
          id: 's2-diamond',
          type: 'diamond',
          x: 740,
          y: 320,
          width: 440,
          height: 440,
          strokeColor: '#1e1e1e',
          backgroundColor: '#b2f2bb',
          fillStyle: 'solid',
        },
        {
          id: 's2-line',
          type: 'line',
          x: 540,
          y: 800,
          width: 840,
          height: 0,
          points: [
            [0, 0],
            [840, 0],
          ],
          strokeColor: '#1e1e1e',
        },
        {
          id: 's2-label',
          type: 'text',
          x: 740,
          y: 820,
          text: 'baseline',
          fontSize: 28,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
        },
      ],
    },
  ],
};

export class StubLLMProvider implements LLMProvider {
  readonly name = 'stub';
  private readonly script: SceneScript;

  constructor(opts: { script?: SceneScript } = {}) {
    this.script = opts.script ?? DEFAULT_SCRIPT;
  }

  async generateScript(input: ScriptGenerationInput): Promise<SceneScript> {
    return {
      ...this.script,
      meta: {
        ...this.script.meta,
        language: input.language,
        aspectRatio: input.aspectRatio,
        title: this.script.meta.title ?? input.prompt.slice(0, 40),
      },
    };
  }
}
