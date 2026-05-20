import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  ensureAgentCommandFooter,
  resetAgentMockFs,
  runDeterministicAgentSteps,
} from "../../agent-task";
import { runRoutedQuery } from "../../run-routed-query";
import { runMercuryAnswer } from "../../mercury-answer";
import { truncateContext } from "../../prompts";
import { createUsageAccumulator } from "../collector";
import { priorTurnsForCouncil } from "../fixture-context";
import { runRubricJudge } from "../judge";
import { runSingleShot } from "../single-shot";
import { runStructuralChecks } from "../structural";
import { MAX_BENCHMARK_TOKENS } from "../types";
import { buildProxyIndex } from "./composite";
import { buildExtrapolation } from "./extrapolate";
import { gradeAnswer } from "./grade";
import { filterAaFixtures, loadAaIndexFixtures } from "./load-fixtures";
import { buildProductSlos } from "./product-slos";
import type { CouncilMode } from "../../council-mode";
import type { RubricResult } from "../types";
import {
  buildFullCouncilLossDigest,
  buildGdpvalAbReport,
  buildGdpvalLossDigest,
  formatAaSummaryMarkdown,
} from "./report";
import type { AaFixtureResult, AaIndexFixture, AaRunSummary } from "./types";

export interface RunAaBenchmarkOptions {
  runId?: string;
  onlyId?: string | string[];
  onlyTag?: string | string[];
  maxFixtures?: number;
  dryRun?: boolean;
  fixturesPath?: string;
  outputDir?: string;
  tokenBudget?: number;
  gate?: boolean;
}

export interface RunAaBenchmarkOutput {
  outputDir: string;
  summary: AaRunSummary;
  results: AaFixtureResult[];
}

function computeAaTokenMultiplier(
  results: AaFixtureResult[],
  predicate: (result: AaFixtureResult) => boolean,
): number | undefined {
  let council = 0;
  let baseline = 0;
  for (const result of results) {
    if (result.skipped || !predicate(result)) continue;
    council += result.usage.council;
    baseline += result.usage.baseline;
  }
  return baseline > 0 ? council / baseline : undefined;
}

async function runGdpvalAbAltCouncil(
  fixture: AaIndexFixture,
  productionMode: CouncilMode,
  rubric: RubricResult | undefined,
): Promise<{
  altMode: CouncilMode;
  altScore: number;
  tokens: number;
} | null> {
  if (!fixture.tags.includes("gdpval-ab")) {
    return null;
  }
  if (productionMode === "single") {
    return null;
  }

  const altMode: CouncilMode = productionMode === "lite" ? "full" : "lite";
  const councilUsage = createUsageAccumulator();
  const councilHandler = councilUsage.createCouncilHandler();

  try {
    const { text: contextText } = fixture.contextText
      ? truncateContext(fixture.contextText)
      : { text: undefined };

    const councilResult = await runRoutedQuery({
      query: fixture.query,
      contextText,
      contextFilename: fixture.contextFilename,
      priorTurns: priorTurnsForCouncil(fixture),
      streamSynthesis: false,
      onEvent: councilHandler,
      tags: fixture.tags,
      grading: fixture.grading,
      constraintRules: fixture.ifbenchRules,
      checklistItems: fixture.checklistItems,
      benchmarkStructuralRetries: fixture.tags.includes("gdpval-aa"),
      fixtureId: fixture.id,
      forceMode: altMode,
    });

    const altMarkdown = councilResult.synthesis.markdown;
    const altGrade = gradeAnswer(altMarkdown, fixture, rubric, "council");
    const tokens =
      councilResult.meta.councilTokens ?? councilUsage.total;

    return {
      altMode,
      altScore: altGrade.score,
      tokens,
    };
  } catch {
    return null;
  }
}

