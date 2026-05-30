// Rough cost estimation for the paid steps of a render. Image generation is the
// dominant, highly-variable cost, so we track its token usage and turn it into
// an estimated dollar figure. Prices change — they live here as plain constants
// so they're easy to update, and every figure we surface is labelled "est.".

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// gpt-image-1 token pricing (USD per 1M tokens). Update if OpenAI changes it.
export const IMAGE_PRICING = {
  inputPerMillion: 5, // text prompt tokens
  outputPerMillion: 40, // generated image tokens
};

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
export function estimateImageCostUsd(usage: TokenUsage): number {
  const cost =
    (usage.inputTokens / 1_000_000) * IMAGE_PRICING.inputPerMillion +
    (usage.outputTokens / 1_000_000) * IMAGE_PRICING.outputPerMillion;
  // round to 4 dp — image costs are fractions of a cent to a couple of cents
  return Math.round(cost * 10_000) / 10_000;
}

/** Human-readable cost line, e.g. "~$0.4210 for 7 image(s) (est.)". */
export function formatImageCost(usage: TokenUsage, count: number): string {
  const usd = estimateImageCostUsd(usage);
  return `~$${usd.toFixed(4)} for ${count} image(s) (est.)`;
}
