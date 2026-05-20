import { mercuryApiCostUsd } from "../pricing";
import type { AaFixtureResult, ProductSlos } from "./types";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function isRoutedProductFixture(result: AaFixtureResult): boolean {
  return !result.skipped && !result.tags.includes("full-council-eval");
}

function hasCouncilApiFailure(result: AaFixtureResult): boolean {
  return result.errors.some((error) => error.startsWith("Council failed:"));
}

export function routedProductCouncilDurationsMs(
  results: AaFixtureResult[],
): number[] {
  return results
    .filter(isRoutedProductFixture)
    .map((result) => result.councilDurationMs)
    .filter((ms) => ms > 0);
}

export function buildProductSlos(results: AaFixtureResult[]): ProductSlos {
  const completed = results.filter((result) => !result.skipped);
  const councilFailures = completed.filter(hasCouncilApiFailure).length;
  const apiFailureRate =
    completed.length > 0 ? councilFailures / completed.length : 0;

  const agentResults = completed.filter((result) => result.grading === "agent");
  const agentPasses = agentResults.filter(
    (result) => result.councilGrade?.pass === true,
  ).length;
  const agentPassRate =
    agentResults.length > 0 ? agentPasses / agentResults.length : 1;

  const routedDurations = routedProductCouncilDurationsMs(results);
  const latencyMs = {
    p50: percentile(routedDurations, 50),
    p95: percentile(routedDurations, 95),
  };

  const passCount = completed.filter(
    (result) => result.councilGrade?.pass === true,
  ).length;
  const totalCouncilTokens = completed.reduce(
    (sum, result) => sum + result.usage.council,
    0,
  );
  const costPerPassUsd =
    passCount > 0 ? mercuryApiCostUsd(totalCouncilTokens) / passCount : undefined;

  return {
    apiFailureRate,
    agentPassRate,
    latencyMs,
    costPerPassUsd,
  };
}
