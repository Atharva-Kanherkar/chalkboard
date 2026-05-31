// Loose JSON parsing for model output. Handles common deviations (markdown
// fences, trailing prose) and gives an actionable error if it can't recover.

import type { SceneScript } from '@chalkboard/shared';

export function parseSceneScript(raw: string): SceneScript {
  const cleaned = stripFences(raw).trim();
  // Try the whole string first; fall back to first {...} chunk if there's prose around it.
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) {
      throw new Error(`LLM did not return JSON. First 200 chars: ${cleaned.slice(0, 200)}`);
    }
    parsed = JSON.parse(cleaned.slice(first, last + 1));
  }

  assertScript(parsed);
  return parsed;
}

function stripFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return s;
}

function assertScript(x: unknown): asserts x is SceneScript {
  if (!x || typeof x !== 'object') throw new Error('SceneScript: not an object');
  const o = x as Record<string, unknown>;
  if (o['version'] !== '1' && o['version'] !== '2')
    throw new Error(`SceneScript: bad version ${String(o['version'])}`);
  if (!o['meta'] || typeof o['meta'] !== 'object') throw new Error('SceneScript: missing meta');
  if (!Array.isArray(o['scenes']) || o['scenes'].length === 0)
    throw new Error('SceneScript: missing or empty scenes');
}
