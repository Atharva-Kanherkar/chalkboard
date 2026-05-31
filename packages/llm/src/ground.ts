// Ground a generated cinematic script in its research brief: the brief's
// sources are AUTHORITATIVE (real, fetched URLs) — we inject them as the
// script's citation table rather than trusting the model to copy URLs, and we
// drop any scene `cites` that don't resolve to a real source id. This keeps the
// "every claim links to a real source" gate intact through the script stage.

import type { SceneScript, SourceRef } from '@chalkboard/shared';
import type { ScriptBrief } from './prompt.js';

export function groundScriptInBrief(script: SceneScript, brief: ScriptBrief): SceneScript {
  const sources: SourceRef[] = brief.sources.map((s) => ({
    id: s.id,
    url: s.url,
    ...(s.title ? { title: s.title } : {}),
  }));
  const validIds = new Set(sources.map((s) => s.id));

  const scenes = script.scenes.map((sc) =>
    sc.cites ? { ...sc, cites: sc.cites.filter((c) => validIds.has(c)) } : sc,
  );

  return { ...script, version: '2', sources, scenes };
}
