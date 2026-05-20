import {
  gdpvalRetryHintForFixture,
  gdpvalRetryHintForIssues,
  lintGdpvalDeliverable,
} from "../../synthesis-lint";
import type {
  AaExtrapolation,
  AaFixtureResult,
  AaProxyIndex,
  AaRunSummary,
  FullCouncilLossEntry,
  GdpvalAbEntry,
  GdpvalLossEntry,
} from "./types";

export function resolveGdpvalRetryHint(
  result: AaFixtureResult,
): string | undefined {
  const lintIssues = lintGdpvalDeliverable(
    result.councilMarkdown,
    result.fixtureId,
  );
  return (
    gdpvalRetryHintForFixture(result.fixtureId) ??
    gdpvalRetryHintForIssues(lintIssues) ??
    (result.councilGrade?.detail
      ? `Review rubric feedback: ${result.councilGrade.detail.slice(0, 120)}`
      : undefined)
  );
}

export function buildGdpvalLossDigest(
  results: AaFixtureResult[],
): GdpvalLossEntry[] {
  return results
    .filter(
      (result) =>
        !result.skipped &&
        result.aaEval === "gdpval-aa" &&
        (result.councilGrade?.score ?? 0) < (result.baselineGrade?.score ?? 0),
    )
    .map((result) => ({
      fixtureId: result.fixtureId,
      councilScore: (result.councilGrade?.score ?? 0) * 100,
      baselineScore: (result.baselineGrade?.score ?? 0) * 100,
      councilRubric:
        result.councilRubricNormalized !== undefined
          ? result.councilRubricNormalized * 100
          : undefined,
      baselineRubric:
        result.baselineRubricNormalized !== undefined
          ? result.baselineRubricNormalized * 100
          : undefined,
      detail: result.councilGrade?.detail,
      retryHint: resolveGdpvalRetryHint(result),
    }))
    .sort((a, b) => a.councilScore - b.councilScore);
}

export function buildGdpvalAbReport(
  results: AaFixtureResult[],
): GdpvalAbEntry[] | undefined {
  const entries: GdpvalAbEntry[] = results
    .filter((result) => !result.skipped && result.gdpvalAb)
    .map((result) => ({
      fixtureId: result.fixtureId,
      productionMode: result.gdpvalAb!.productionMode,
      productionScore: result.gdpvalAb!.productionScore,
      altMode: result.gdpvalAb!.altMode,
      altScore: result.gdpvalAb!.altScore,
      scoreDelta: result.gdpvalAb!.scoreDelta,
    }));
  return entries.length > 0 ? entries : undefined;
}

export function buildFullCouncilLossDigest(
  results: AaFixtureResult[],
): FullCouncilLossEntry[] {
  return results
    .filter(
      (result) =>
        !result.skipped &&
        result.routingMode === "full" &&
        (result.councilGrade?.score ?? 0) < (result.baselineGrade?.score ?? 0),
    )
    .map((result) => ({
      fixtureId: result.fixtureId,
      aaEval: result.aaEval,
      councilScore: (result.councilGrade?.score ?? 0) * 100,
      baselineScore: (result.baselineGrade?.score ?? 0) * 100,
      detail: result.councilGrade?.detail,
    }))
    .sort((a, b) => a.councilScore - b.councilScore);
}

