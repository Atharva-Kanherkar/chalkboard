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

  // Cache by prompt so repeated imagery in a video costs one call.
  const cache = new Map<string, string>();
  let generated = 0;
  let usage: TokenUsage = emptyUsage();

  for (const el of targets) {
    if (generated >= max) {
      opts.onProgress?.(`image cap (${max}) reached — remaining elements get placeholders`);
      break;
    }
    const prompt = (el['prompt'] as string).trim();
    const cached = cache.get(prompt);
    if (cached) {
      el['src'] = cached;
      continue;
    }

    const size = sizeFor(el);
    opts.onProgress?.(
      `generating image ${generated + 1}/${Math.min(targets.length, max)} (${size}, ${quality})`,
    );
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
      const dataUrl = `data:image/png;base64,${b64}`;
      el['src'] = dataUrl;
      cache.set(prompt, dataUrl);
      generated += 1;
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
        join(opts.workDir, `image-${generated}.png`),
        Buffer.from(b64, 'base64'),
      ).catch(() => undefined);
    } catch (err) {
      opts.onProgress?.(
        `image generation failed (${err instanceof Error ? err.message : String(err)}) — placeholder`,
      );
    }
  }

  return {
    script,
    generated,
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
