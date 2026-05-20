import { mkdirSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { runRoutedQuery } from "../run-routed-query";
import { truncateContext } from "../prompts";
import { createUsageAccumulator } from "./collector";
import { priorTurnsForCouncil } from "./fixture-context";
import { runRubricJudge } from "./judge";
import { filterFixtures, loadFixtures } from "./load-fixtures";
import {
  buildRunSummary,
  councilDurationPercentiles,
  formatSummaryMarkdown,
} from "./report";
import { runSingleShot } from "./single-shot";
import { runStructuralChecks } from "./structural";
import type { BenchmarkFixture, FixtureResult, RunSummary } from "./types";
import { MAX_BENCHMARK_TOKENS } from "./types";

export interface RunBenchmarkOptions {
  runId?: string;
  onlyId?: string | string[];
  maxFixtures?: number;
  dryRun?: boolean;
  fixturesPath?: string;
  outputDir?: string;
  tokenBudget?: number;
}

export interface RunBenchmarkOutput {
  outputDir: string;
  summary: RunSummary;
  results: FixtureResult[];
}

async function runFixture(
  fixture: BenchmarkFixture,
  tokenBudgetRemaining: number,
): Promise<{ result: FixtureResult; tokensUsed: number }> {
  const errors: string[] = [];
  let councilMarkdown = "";
  let baselineMarkdown = "";
  let councilDurationMs = 0;
  let baselineDurationMs = 0;
  let failedMembers = 0;
  let councilTokens = 0;
  let baselineTokens = 0;
  let judgeTokens = 0;
  let routingMode = undefined as FixtureResult["routingMode"];

  const councilUsage = createUsageAccumulator();
  const councilHandler = councilUsage.createCouncilHandler();

  try {
    const { text: contextText } = fixture.contextText
      ? truncateContext(fixture.contextText)
      : { text: undefined };

    const councilStarted = Date.now();
    const councilResult = await runRoutedQuery({
      query: fixture.query,
      contextText,
      contextFilename: fixture.contextFilename,
      priorTurns: priorTurnsForCouncil(fixture),
      streamSynthesis: false,
      onEvent: councilHandler,
      tags: fixture.tags,
    });
    councilDurationMs = Date.now() - councilStarted;
    councilMarkdown = councilResult.synthesis.markdown;
    failedMembers = councilResult.meta.failedMembers;
    councilTokens =
      councilResult.meta.councilTokens ?? councilUsage.total;
    routingMode = councilResult.meta.routingMode;
  } catch (error) {
    errors.push(
      `Council failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const baseline = await runSingleShot(fixture);
    baselineMarkdown = baseline.markdown;
    baselineDurationMs = baseline.durationMs;
    baselineTokens = baseline.tokens;
  } catch (error) {
    errors.push(
      `Baseline failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let rubric;
  if (councilMarkdown && baselineMarkdown) {
    try {
      rubric = await runRubricJudge({
        fixtureId: fixture.id,
        query: fixture.query,
        councilMarkdown,
        baselineMarkdown,
      });
      judgeTokens =
        (rubric.usage?.total_tokens ?? 0) ||
        (rubric.usage?.prompt_tokens ?? 0) + (rubric.usage?.completion_tokens ?? 0);
    } catch (error) {
      errors.push(
        `Judge failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const tokensUsed = councilTokens + baselineTokens + judgeTokens;

  const result: FixtureResult = {
    fixtureId: fixture.id,
    tags: fixture.tags,
    councilMarkdown,
    baselineMarkdown,
    councilDurationMs,
    baselineDurationMs,
    failedMembers,
    routingMode,
    usage: {
      council: councilTokens,
      baseline: baselineTokens,
      judge: judgeTokens,
    },
    rubric,
    structural: {
      council: runStructuralChecks(councilMarkdown, fixture.tags),
      baseline: runStructuralChecks(baselineMarkdown, fixture.tags),
    },
    errors,
  };

  return { result, tokensUsed };
}

export async function runBenchmark(
  options: RunBenchmarkOptions = {},
): Promise<RunBenchmarkOutput> {
  const tokenBudget = options.tokenBudget ?? MAX_BENCHMARK_TOKENS;
  const fixtures = filterFixtures(
    loadFixtures(options.fixturesPath),
    options.onlyId,
    options.maxFixtures,
  );

  const runId =
    options.runId ??
    new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const startedAt = new Date().toISOString();

  if (options.dryRun) {
    console.log(`Run ID: ${runId}`);
    console.log(`Fixtures: ${fixtures.length}`);
    console.log(`Token budget: ${tokenBudget.toLocaleString()}`);
    for (const fixture of fixtures) {
      console.log(`  - ${fixture.id} [${fixture.tags.join(", ")}]`);
    }
    const summary = buildRunSummary({
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      results: [],
      totalTokens: 0,
      tokenBudget,
    });
    return { outputDir: "", summary, results: [] };
  }

  const outputDir =
    options.outputDir ?? join(process.cwd(), "benchmarks", "runs", runId);
  mkdirSync(outputDir, { recursive: true });

  const resultsPath = join(outputDir, "results.jsonl");
  writeFileSync(resultsPath, "");

  let totalTokens = 0;
  const results: FixtureResult[] = [];

  for (const fixture of fixtures) {
    const remaining = tokenBudget - totalTokens;
    if (remaining <= 0) {
      const skipped: FixtureResult = {
        fixtureId: fixture.id,
        tags: fixture.tags,
        councilMarkdown: "",
        baselineMarkdown: "",
        councilDurationMs: 0,
        baselineDurationMs: 0,
        failedMembers: 0,
        usage: { council: 0, baseline: 0, judge: 0 },
        structural: {
          council: { pass: false, issues: ["skipped"] },
          baseline: { pass: false, issues: ["skipped"] },
        },
        errors: ["Skipped: token budget exhausted"],
        skipped: "Token budget exhausted",
      };
      results.push(skipped);
      appendFileSync(resultsPath, `${JSON.stringify(skipped)}\n`);
      console.log(`[skip] ${fixture.id} (budget exhausted)`);
      continue;
    }

    console.log(`[run] ${fixture.id} (${remaining.toLocaleString()} tokens left)`);
    const { result, tokensUsed } = await runFixture(fixture, remaining);
    totalTokens += tokensUsed;
    results.push(result);
    appendFileSync(resultsPath, `${JSON.stringify(result)}\n`);
    console.log(
      `  council ${result.usage.council} + baseline ${result.usage.baseline} + judge ${result.usage.judge} = ${tokensUsed} tokens`,
    );
  }

  const finishedAt = new Date().toISOString();

  const routingStats = {
    full: 0,
    lite: 0,
    single: 0,
    councilTokensByMode: { full: 0, lite: 0, single: 0 },
  };
  for (const result of results) {
    if (result.skipped || !result.routingMode) continue;
    routingStats[result.routingMode] += 1;
    routingStats.councilTokensByMode[result.routingMode] += result.usage.council;
  }

  const summary = buildRunSummary({
    runId,
    startedAt,
    finishedAt,
    results,
    totalTokens,
    tokenBudget,
    routingStats,
  });

  const percentiles = councilDurationPercentiles(results);
  const summaryJsonPath = join(outputDir, "summary.json");
  const summaryMdPath = join(outputDir, "summary.md");

  writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2));
  writeFileSync(
    summaryMdPath,
    formatSummaryMarkdown(summary, {
      p50CouncilMs: percentiles.p50,
      p95CouncilMs: percentiles.p95,
    }),
  );

  return { outputDir, summary, results };
}
