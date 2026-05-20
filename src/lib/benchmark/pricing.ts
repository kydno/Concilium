/** Mercury 2 API pricing (matches `scripts/compare-benchmark-runs.ts`). */
export const MERCURY_INPUT_USD_PER_M = 0.25;
export const MERCURY_OUTPUT_USD_PER_M = 0.75;

/** When only `total_tokens` is available, assume this input share for cost estimates. */
export const MERCURY_TOTAL_TOKEN_INPUT_SHARE = 0.3;

export function mercuryApiCostUsd(totalTokens: number): number {
  if (totalTokens <= 0) return 0;
  const inputTokens = totalTokens * MERCURY_TOTAL_TOKEN_INPUT_SHARE;
  const outputTokens = totalTokens - inputTokens;
  return (
    (inputTokens / 1_000_000) * MERCURY_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * MERCURY_OUTPUT_USD_PER_M
  );
}
