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
    version: { type: 'string', enum: ['1'] },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['language', 'aspectRatio'],
      properties: {
        language: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
        title: { type: 'string' },
        voice: { type: 'string' },
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
        },
      },
    },
  },
} as const;