export function formatAaSummaryMarkdown(summary: AaRunSummary): string {
  const {
    proxyIndex,
    extrapolation,
    routingStats,
    fullCouncilLossDigest,
    gdpvalLossDigest,
    gdpvalAbReport,
  } = summary;

  const evalTable = proxyIndex.byEval
    .map(
      (entry) =>
        `| ${entry.evalId} | ${(entry.weight * 100).toFixed(2)}% | ${entry.fixtureCount} | ${entry.councilScore.toFixed(1)} | ${entry.baselineScore.toFixed(1)} |`,
    )
    .join("\n");

  const categoryTable = proxyIndex.byCategory
    .map(
      (entry) => {
        const est = extrapolation.categoryExtrapolations.find(
          (item) => item.category === entry.category,
        );
        return `| ${entry.category} | ${entry.council.toFixed(1)} | ${entry.baseline.toFixed(1)} | ${est?.estimatedCouncil.toFixed(1) ?? "n/a"} |`;
      },
    )
    .join("\n");

  return [
    `# AA Intelligence Index proxy — ${summary.runId}`,
    "",
    `**Started:** ${summary.startedAt}`,
    `**Finished:** ${summary.finishedAt}`,
    "",
    "## Coverage",
    `- Fixtures: ${summary.fixtureCount} (${summary.completedCount} completed)`,
    `- Total tokens: ${summary.totalTokens.toLocaleString()} / ${summary.tokenBudget.toLocaleString()}`,
    `- Council API tokens: ${summary.totalCouncilTokens.toLocaleString()}`,
    `- Baseline API tokens: ${summary.totalBaselineTokens.toLocaleString()}`,
    ...(summary.aaTokenMultiplier !== undefined
      ? [
          `- AA token multiplier (all fixtures): **${summary.aaTokenMultiplier.toFixed(2)}×**`,
        ]
      : []),
    ...(summary.aaRoutedProductTokenMultiplier !== undefined
      ? [
          `- Routed product multiplier (excl. full-council-eval): **${summary.aaRoutedProductTokenMultiplier.toFixed(2)}×**`,
        ]
      : []),
    ...(summary.aaFullCouncilEvalTokenMultiplier !== undefined
      ? [
          `- Full-council eval lane multiplier: **${summary.aaFullCouncilEvalTokenMultiplier.toFixed(2)}×**`,
        ]
      : []),
    ...(summary.routingStats
      ? [
          "",
          "### Council routing",
          `- Full council: ${summary.routingStats.full} (${summary.routingStats.councilTokensByMode.full.toLocaleString()} tokens)`,
          `- Lite council: ${summary.routingStats.lite} (${summary.routingStats.councilTokensByMode.lite.toLocaleString()} tokens)`,
          `- Routed single: ${summary.routingStats.single} (${summary.routingStats.councilTokensByMode.single.toLocaleString()} tokens)`,
        ]
      : []),
    ...(summary.productSlos
      ? [
          "",
          "## Product SLOs",
          `- API failure rate: **${(summary.productSlos.apiFailureRate * 100).toFixed(1)}%**`,
          `- Agent pass rate: **${(summary.productSlos.agentPassRate * 100).toFixed(0)}%**`,
          `- Routed product latency p50/p95: **${Math.round(summary.productSlos.latencyMs.p50)}** / **${Math.round(summary.productSlos.latencyMs.p95)}** ms`,
          ...(summary.productSlos.costPerPassUsd !== undefined
            ? [
                `- Est. cost per pass: **$${summary.productSlos.costPerPassUsd.toFixed(4)}**`,
              ]
            : []),
        ]
      : []),
    "",
    "## Proxy Intelligence Index (0–100)",
    `- **Routed product proxy:** ${proxyIndex.council.toFixed(2)} (full + lite + single)`,
    `- **Baseline proxy (Mercury 2 single-shot):** ${proxyIndex.baseline.toFixed(2)}`,
    ...(summary.fullCouncilProxyIndex
      ? [
          `- **Full/lite council only (renormalized):** ${summary.fullCouncilProxyIndex.council.toFixed(2)} (${routingStats?.full ?? 0} full, ${routingStats?.lite ?? 0} lite fixtures)`,
        ]
      : []),
    ...(summary.fullCouncilEvalProxyIndex
      ? [
          `- **Full-council eval lane (tagged subset):** ${summary.fullCouncilEvalProxyIndex.council.toFixed(2)}`,
        ]
      : []),
    ...(summary.hardSliceProxyIndex
      ? [
          `- **Hard slice (hard-v8 tag):** ${summary.hardSliceProxyIndex.council.toFixed(2)} (${summary.hardSliceProxyIndex.byEval.reduce((sum, entry) => sum + entry.fixtureCount, 0)} fixtures)`,
        ]
      : []),
    `- **Uplift ratio:** ${extrapolation.upliftRatio.toFixed(3)}`,
    "",
    "### Per-eval proxy scores",
    "| Eval | Weight | N | Council | Baseline |",
    "|------|--------|---|---------|----------|",
    evalTable,
    ...(gdpvalLossDigest && gdpvalLossDigest.length > 0
      ? [
          "",
          "### GDPval-AA losses (council below baseline)",
          "| Fixture | Council | Baseline | Rubric council |",
          "|---------|---------|----------|----------------|",
          ...gdpvalLossDigest.map(
            (entry) =>
              `| ${entry.fixtureId} | ${entry.councilScore.toFixed(1)} | ${entry.baselineScore.toFixed(1)} | ${entry.councilRubric?.toFixed(1) ?? "n/a"} |`,
          ),
          "",
          ...gdpvalLossDigest.flatMap((entry) =>
            entry.retryHint
              ? [`- **${entry.fixtureId}:** ${entry.retryHint}`]
              : [],
          ),
        ]
      : []),
    ...(gdpvalAbReport && gdpvalAbReport.length > 0
      ? [
          "",
          "### GDPval routing A/B (`gdpval-ab`, report only)",
          "| Fixture | Production | Prod score | Alt mode | Alt score | Δ (alt−prod) |",
          "|---------|------------|------------|----------|-----------|--------------|",
          ...gdpvalAbReport.map(
            (entry) =>
              `| ${entry.fixtureId} | ${entry.productionMode} | ${(entry.productionScore * 100).toFixed(1)} | ${entry.altMode} | ${(entry.altScore * 100).toFixed(1)} | ${(entry.scoreDelta * 100).toFixed(1)} |`,
          ),
        ]
      : []),
    ...(fullCouncilLossDigest && fullCouncilLossDigest.length > 0
      ? [
          "",
          "### Full-council losses (council below baseline)",
          "| Fixture | Eval | Council | Baseline |",
          "|---------|------|---------|----------|",
          ...fullCouncilLossDigest.map(
            (entry) =>
              `| ${entry.fixtureId} | ${entry.aaEval} | ${entry.councilScore.toFixed(1)} | ${entry.baselineScore.toFixed(1)} |`,
          ),
        ]
      : []),
    "",
    "### Per-category proxy scores",
    "| Category | Council | Baseline | Est. council AA |",
    "|----------|---------|----------|-----------------|",
    categoryTable,
    "",
    "## Extrapolation to real AA Intelligence Index",
    `Anchored to Mercury 2 published score of **${extrapolation.mercuryPublishedIndex}**.`,
    "",
    `- **Estimated council AA Index:** ${extrapolation.estimatedCouncilIndex.toFixed(1)} (range ${extrapolation.estimatedCouncilIndexLow.toFixed(1)}–${extrapolation.estimatedCouncilIndexHigh.toFixed(1)}, heuristic ±4)`,
    `- Formula: ` + "`33 × (proxy_council / proxy_baseline)`" + "",
    "",
    "## Verbosity extrapolation",
    `- API token multiplier (council/baseline): **${extrapolation.verbosityMultiplier.toFixed(2)}×**`,
    `- User-visible synthesis length ratio: **${extrapolation.synthesisLengthRatio.toFixed(2)}×**`,
    `- Est. council Index output tokens: **${(extrapolation.estimatedCouncilOutputTokens / 1_000_000).toFixed(1)}M** (vs Mercury ${(extrapolation.mercuryPublishedOutputTokens / 1_000_000).toFixed(0)}M)`,
    `- Est. council Index eval cost: **$${extrapolation.estimatedCouncilIndexCostUsd.toFixed(2)}** (vs Mercury $${extrapolation.mercuryPublishedIndexCostUsd.toFixed(2)})`,
    "",
    "## Throughput",
    `- Effective synthesis t/s (final markdown / council wall time): **${extrapolation.effectiveSynthesisTps.toFixed(1)}**`,
    `- Mercury 2 published generation t/s (single call): **${extrapolation.mercuryPublishedTps}**`,
    "",
    "## Limitations",
    "- Proxy tasks are inspired by AA eval shapes, not the official suites.",
    "- Extrapolation assumes fallback-only baseline ≈ published Mercury 2 score of 33.",
    "- Rubric-graded items use the same model as baseline; MCQ/IFBench/checklist reduce judge bias.",
  ].join("\n");
}
