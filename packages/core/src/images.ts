// Generate real imagery for `image` elements via OpenAI's gpt-image-2, so
// visual topics ("how the universe is aging") get actual stars/galaxies instead
// of empty hand-drawn boxes.
//
// An `image` element looks like:
//   { id, type: "image", x, y, width, height, prompt: "a spiral galaxy ...", fit? }
//
// We resolve each element's `prompt` into a data URL on `el.src`, which the
// renderer (page/player.js) preloads and draws. Generation is cached per prompt,
// capped per video, and fully skipped when no key is available or images are
// disabled — in which case the renderer draws a neutral placeholder box.

import OpenAI from 'openai';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExcalidrawElementLike, SceneScript } from '@chalkboard/shared';
import { addUsage, emptyUsage, estimateImageCostUsd, type TokenUsage } from './cost.js';

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface GenerateImagesOptions {
  apiKey?: string;
  model?: string;
  /** Image quality. Default 'medium' — cheaper than 'high'/'auto'. */
  quality?: ImageQuality;
  workDir: string;
  /** Max images generated per video (cost guard). Default 8. */
  max?: number;
  /** Max concurrent image API calls. Default 4. */
  concurrency?: number;
  onProgress?: (msg: string) => void;
}

export interface GenerateImagesResult {
  script: SceneScript;
  generated: number;
  /** True if image elements existed but no key was available to render them. */
  skippedForNoKey: boolean;
  /** Accumulated token usage across image calls. */
  usage: TokenUsage;
  /** Estimated USD spent on image generation. */
  estCostUsd: number;
}

type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';

function sizeFor(el: ExcalidrawElementLike): ImageSize {
  const w = typeof el.width === 'number' ? el.width : 1;
  const h = typeof el.height === 'number' ? el.height : 1;
  const ratio = w / Math.max(1, h);
  if (ratio > 1.25) return '1536x1024';
  if (ratio < 0.8) return '1024x1536';
  return '1024x1024';
}

function needsGeneration(el: ExcalidrawElementLike): boolean {
  return (
    el.type === 'image' &&
    typeof el['prompt'] === 'string' &&
    (el['prompt'] as string).trim().length > 0 &&
    !el['src'] &&
    !el['dataUrl']
  );
}

/** Resolve `image` element prompts into data URLs on `el.src`. Pure-ish: returns a new script. */
export async function generateSceneImages(
  script: SceneScript,
  opts: GenerateImagesOptions,
): Promise<GenerateImagesResult> {
  const targets: ExcalidrawElementLike[] = [];
  for (const scene of script.scenes) {
    for (const el of scene.elements ?? []) {
      if (needsGeneration(el)) targets.push(el);
    }
  }

  if (targets.length === 0) {
    return { script, generated: 0, skippedForNoKey: false, usage: emptyUsage(), estCostUsd: 0 };
  }

  const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    opts.onProgress?.(
      `${targets.length} image element(s) but no OPENAI_API_KEY — drawing placeholders`,
    );
    return { script, generated: 0, skippedForNoKey: true, usage: emptyUsage(), estCostUsd: 0 };
  }

  const client = new OpenAI({ apiKey });
  const model = opts.model ?? process.env['OPENAI_IMAGE_MODEL'] ?? 'gpt-image-2';
  const quality: ImageQuality = opts.quality ?? 'medium';
  const max = opts.max ?? 8;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, max));

  // Dedupe by prompt so repeated imagery in a video costs a single call, then
  // generate the unique prompts concurrently (image gen is the slowest paid
  // step and the calls are independent). Cap the number of unique generations.
  const firstSize = new Map<string, ImageSize>();
  const uniquePrompts: string[] = [];
  for (const el of targets) {
    const prompt = (el['prompt'] as string).trim();
    if (!firstSize.has(prompt)) {
      firstSize.set(prompt, sizeFor(el));
      uniquePrompts.push(prompt);
    }
  }
  const toGenerate = uniquePrompts.slice(0, max);
  if (uniquePrompts.length > max) {
    opts.onProgress?.(
      `image cap (${max}) reached — ${uniquePrompts.length - max} unique prompt(s) get placeholders`,
    );
  }

  const cache = new Map<string, string>();
  let usage: TokenUsage = emptyUsage();
  let started = 0;

  const generateOne = async (prompt: string): Promise<void> => {
    const size = firstSize.get(prompt)!;
    const n = ++started;
    opts.onProgress?.(`generating image ${n}/${toGenerate.length} (${size}, ${quality})`);
    try {
      const res = await client.images.generate({
        model,
        prompt: stylePrompt(prompt),
        size,
        quality,
        n: 1,
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error('no image data returned');
      cache.set(prompt, `data:image/png;base64,${b64}`);
      // gpt-image-2 returns token usage; accumulate for the cost estimate.
      const u = res.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      if (u) {
        usage = addUsage(usage, {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
        });
      }
      // Persist for debugging when the work dir is kept.
      await writeFile(
        join(opts.workDir, `image-${cache.size}.png`),
        Buffer.from(b64, 'base64'),
      ).catch(() => undefined);
    } catch (err) {
      opts.onProgress?.(
        `image generation failed (${err instanceof Error ? err.message : String(err)}) — placeholder`,
      );
    }
  };

  // Bounded worker pool over the unique prompts.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= toGenerate.length) return;
      await generateOne(toGenerate[i]!);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Assign generated data URLs back to every element sharing each prompt.
  for (const el of targets) {
    const url = cache.get((el['prompt'] as string).trim());
    if (url) el['src'] = url;
  }

  return {
    script,
    generated: cache.size,
    skippedForNoKey: false,
    usage,
    estCostUsd: estimateImageCostUsd(usage, model),
  };
}

// Nudge the model toward clean, on-topic illustration that composes well on a
// whiteboard rather than busy stock photography. gpt-image-2 renders text
// accurately, so we no longer blanket-forbid it: labels/callouts are allowed
// when the prompt asks for them, but we still suppress gratuitous captions and
// watermarks so plain illustrations stay clean.
function stylePrompt(prompt: string): string {
  return `${prompt}. Clean modern illustration, clear subject, simple uncluttered background, suitable as a diagram inset in an explainer video. Only include text if it is part of the requested subject (labels, a chart, a diagram); otherwise no text. No watermarks, no signatures, no borders.`;
}
