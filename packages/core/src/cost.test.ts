import { describe, expect, it } from 'vitest';
import { addUsage, emptyUsage, estimateImageCostUsd, formatImageCost } from './cost.js';

describe('cost', () => {
  it('starts empty and adds usage', () => {
    const u = addUsage(emptyUsage(), { inputTokens: 100, outputTokens: 1056 });
    expect(u).toEqual({ inputTokens: 100, outputTokens: 1056 });
  });

  it('estimates gpt-image-1 cost from tokens', () => {
    // 1056 output tokens @ $40/1M ≈ $0.04224, plus 100 input @ $5/1M = $0.0005
    const usd = estimateImageCostUsd({ inputTokens: 100, outputTokens: 1056 }, 'gpt-image-1');
    expect(usd).toBeCloseTo(0.0427, 4);
  });

  it('estimates gpt-image-2 cost from tokens (the default model)', () => {
    // 1056 output tokens @ $30/1M = $0.03168, plus 100 input @ $8/1M = $0.0008
    const usd = estimateImageCostUsd({ inputTokens: 100, outputTokens: 1056 }, 'gpt-image-2');
    expect(usd).toBeCloseTo(0.0325, 4);
    // No model id → falls back to the default pricing (gpt-image-2).
    expect(estimateImageCostUsd({ inputTokens: 100, outputTokens: 1056 })).toBeCloseTo(0.0325, 4);
  });

  it('is zero for no usage', () => {
    expect(estimateImageCostUsd(emptyUsage())).toBe(0);
  });

  it('scales linearly with output tokens (7 medium images)', () => {
    const one = estimateImageCostUsd({ inputTokens: 0, outputTokens: 1584 }, 'gpt-image-2');
    const seven = estimateImageCostUsd({ inputTokens: 0, outputTokens: 1584 * 7 }, 'gpt-image-2');
    // ~linear; allow for the 4-dp rounding inside the estimator
    expect(seven).toBeCloseTo(one * 7, 2);
  });

  it('formats a readable cost line', () => {
    const line = formatImageCost({ inputTokens: 0, outputTokens: 1056 }, 1, 'gpt-image-1');
    expect(line).toMatch(/^~\$0\.0422 for 1 image\(s\) \(est\.\)$/);
  });
});
