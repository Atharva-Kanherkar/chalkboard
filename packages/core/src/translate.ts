// Localize a finalized script into another language for "dub" output. We keep
// the layout, ids, coordinates and generated images identical and only swap the
// human-readable strings (scene narration + on-canvas text), so one production
// becomes many localized cuts. In-image text (baked into generated images) stays
// in the base language; on-canvas captions/labels + the voiceover localize.

import OpenAI from 'openai';
import type { ExcalidrawElementLike, SceneScript } from '@chalkboard/shared';

export interface TranslateOptions {
  apiKey?: string;
  model?: string;
  onProgress?: (msg: string) => void;
}

/**
 * Translate a script's narration + text elements into `targetLanguage`.
 * Returns a new script; the original is untouched. Falls back to the original
 * (unchanged) when no OpenAI key is available.
 */
export async function translateScript(
  script: SceneScript,
  targetLanguage: string,
  opts: TranslateOptions = {},
): Promise<SceneScript> {
  const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];

  // Gather every translatable string with a path back to where it lives.
  type Slot = { sceneIdx: number; elIdx: number | null }; // elIdx null => narration
  const slots: Slot[] = [];
  const texts: string[] = [];
  script.scenes.forEach((scene, sceneIdx) => {
    if (scene.narration && scene.narration.trim()) {
      slots.push({ sceneIdx, elIdx: null });
      texts.push(scene.narration);
    }
    (scene.elements ?? []).forEach((el, elIdx) => {
      if (typeof el['text'] === 'string' && el['text'].trim()) {
        slots.push({ sceneIdx, elIdx });
        texts.push(el['text'] as string);
      }
    });
  });

  if (texts.length === 0 || !apiKey) {
    if (!apiKey) opts.onProgress?.(`no OPENAI_API_KEY — skipping translation to ${targetLanguage}`);
    return { ...script, meta: { ...script.meta, language: targetLanguage } };
  }

  opts.onProgress?.(`translating ${texts.length} strings to ${targetLanguage}`);
  const client = new OpenAI({ apiKey });
  const model = opts.model ?? process.env['OPENAI_TRANSLATE_MODEL'] ?? 'gpt-4o-mini';

  const res = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          `You are a localization engine for an explainer video. Translate each string into ${targetLanguage}, ` +
          `preserving meaning, tone, and any numbers/units/code/identifiers verbatim. Keep translations concise ` +
          `(similar length to the source so they still fit on screen). Return ONLY JSON: ` +
          `{"translations": ["...", ...]} with exactly the same number of items, in the same order.`,
      },
      { role: 'user', content: JSON.stringify({ strings: texts }) },
    ],
  });

  let translations: string[] = [];
  try {
    const parsed = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as {
      translations?: string[];
    };
    if (Array.isArray(parsed.translations)) translations = parsed.translations;
  } catch {
    /* fall through to length check */
  }
  if (translations.length !== texts.length) {
    opts.onProgress?.(`translation count mismatch for ${targetLanguage} — keeping original text`);
    return { ...script, meta: { ...script.meta, language: targetLanguage } };
  }

  // Rebuild the script with translated strings slotted back in place.
  const scenes = script.scenes.map((s) => ({
    ...s,
    elements: s.elements ? s.elements.map((e) => ({ ...e }) as ExcalidrawElementLike) : s.elements,
  }));
  slots.forEach((slot, i) => {
    const t = translations[i]!;
    if (slot.elIdx === null) scenes[slot.sceneIdx]!.narration = t;
    else (scenes[slot.sceneIdx]!.elements![slot.elIdx] as ExcalidrawElementLike)['text'] = t;
  });

  return { ...script, meta: { ...script.meta, language: targetLanguage }, scenes };
}
