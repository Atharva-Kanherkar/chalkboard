// JSON Schema for SceneScript output. Used by structured-output modes on
// providers that support it (Anthropic tool_use, OpenAI response_format
// json_schema). Schemas have to be conservative because providers reject
// anyOf/$ref shapes inconsistently — so we describe a permissive Drawable
// (`additionalProperties: true`) and rely on the renderer to handle unknown
// fields gracefully.

export const SCENE_SCRIPT_TOOL_NAME = 'emit_scene_script';

export const SCENE_SCRIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'meta', 'scenes'],
  properties: {
    version: { type: 'string', enum: ['1', '2'] },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'url'],
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          title: { type: 'string' },
          publisher: { type: 'string' },
          quote: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['language', 'aspectRatio'],
      properties: {
        language: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
        title: { type: 'string' },
        voice: { type: 'string' },
        mood: {
          type: 'string',
          enum: ['wonder', 'mystery', 'dramatic', 'upbeat', 'calm', 'none'],
        },
        format: { type: 'string', enum: ['explainer', 'short', 'cinematic'] },
        voices: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    scenes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'narration', 'elements'],
        properties: {
          id: { type: 'string' },
          narration: { type: 'string' },
          elements: {
            type: 'array',
            items: {
              // Permissive: any object with at least id+type. The renderer
              // dispatches on type; unknown fields are passed through and
              // ignored when irrelevant.
              type: 'object',
              required: ['id', 'type'],
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
              },
              additionalProperties: true,
            },
          },
          staggerMs: { type: 'number' },
          drawDurationMs: { type: 'number' },
          holdMs: { type: 'number' },
          beat: { type: 'string', enum: ['hook', 'setup', 'tension', 'reveal', 'payoff'] },
          delivery: {
            type: 'object',
            properties: {
              voice: { type: 'string' },
              emotion: { type: 'string' },
              pace: { type: 'string', enum: ['slow', 'normal', 'fast'] },
            },
            additionalProperties: true,
          },
          cites: { type: 'array', items: { type: 'string' } },
          mood: {
            type: 'string',
            enum: ['wonder', 'mystery', 'dramatic', 'upbeat', 'calm', 'none'],
          },
        },
      },
    },
  },
} as const;