async function runAaFixture(fixture: AaIndexFixture): Promise<{
  result: AaFixtureResult;
  tokensUsed: number;
}> {
  const errors: string[] = [];
  let councilMarkdown = "";
  let baselineMarkdown = "";
  let councilDurationMs = 0;
  let baselineDurationMs = 0;
  let failedMembers = 0;
  let councilTokens = 0;
  let baselineTokens = 0;
  let judgeTokens = 0;
  let routingMode = undefined as AaFixtureResult["routingMode"];
  let routingReasons: string[] | undefined;
  let agentTranscript: string | undefined;
  let chairRetryCount: number | undefined;

  const councilUsage = createUsageAccumulator();
  const councilHandler = councilUsage.createCouncilHandler();

  try {
    const { text: contextText } = fixture.contextText
      ? truncateContext(fixture.contextText)
      : { text: undefined };

    if (fixture.grading === "agent") {
      resetAgentMockFs(fixture.agentMockFsSeed);
    }

    const councilStarted = Date.now();
    const councilResult = await runRoutedQuery({
      query: fixture.query,
      contextText,
      contextFilename: fixture.contextFilename,
      priorTurns: priorTurnsForCouncil(fixture),
      streamSynthesis: false,
      onEvent: councilHandler,
      tags: fixture.tags,
      grading: fixture.grading,
      constraintRules: fixture.ifbenchRules,
      checklistItems: fixture.checklistItems,
      benchmarkStructuralRetries: fixture.tags.includes("gdpval-aa"),
      fixtureId: fixture.id,
      agentSteps: fixture.agentSteps,
    });
    councilDurationMs = Date.now() - councilStarted;
    councilMarkdown = councilResult.synthesis.markdown;
    failedMembers = councilResult.meta.failedMembers;
    councilTokens =
      councilResult.meta.councilTokens ?? councilUsage.total;
    routingMode = councilResult.meta.routingMode;
    routingReasons = councilResult.meta.routingReasons;
    agentTranscript = councilResult.meta.agentTranscript;
    chairRetryCount = councilResult.meta.chairRetryCount;
  } catch (error) {
    errors.push(
      `Council failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    if (fixture.grading === "agent") {
      let agentBaselinePrefix = "";
      if (fixture.agentSteps && fixture.agentSteps.length > 0) {
        const deterministic = await runDeterministicAgentSteps(
          fixture.agentSteps,
        );
        agentBaselinePrefix = deterministic.transcript;
      }
      const baseline = await runMercuryAnswer({
        query: fixture.query,
        contextText: fixture.contextText ?? undefined,
        contextFilename: fixture.contextFilename ?? undefined,
        priorTurns: priorTurnsForCouncil(fixture),
        precisionHint: "command",
        apiKey: "fallback-only",
      });
      baselineMarkdown = agentBaselinePrefix
        ? `${agentBaselinePrefix}\n\n${baseline.markdown}`
        : baseline.markdown;
      if (fixture.agentSteps && fixture.agentSteps.length > 0) {
        const finalCommand = fixture.agentSteps.at(-1) ?? fixture.agentCommand;
        if (finalCommand) {
          baselineMarkdown = ensureAgentCommandFooter(
            baselineMarkdown,
            finalCommand,
          );
        }
      }
      baselineDurationMs = baseline.durationMs;
      baselineTokens = baseline.tokens;
    } else {
      const baseline = await runSingleShot(fixture);
      baselineMarkdown = baseline.markdown;
      baselineDurationMs = baseline.durationMs;
      baselineTokens = baseline.tokens;
    }
  } catch (error) {
    errors.push(
      `Baseline failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let rubric;
  const needsRubric =
    fixture.grading === "rubric" && councilMarkdown && baselineMarkdown;

  if (needsRubric) {
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

  const councilGradeMarkdown =
    fixture.grading === "agent" && agentTranscript
      ? `${agentTranscript}\n\n${councilMarkdown}`
      : councilMarkdown;
  const councilGrade = gradeAnswer(
    councilGradeMarkdown,
    fixture,
    rubric,
    "council",
  );
  const baselineGrade = gradeAnswer(baselineMarkdown, fixture, rubric, "baseline");

  const tokensUsed = councilTokens + baselineTokens + judgeTokens;

  const scoreDelta =
    councilGrade && baselineGrade
      ? councilGrade.score - baselineGrade.score
      : undefined;

  let gdpvalAb: AaFixtureResult["gdpvalAb"];
  let abTokens = 0;
  if (routingMode && routingMode !== "single") {
    const abRun = await runGdpvalAbAltCouncil(fixture, routingMode, rubric);
    if (abRun) {
      const productionScore = councilGrade.score;
      gdpvalAb = {
        productionMode: routingMode,
        productionScore,
        altMode: abRun.altMode,
        altScore: abRun.altScore,
        scoreDelta: abRun.altScore - productionScore,
      };
      abTokens = abRun.tokens;
    }
  }

  const result: AaFixtureResult = {
    fixtureId: fixture.id,
    tags: fixture.tags,
    councilMarkdown,
    baselineMarkdown,
    councilDurationMs,
    baselineDurationMs,
    failedMembers,
    usage: {
      council: councilTokens + abTokens,
      baseline: baselineTokens,
      judge: judgeTokens,
    },
    rubric,
    structural: {
      council: runStructuralChecks(councilMarkdown, fixture.tags),
      baseline: runStructuralChecks(baselineMarkdown, fixture.tags),
    },
    errors,
    aaEval: fixture.aaEval,
    aaCategory: fixture.aaCategory,
    grading: fixture.grading,
    routingMode,
    routingReasons,
    councilGrade,
    baselineGrade,
    scoreDelta,
    councilRubricNormalized:
      councilGrade.method === "rubric-normalized" ? councilGrade.score : undefined,
    baselineRubricNormalized:
      baselineGrade.method === "rubric-normalized" ? baselineGrade.score : undefined,
    chairRetryCount,
    gdpvalAb,
  };

  return { result, tokensUsed: tokensUsed + abTokens };
}

export async function runAaBenchmark(
  options: RunAaBenchmarkOptions = {},
): Promise<RunAaBenchmarkOutput> {
  const tokenBudget = options.tokenBudget ?? MAX_BENCHMARK_TOKENS;
  const fixtures = filterAaFixtures(
    loadAaIndexFixtures(options.fixturesPath),
    options.onlyId,
    options.maxFixtures,
    options.onlyTag,
  );

  const runId =
    options.runId ??
    new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const startedAt = new Date().toISOString();

  if (options.dryRun) {
    console.log(`AA Index proxy run ID: ${runId}`);
    console.log(`Fixtures: ${fixtures.length}`);
    console.log(`Token budget: ${tokenBudget.toLocaleString()}`);
    for (const fixture of fixtures) {
      console.log(
        `  - ${fixture.id} [${fixture.aaEval}, ${fixture.grading}]`,
      );
    }
    const emptyProxy = buildProxyIndex([]);
    const emptyExtrapolation = buildExtrapolation({
      proxyIndex: emptyProxy,
      results: [],
      totalTokens: 0,
      totalCouncilTokens: 0,
      totalBaselineTokens: 0,
    });
    return {
      outputDir: "",
      summary: {
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        fixtureCount: fixtures.length,
        completedCount: 0,
        totalTokens: 0,
        totalCouncilTokens: 0,
        totalBaselineTokens: 0,
        tokenBudget,
        proxyIndex: emptyProxy,
        extrapolation: emptyExtrapolation,
      },
      results: [],
    };
  }

  const outputDir =
    options.outputDir ?? join(process.cwd(), "benchmarks", "runs", runId);
  mkdirSync(outputDir, { recursive: true });

  const resultsPath = join(outputDir, "results.jsonl");
  writeFileSync(resultsPath, "");

  let totalTokens = 0;
  let totalCouncilTokens = 0;
  let totalBaselineTokens = 0;
  const results: AaFixtureResult[] = [];

  for (const fixture of fixtures) {
    const remaining = tokenBudget - totalTokens;
    if (remaining <= 0) {
      const skipped: AaFixtureResult = {
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
        aaEval: fixture.aaEval,
        aaCategory: fixture.aaCategory,
        grading: fixture.grading,
      };
      results.push(skipped);
      appendFileSync(resultsPath, `${JSON.stringify(skipped)}\n`);
      console.log(`[skip] ${fixture.id} (budget exhausted)`);
      continue;
    }

    console.log(`[run] ${fixture.id} [${fixture.aaEval}] (${remaining.toLocaleString()} left)`);
    const { result, tokensUsed } = await runAaFixture(fixture);
    totalTokens += tokensUsed;
    totalCouncilTokens += result.usage.council;
    totalBaselineTokens += result.usage.baseline;
    results.push(result);
    appendFileSync(resultsPath, `${JSON.stringify(result)}\n`);
    console.log(
      `  grades council=${result.councilGrade?.score.toFixed(2)} baseline=${result.baselineGrade?.score.toFixed(2)} | ${tokensUsed} tokens`,
    );
  }

  const finishedAt = new Date().toISOString();
  const proxyIndex = buildProxyIndex(results);
  const fullCouncilResults = results.filter(
    (result) =>
      !result.skipped &&
      result.routingMode &&
      result.routingMode !== "single",
  );
  const fullCouncilProxyIndex =
    fullCouncilResults.length > 0
      ? buildProxyIndex(fullCouncilResults, { renormalizeWeights: true })
      : undefined;
  const fullCouncilEvalResults = results.filter(
    (result) =>
      !result.skipped &&
      result.tags.includes("full-council-eval") &&
      result.routingMode === "full",
  );
  const fullCouncilEvalProxyIndex =
    fullCouncilEvalResults.length > 0
      ? buildProxyIndex(fullCouncilEvalResults, { renormalizeWeights: true })
      : undefined;
  const hardSliceResults = results.filter(
    (result) => !result.skipped && result.tags.includes("hard-v8"),
  );
  const hardSliceProxyIndex =
    hardSliceResults.length > 0
      ? buildProxyIndex(hardSliceResults, { renormalizeWeights: true })
      : undefined;
  const aaTokenMultiplier =
    totalBaselineTokens > 0
      ? totalCouncilTokens / totalBaselineTokens
      : undefined;
  const aaRoutedProductTokenMultiplier = computeAaTokenMultiplier(
    results,
    (result) => !result.tags.includes("full-council-eval"),
  );
  const aaFullCouncilEvalTokenMultiplier = computeAaTokenMultiplier(
    results,
    (result) => result.tags.includes("full-council-eval"),
  );
  const extrapolation = buildExtrapolation({
    proxyIndex,
    results,
    totalTokens,
    totalCouncilTokens,
    totalBaselineTokens,
  });

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

  const fullCouncilLossDigest = buildFullCouncilLossDigest(results);
  const gdpvalLossDigest = buildGdpvalLossDigest(results);
  const gdpvalAbReport = buildGdpvalAbReport(results);
  const productSlos = buildProductSlos(results);

  const summary: AaRunSummary = {
    runId,
    startedAt,
    finishedAt,
    fixtureCount: results.length,
    completedCount: results.filter((result) => !result.skipped).length,
    totalTokens,
    totalCouncilTokens,
    totalBaselineTokens,
    aaTokenMultiplier,
    aaRoutedProductTokenMultiplier,
    aaFullCouncilEvalTokenMultiplier,
    tokenBudget,
    proxyIndex,
    fullCouncilProxyIndex,
    fullCouncilEvalProxyIndex,
    hardSliceProxyIndex,
    fullCouncilLossDigest,
    gdpvalLossDigest,
    gdpvalAbReport,
    productSlos,
    extrapolation,
    routingStats,
  };

  writeFileSync(join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(
    join(outputDir, "summary-aa.md"),
    formatAaSummaryMarkdown(summary),
  );
  writeFileSync(
    join(outputDir, "extrapolation.json"),
    JSON.stringify(extrapolation, null, 2),
  );

  return { outputDir, summary, results };
}
