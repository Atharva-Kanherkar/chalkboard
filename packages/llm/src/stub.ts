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

// Vertical 1080x1920 short, big fonts, top-to-bottom — used by Demo mode in the
// Reels lane so it renders correctly without an LLM call.
const SHORT_SCRIPT: SceneScript = {
  version: '1',
  meta: { language: 'en', aspectRatio: '9:16', title: 'Stub Short' },
  scenes: [
    {
      id: 'short-1',
      narration: "Here's something most people never stop to think about.",
      elements: [
        {
          id: 'h-title',
          type: 'text',
          x: 100,
          y: 240,
          text: 'Wait…',
          fontSize: 104,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
          maxWidth: 880,
          textAlign: 'center',
        },
        {
          id: 'h-star',
          type: 'svg',
          x: 380,
          y: 720,
          width: 320,
          height: 320,
          motif: 'star',
          color: '#f08c00',
        },
      ],
    },
    {
      id: 'short-2',
      narration: 'This whole vertical video was generated from a single prompt.',
      elements: [
        {
          id: 's2-title',
          type: 'text',
          x: 100,
          y: 240,
          text: 'One prompt in',
          fontSize: 84,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
          maxWidth: 880,
          textAlign: 'center',
        },
        {
          id: 's2-box',
          type: 'rectangle',
          x: 240,
          y: 720,
          width: 600,
          height: 380,
          strokeColor: '#1e1e1e',
          backgroundColor: '#a5d8ff',
          fillStyle: 'solid',
        },
        {
          id: 's2-label',
          type: 'text',
          x: 300,
          y: 860,
          text: 'a video out',
          fontSize: 56,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
          maxWidth: 480,
          textAlign: 'center',
        },
      ],
    },
    {
      id: 'short-3',
      narration: "It's open source, and it runs on your own machine. Follow for more.",
      elements: [
        {
          id: 's3-title',
          type: 'text',
          x: 100,
          y: 260,
          text: 'Open source.',
          fontSize: 92,
          fontFamily: 1,
          strokeColor: '#1e1e1e',
          maxWidth: 880,
          textAlign: 'center',
        },
        {
          id: 's3-check',
          type: 'svg',
          x: 400,
          y: 760,
          width: 280,
          height: 280,
          motif: 'check',
          color: '#2f9e44',
        },
      ],
    },
  ],
};

// Cinematic ScriptDoc v2: full-frame images, a knowledge-gap arc with per-scene
// beat/delivery/mood, and claims cited into the sources table. Used by Demo mode
// and tests so the cinematic lane works without an LLM or research call.
const CINEMATIC_SCRIPT: SceneScript = {
  version: '2',
  meta: {
    language: 'en',
    aspectRatio: '16:9',
    title: 'Stub Cinematic',
    format: 'cinematic',
    voices: { narrator: 'default' },
    mood: 'mystery',
  },
  sources: [
    { id: 's1', url: 'https://example.org/primary', title: 'Primary source' },
    { id: 's2', url: 'https://example.org/review', title: 'Review article' },
  ],
  scenes: [
    {
      id: 'cine-1',
      narration: "You've been told this is simple. It isn't — and the truth is stranger.",
      beat: 'hook',
      delivery: { voice: 'narrator', emotion: 'curious, hushed', pace: 'slow' },
      mood: 'mystery',
      cites: ['s1'],
      elements: [
        {
          id: 'c1-img',
          type: 'image',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          prompt: 'a vast dark cosmic scene, cinematic, dramatic lighting',
        },
        {
          id: 'c1-t',
          type: 'text',
          x: 120,
          y: 900,
          text: "Wait — that's not why.",
          fontSize: 72,
          fontFamily: 1,
          strokeColor: '#ffffff',
        },
      ],
    },
    {
      id: 'cine-2',
      narration: 'Here is the mechanism almost no one explains correctly.',
      beat: 'tension',
      delivery: { voice: 'narrator', emotion: 'building urgency', pace: 'normal' },
      mood: 'dramatic',
      cites: ['s1', 's2'],
      elements: [
        {
          id: 'c2-img',
          type: 'image',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          prompt: 'an intricate diagram glowing against darkness, cinematic',
        },
        {
          id: 'c2-t',
          type: 'text',
          x: 120,
          y: 140,
          text: 'The real reason',
          fontSize: 64,
          fontFamily: 1,
          strokeColor: '#ffffff',
        },
      ],
    },
    {
      id: 'cine-3',
      narration: "And once you see it, you can't unsee it. That's the beauty of it.",
      beat: 'payoff',
      delivery: { voice: 'narrator', emotion: 'warm, resolved', pace: 'slow' },
      mood: 'wonder',
      cites: ['s2'],
      elements: [
        {
          id: 'c3-img',
          type: 'image',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          prompt: 'a sweeping hopeful vista at golden hour, cinematic',
        },
        {
          id: 'c3-t',
          type: 'text',
          x: 120,
          y: 900,
          text: 'Now you see it.',
          fontSize: 72,
          fontFamily: 1,
          strokeColor: '#ffffff',
        },
      ],
    },
  ],
};

export class StubLLMProvider implements LLMProvider {
  readonly name = 'stub';
  private readonly script: SceneScript | undefined;

  constructor(opts: { script?: SceneScript } = {}) {
    this.script = opts.script;
  }

  async generateScript(input: ScriptGenerationInput): Promise<SceneScript> {
    // An explicit override always wins; otherwise pick the script that matches
    // the requested format so Demo mode looks right in every lane.
    const base =
      this.script ??
      (input.format === 'short'
        ? SHORT_SCRIPT
        : input.format === 'cinematic'
          ? CINEMATIC_SCRIPT
          : DEFAULT_SCRIPT);
    return {
      ...base,
      meta: {
        ...base.meta,
        language: input.language,
        aspectRatio: input.aspectRatio,
        title: base.meta.title ?? input.prompt.slice(0, 40),
      },
    };
  }
}
