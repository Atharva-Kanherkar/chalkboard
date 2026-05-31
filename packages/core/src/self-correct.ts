// Self-correcting render (opt-in). The pipeline isn't live, so we can afford to
// look at what we drew and fix it before finalizing.
//
// Two layers:
//   1. Deterministic repair (always on, see @chalkboard/whiteboard repairScript)
//      clamps overflow, de-dupes text, separates overlaps — no API calls.
//   2. Vision critique (this module, opt-in): render each scene's FINAL state to
//      a still PNG, send it to a vision model, and apply the corrected elements
//      it returns. Bounded iterations; stills (not re-rendered video) keep it
//      cheap. Generalizes layer 1 — it catches the things geometry alone can't
//      (unreadable contrast, awkward composition, a scene that reads as empty).

import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import type { ExcalidrawElementLike, SceneScript } from '@chalkboard/shared';
import { screenshotScenes } from '@chalkboard/renderer';
import { repairScript } from '@chalkboard/whiteboard';

export interface SelfCorrectOptions {
  apiKey?: string;
  /** Vision-capable model. Default gpt-5.5 (override via OPENAI_VISION_MODEL). */
  model?: string;
  /** Max critique passes. Default 1. */
  iterations?: number;
  workDir: string;
  onProgress?: (msg: string) => void;
}

export interface SelfCorrectResult {
  script: SceneScript;
  fixedScenes: number;
  passes: number;
  skippedForNoKey: boolean;
}

interface Critique {
  ok: boolean;
  issues?: string[];
  elements?: ExcalidrawElementLike[];
}

const SYSTEM = `You are a layout QA reviewer for whiteboard-style explainer videos on a 1920x1080 canvas (vertical/square use the stated size). You are shown a screenshot of ONE scene's final drawn state plus the JSON elements that produced it.

Your TOP priority is OVERLAPPING / COLLIDING TEXT — be aggressive about it. Look carefully:
- ANY text glyphs sitting on top of other text, a label, a shape border, or an image so it's hard to read — move or shrink the offending element until there is clear breathing room. This is the #1 thing to fix.
- text bleeding outside its container box, or two labels whose bounding boxes intersect.

Also flag:
- elements cut off by or touching the canvas edge (keep everything within 80px of every edge)
- the scene reading as empty or nearly empty
- text too small or low-contrast to read

Be decisive: if anything overlaps even slightly, return ok:false and fix it. Prefer nudging positions and reducing fontSize/maxWidth to create separation over deleting content.

If the scene looks good, return {"ok": true}.
If NOT, return {"ok": false, "issues": ["..."], "elements": [ ...full corrected elements array... ]}.
When you return elements: keep the same element ids and types, preserve everything that's fine, and only move/resize/restyle/remove what's broken. Use the same fields the input uses (x, y, width, height, text, fontSize, maxWidth, containerId, from, to, etc.). Do not invent unrelated content. Output JSON only.`;

function visionModel(opts: SelfCorrectOptions): string {
  return opts.model ?? process.env['OPENAI_VISION_MODEL'] ?? 'gpt-5.5';
}

async function critiqueScene(
  client: OpenAI,
  model: string,
  pngPath: string,
  scene: SceneScript['scenes'][number],
  canvasNote: string,
): Promise<Critique> {
  const b64 = (await readFile(pngPath)).toString('base64');
  const res = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${canvasNote}\nScene id: ${scene.id}\nElements JSON:\n${JSON.stringify(
              scene.elements ?? [],
            )}`,
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'auto' } },
        ],
      },
    ],
  });
  const text = res.choices?.[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(text) as Critique;
    return parsed;
  } catch {
    return { ok: true };
  }
}

/** Vision critique loop. Returns the (possibly) corrected script. */
export async function selfCorrectScript(
  script: SceneScript,
  opts: SelfCorrectOptions,
): Promise<SelfCorrectResult> {
  const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    opts.onProgress?.('self-correct requested but no OPENAI_API_KEY — skipping vision pass');
    return { script, fixedScenes: 0, passes: 0, skippedForNoKey: true };
  }

  const client = new OpenAI({ apiKey });
  const model = visionModel(opts);
  const maxPasses = Math.max(1, opts.iterations ?? 1);
  const { width, height } = canvasSize(script.meta.aspectRatio);
  const canvasNote = `Canvas is ${width}x${height}. Keep all elements within 80px of every edge.`;

  let current = script;
  let totalFixed = 0;
  let passes = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    passes += 1;
    opts.onProgress?.(`vision pass ${pass + 1}/${maxPasses}: screenshotting scenes`);
    const shots = await screenshotScenes({ script: current, workDir: opts.workDir });

    let fixedThisPass = 0;
    const scenes = [...current.scenes];
    for (let i = 0; i < scenes.length; i++) {
      const pngPath = shots.paths[i];
      if (!pngPath) continue;
      try {
        const verdict = await critiqueScene(client, model, pngPath, scenes[i]!, canvasNote);
        if (!verdict.ok && Array.isArray(verdict.elements) && verdict.elements.length > 0) {
          opts.onProgress?.(
            `scene ${i + 1}: fixing (${(verdict.issues ?? []).join('; ') || 'layout'})`,
          );
          scenes[i] = { ...scenes[i]!, elements: verdict.elements };
          fixedThisPass += 1;
        }
      } catch (err) {
        opts.onProgress?.(
          `scene ${i + 1}: vision critique failed (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }

    if (fixedThisPass === 0) {
      opts.onProgress?.(`vision pass ${pass + 1}: no changes — converged`);
      break;
    }

    totalFixed += fixedThisPass;
    // Re-run deterministic repair over the model's edits before the next look.
    current = repairScript({ ...current, scenes }).script;
  }

  return { script: current, fixedScenes: totalFixed, passes, skippedForNoKey: false };
}

function canvasSize(ar: SceneScript['meta']['aspectRatio']): { width: number; height: number } {
  if (ar === '9:16') return { width: 1080, height: 1920 };
  if (ar === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}
