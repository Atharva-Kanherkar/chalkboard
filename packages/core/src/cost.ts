// Rough cost estimation for the paid steps of a render. Image generation is the
// dominant, highly-variable cost, so we track its token usage and turn it into
// an estimated dollar figure. Prices change — they live here as plain constants
// so they're easy to update, and every figure we surface is labelled "est.".

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Image-model token pricing (USD per 1M tokens). Update if OpenAI changes it.
// Keyed by model id; `default` is used for unknown models.
export const IMAGE_PRICING_BY_MODEL: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  // gpt-image-1: cheaper image (output) tokens, dearer text (input) tokens.
  'gpt-image-1': { inputPerMillion: 5, outputPerMillion: 40 },
  // gpt-image-2 (released 2026-04-21): better text rendering; $8 in / $30 out.
  'gpt-image-2': { inputPerMillion: 8, outputPerMillion: 30 },
  default: { inputPerMillion: 8, outputPerMillion: 30 },
};

/** Pricing for a given model id, falling back to `default`. */
export function pricingFor(model?: string): { inputPerMillion: number; outputPerMillion: number } {
  if (model && IMAGE_PRICING_BY_MODEL[model]) return IMAGE_PRICING_BY_MODEL[model]!;
  return IMAGE_PRICING_BY_MODEL['default']!;
}

/** @deprecated use pricingFor(model). Kept for back-compat; defaults to gpt-image-1. */
export const IMAGE_PRICING = IMAGE_PRICING_BY_MODEL['gpt-image-1']!;

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** Estimated USD for image generation given accumulated token usage. */
export function estimateImageCostUsd(usage: TokenUsage, model?: string): number {
  const price = pricingFor(model);
  const cost =
    (usage.inputTokens / 1_000_000) * price.inputPerMillion +
    (usage.outputTokens / 1_000_000) * price.outputPerMillion;
  // round to 4 dp — image costs are fractions of a cent to a couple of cents
  return Math.round(cost * 10_000) / 10_000;
}

/** Human-readable cost line, e.g. "~$0.4210 for 7 image(s) (est.)". */
export function formatImageCost(usage: TokenUsage, count: number, model?: string): string {
  const usd = estimateImageCostUsd(usage, model);
  return `~$${usd.toFixed(4)} for ${count} image(s) (est.)`;
}
