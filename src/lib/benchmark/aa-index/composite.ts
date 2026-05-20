import type { AaEvalScores, AaFixtureResult, AaProxyIndex, AaCategory, AaEvalId } from "./types";
import { AA_EVAL_WEIGHTS } from "./types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface BuildProxyIndexOptions {
  /** When true, weight only evals with fixtures and renormalize weights to sum to 1. */
  renormalizeWeights?: boolean;
}

export function buildProxyIndex(
  results: AaFixtureResult[],
  options?: BuildProxyIndexOptions,
): AaProxyIndex {
  const completed = results.filter(
    (result) => !result.skipped && !result.tags.includes("gdpval-ab"),
  );
  const byEval = new Map<AaEvalId, { council: number[]; baseline: number[] }>();

  for (const result of completed) {
    const councilScore =
      result.councilGrade?.score ??
      result.councilRubricNormalized ??
      0;
    const baselineScore =
      result.baselineGrade?.score ??
      result.baselineRubricNormalized ??
      0;

    const bucket = byEval.get(result.aaEval) ?? { council: [], baseline: [] };
    bucket.council.push(councilScore);
    bucket.baseline.push(baselineScore);
    byEval.set(result.aaEval, bucket);
  }

  const evalScores: AaEvalScores[] = [];

  for (const [evalId, meta] of Object.entries(AA_EVAL_WEIGHTS) as Array<
    [AaEvalId, (typeof AA_EVAL_WEIGHTS)[AaEvalId]]
  >) {
    const bucket = byEval.get(evalId);
    const councilAvg = average(bucket?.council ?? []);
    const baselineAvg = average(bucket?.baseline ?? []);

    evalScores.push({
      evalId,
      category: meta.category,
      weight: meta.weight,
      fixtureCount: bucket?.council.length ?? 0,
      councilScore: councilAvg * 100,
      baselineScore: baselineAvg * 100,
    });
  }

  const entriesForWeighting = options?.renormalizeWeights
    ? evalScores.filter((entry) => entry.fixtureCount > 0)
    : evalScores;

  const weightSum = entriesForWeighting.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  let councilWeighted = 0;
  let baselineWeighted = 0;

  for (const entry of entriesForWeighting) {
    const effectiveWeight =
      options?.renormalizeWeights && weightSum > 0
        ? entry.weight / weightSum
        : entry.weight;
    councilWeighted += effectiveWeight * (entry.councilScore / 100);
    baselineWeighted += effectiveWeight * (entry.baselineScore / 100);
  }

  const categories: AaCategory[] = ["agents", "coding", "general", "scientific"];
  const byCategory = categories.map((category) => {
    const inCategory = entriesForWeighting.filter(
      (entry) => entry.category === category,
    );
    const categoryWeightSum = inCategory.reduce(
      (sum, entry) => sum + entry.weight,
      0,
    );
    const council =
      categoryWeightSum > 0
        ? inCategory.reduce(
            (sum, entry) => sum + entry.councilScore * entry.weight,
            0,
          ) / categoryWeightSum
        : 0;
    const baseline =
      categoryWeightSum > 0
        ? inCategory.reduce(
            (sum, entry) => sum + entry.baselineScore * entry.weight,
            0,
          ) / categoryWeightSum
        : 0;
    return { category, council, baseline };
  });

  return {
    council: councilWeighted * 100,
    baseline: baselineWeighted * 100,
    byEval: evalScores,
    byCategory,
  };
}
