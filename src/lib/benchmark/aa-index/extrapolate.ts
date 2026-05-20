import type { AaExtrapolation, AaFixtureResult, AaProxyIndex } from "./types";
import {
  MERCURY_PUBLISHED_INDEX,
  MERCURY_PUBLISHED_INDEX_COST_USD,
  MERCURY_PUBLISHED_OUTPUT_TOKENS,
  MERCURY_PUBLISHED_TPS,
} from "./types";

function estimateSynthesisTokens(markdown: string): number {
  return Math.ceil(markdown.length / 4);
}

export function buildExtrapolation(options: {
  proxyIndex: AaProxyIndex;
  results: AaFixtureResult[];
  totalTokens: number;
  totalCouncilTokens: number;
  totalBaselineTokens: number;
}): AaExtrapolation {
  const { proxyIndex, results } = options;
  const completed = results.filter((result) => !result.skipped);

  const upliftRatio =
    proxyIndex.baseline > 0 ? proxyIndex.council / proxyIndex.baseline : 1;

  const estimatedCouncilIndex = Math.min(
    100,
    Math.max(0, MERCURY_PUBLISHED_INDEX * upliftRatio),
  );

  const sensitivity = 4;
  const estimatedCouncilIndexLow = Math.max(0, estimatedCouncilIndex - sensitivity);
  const estimatedCouncilIndexHigh = Math.min(100, estimatedCouncilIndex + sensitivity);

  const verbosityMultiplier =
    options.totalBaselineTokens > 0
      ? options.totalCouncilTokens / options.totalBaselineTokens
      : 1;

  let councilSynthTokens = 0;
  let baselineSynthTokens = 0;
  let councilMs = 0;

  for (const result of completed) {
    councilSynthTokens += estimateSynthesisTokens(result.councilMarkdown);
    baselineSynthTokens += estimateSynthesisTokens(result.baselineMarkdown);
    councilMs += result.councilDurationMs;
  }

  const synthesisLengthRatio =
    baselineSynthTokens > 0 ? councilSynthTokens / baselineSynthTokens : 1;

  const effectiveSynthesisTps =
    councilMs > 0 ? (councilSynthTokens / councilMs) * 1000 : 0;

  const categoryExtrapolations = proxyIndex.byCategory.map((entry) => ({
    category: entry.category,
    estimatedCouncil:
      entry.baseline > 0
        ? Math.min(100, MERCURY_PUBLISHED_INDEX * (entry.council / entry.baseline))
        : MERCURY_PUBLISHED_INDEX,
  }));

  return {
    mercuryPublishedIndex: MERCURY_PUBLISHED_INDEX,
    proxyCouncil: proxyIndex.council,
    proxyBaseline: proxyIndex.baseline,
    estimatedCouncilIndex,
    estimatedCouncilIndexLow,
    estimatedCouncilIndexHigh,
    upliftRatio,
    verbosityMultiplier,
    estimatedCouncilOutputTokens: Math.round(
      MERCURY_PUBLISHED_OUTPUT_TOKENS * verbosityMultiplier,
    ),
    estimatedCouncilIndexCostUsd:
      MERCURY_PUBLISHED_INDEX_COST_USD * verbosityMultiplier,
    mercuryPublishedOutputTokens: MERCURY_PUBLISHED_OUTPUT_TOKENS,
    mercuryPublishedIndexCostUsd: MERCURY_PUBLISHED_INDEX_COST_USD,
    synthesisLengthRatio,
    effectiveSynthesisTps,
    mercuryPublishedTps: MERCURY_PUBLISHED_TPS,
    categoryExtrapolations,
  };
}
