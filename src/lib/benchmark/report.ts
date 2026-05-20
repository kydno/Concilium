import type { FixtureResult, RubricScores, RoutingStats, RunSummary } from "./types";
import { rubricWeightedTotal } from "./judge";

function avgScores(results: FixtureResult[]): RubricScores {
  const withRubric = results.filter((result) => result.rubric);
  if (withRubric.length === 0) {
    return { usefulness: 0, structure: 0, accuracy: 0, voice: 0 };
  }

  const sum = withRubric.reduce(
    (acc, result) => {
      const council = result.rubric!.council;
      return {
        usefulness: acc.usefulness + council.usefulness,
        structure: acc.structure + council.structure,
        accuracy: acc.accuracy + council.accuracy,
        voice: acc.voice + council.voice,
      };
    },
    { usefulness: 0, structure: 0, accuracy: 0, voice: 0 },
  );

  const n = withRubric.length;
  return {
    usefulness: sum.usefulness / n,
    structure: sum.structure / n,
    accuracy: sum.accuracy / n,
    voice: sum.voice / n,
  };
}

function avgBaselineScores(results: FixtureResult[]): RubricScores {
  const withRubric = results.filter((result) => result.rubric);
  if (withRubric.length === 0) {
    return { usefulness: 0, structure: 0, accuracy: 0, voice: 0 };
  }

  const sum = withRubric.reduce(
    (acc, result) => {
      const baseline = result.rubric!.baseline;
      return {
        usefulness: acc.usefulness + baseline.usefulness,
        structure: acc.structure + baseline.structure,
        accuracy: acc.accuracy + baseline.accuracy,
        voice: acc.voice + baseline.voice,
      };
    },
    { usefulness: 0, structure: 0, accuracy: 0, voice: 0 },
  );

  const n = withRubric.length;
  return {
    usefulness: sum.usefulness / n,
    structure: sum.structure / n,
    accuracy: sum.accuracy / n,
    voice: sum.voice / n,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export function buildRunSummary(options: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  results: FixtureResult[];
  totalTokens: number;
  tokenBudget: number;
  routingStats?: RoutingStats;
}): RunSummary {
  const completed = options.results.filter((result) => !result.skipped);
  const skippedCount = options.results.length - completed.length;

  let councilWins = 0;
  let baselineWins = 0;
  let ties = 0;

  const deltas: Array<{ fixtureId: string; delta: number }> = [];

  for (const result of completed) {
    if (!result.rubric) continue;
    const councilTotal = rubricWeightedTotal(result.rubric.council);
    const baselineTotal = rubricWeightedTotal(result.rubric.baseline);
    const delta = councilTotal - baselineTotal;
    deltas.push({ fixtureId: result.fixtureId, delta });
    if (Math.abs(delta) < 0.05) ties += 1;
    else if (delta > 0) councilWins += 1;
    else baselineWins += 1;
  }

  const judged = councilWins + baselineWins + ties;
  const decisive = councilWins + baselineWins;
  const councilWinRate =
    decisive > 0 ? councilWins / decisive : judged > 0 ? 0 : 0;

  const councilDurations = completed.map((result) => result.councilDurationMs);
  const baselineDurations = completed.map((result) => result.baselineDurationMs);

  const topCouncilWins = [...deltas]
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const topBaselineWins = [...deltas]
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  const councilApiFailures = completed.filter((result) =>
    result.errors.some((error) => error.startsWith("Council failed:")),
  ).length;

  const totalCouncilTokens = completed.reduce(
    (sum, result) => sum + result.usage.council,
    0,
  );
  const totalBaselineTokens = completed.reduce(
    (sum, result) => sum + result.usage.baseline,
    0,
  );
  const openCouncilOverBaseline =
    totalBaselineTokens > 0
      ? totalCouncilTokens / totalBaselineTokens
      : undefined;
  const tokenMultiplier =
    totalBaselineTokens > 0
      ? (totalCouncilTokens + totalBaselineTokens) / totalBaselineTokens
      : undefined;

  return {
    runId: options.runId,
    startedAt: options.startedAt,
    finishedAt: options.finishedAt,
    fixtureCount: options.results.length,
    completedCount: completed.length,
    skippedCount,
    totalTokens: options.totalTokens,
    tokenBudget: options.tokenBudget,
    councilAvgRubric: avgScores(completed),
    baselineAvgRubric: avgBaselineScores(completed),
    councilWins,
    baselineWins,
    ties,
    councilWinRate,
    avgCouncilDurationMs:
      councilDurations.reduce((sum, value) => sum + value, 0) /
      (councilDurations.length || 1),
    avgBaselineDurationMs:
      baselineDurations.reduce((sum, value) => sum + value, 0) /
      (baselineDurations.length || 1),
    totalFailedMembers: completed.reduce(
      (sum, result) => sum + result.failedMembers,
      0,
    ),
    topCouncilWins,
    topBaselineWins,
    routingStats: options.routingStats,
    councilApiFailures,
    totalCouncilTokens,
    totalBaselineTokens,
    openCouncilOverBaseline,
    tokenMultiplier,
  };
}

export function formatSummaryMarkdown(
  summary: RunSummary,
  extras?: { p50CouncilMs: number; p95CouncilMs: number },
): string {
  const lines = [
    `# Benchmark run ${summary.runId}`,
    "",
    `**Started:** ${summary.startedAt}`,
    `**Finished:** ${summary.finishedAt}`,
    "",
    "## Coverage",
    `- Fixtures: ${summary.fixtureCount} (${summary.completedCount} completed, ${summary.skippedCount} skipped)`,
    `- Total tokens: ${summary.totalTokens.toLocaleString()} / ${summary.tokenBudget.toLocaleString()}`,
    `- Failed council members (total): ${summary.totalFailedMembers}`,
    ...(summary.routingStats
      ? [
          "",
          "### Council routing",
          `- Full: ${summary.routingStats.full} (${summary.routingStats.councilTokensByMode.full.toLocaleString()} tokens)`,
          `- Lite: ${summary.routingStats.lite} (${summary.routingStats.councilTokensByMode.lite.toLocaleString()} tokens)`,
          `- Single: ${summary.routingStats.single} (${summary.routingStats.councilTokensByMode.single.toLocaleString()} tokens)`,
        ]
      : []),
    "",
    "## Rubric (1-10, weighted win rate)",
    `- Council wins: ${summary.councilWins}`,
    `- Baseline wins: ${summary.baselineWins}`,
    `- Ties: ${summary.ties}`,
    `- Council win rate: ${(summary.councilWinRate * 100).toFixed(1)}%`,
    "",
    "### Average scores (council)",
    `- Usefulness: ${summary.councilAvgRubric.usefulness.toFixed(2)}`,
    `- Structure: ${summary.councilAvgRubric.structure.toFixed(2)}`,
    `- Accuracy: ${summary.councilAvgRubric.accuracy.toFixed(2)}`,
    `- Voice: ${summary.councilAvgRubric.voice.toFixed(2)}`,
    "",
    "### Average scores (baseline)",
    `- Usefulness: ${summary.baselineAvgRubric.usefulness.toFixed(2)}`,
    `- Structure: ${summary.baselineAvgRubric.structure.toFixed(2)}`,
    `- Accuracy: ${summary.baselineAvgRubric.accuracy.toFixed(2)}`,
    `- Voice: ${summary.baselineAvgRubric.voice.toFixed(2)}`,
    "",
    "## Latency",
    `- Avg council: ${Math.round(summary.avgCouncilDurationMs)} ms`,
    `- Avg baseline: ${Math.round(summary.avgBaselineDurationMs)} ms`,
    ...(summary.openCouncilOverBaseline !== undefined
      ? [
          `- Council/baseline token ratio: ${summary.openCouncilOverBaseline.toFixed(2)}× (${summary.totalCouncilTokens?.toLocaleString() ?? 0} council / ${summary.totalBaselineTokens?.toLocaleString() ?? 0} baseline API tokens)`,
        ]
      : []),
  ];

  if (extras) {
    lines.push(
      `- Council p50: ${extras.p50CouncilMs} ms`,
      `- Council p95: ${extras.p95CouncilMs} ms`,
    );
  }

  lines.push(
    "",
    "## Top council wins (weighted delta)",
    ...summary.topCouncilWins.map(
      (entry) => `- ${entry.fixtureId}: +${entry.delta.toFixed(2)}`,
    ),
    "",
    "## Top baseline wins",
    ...summary.topBaselineWins.map(
      (entry) => `- ${entry.fixtureId}: ${entry.delta.toFixed(2)}`,
    ),
  );

  return lines.join("\n");
}

export function councilDurationPercentiles(results: FixtureResult[]): {
  p50: number;
  p95: number;
} {
  const durations = results
    .filter((result) => !result.skipped)
    .map((result) => result.councilDurationMs);
  return {
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
  };
}
