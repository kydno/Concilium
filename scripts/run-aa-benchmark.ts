import { config } from "dotenv";
import { resolve } from "path";
import { runAaBenchmark } from "../src/lib/benchmark/aa-index/runner";
import type { AaFixtureResult, AaRunSummary } from "../src/lib/benchmark/aa-index/types";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function parseArgs(argv: string[]) {
  let runId: string | undefined;
  const onlyIds: string[] = [];
  const onlyTags: string[] = [];
  let maxFixtures: number | undefined;
  let dryRun = false;
  let gate = false;
  let fixturesPath: string | undefined;
  let trials = 1;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--gate") gate = true;
    else if (arg === "--run-id" && argv[index + 1]) {
      runId = argv[++index];
    } else if (arg === "--only" && argv[index + 1]) {
      onlyIds.push(argv[++index]);
    } else if (arg === "--only-tag" && argv[index + 1]) {
      onlyTags.push(argv[++index]);
    } else if (arg === "--max-fixtures" && argv[index + 1]) {
      maxFixtures = Number.parseInt(argv[++index], 10);
    } else if (arg === "--fixtures" && argv[index + 1]) {
      fixturesPath = argv[++index];
    } else if (arg === "--trials" && argv[index + 1]) {
      trials = Math.max(1, Number.parseInt(argv[++index], 10));
    }
  }

  return {
    runId,
    onlyId: onlyIds.length > 0 ? onlyIds : undefined,
    onlyTag: onlyTags.length > 0 ? onlyTags : undefined,
    maxFixtures,
    dryRun,
    fixturesPath,
    gate,
    trials,
  };
}

const AA_ROUTED_PROXY_MIN = 97;
const AA_SCICODE_PROXY_MIN = 35;
const AA_TAU2_PROXY_MIN = 90;
const AA_GDPVAL_PROXY_MIN = 90;
const AA_GDPVAL_PROXY_MIN_V8 = 92;
const AA_GDPVAL_FIXTURE_FLOOR = 0.85;
const AA_OMNISCIENCE_PROXY_MIN = 95;
const AA_FULL_LITE_RENORM_MIN = 92;
const AA_FULL_COUNCIL_EVAL_MIN = 85;
const AA_FULL_COUNCIL_EVAL_MIN_V8 = 92;
const AA_TOKEN_MULTIPLIER_MAX = 1.4;
const AA_PRODUCT_P95_LATENCY_MS_MAX = 120_000;
const AA_GATE_RUN_IDS = new Set([
  "regression-aa-routed-v8",
  "regression-aa-routed-v7",
  "regression-aa-routed-v6",
  "regression-aa-routed-v5",
  "regression-aa-routed",
]);

function isV8RegressionRun(runId: string): boolean {
  return (
    runId === "regression-aa-routed-v8" ||
    runId.startsWith("regression-aa-routed-v8-trial-")
  );
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function agentFixturePassMap(
  results: AaFixtureResult[],
): Map<string, boolean> {
  const passes = new Map<string, boolean>();
  for (const result of results) {
    if (result.skipped || result.grading !== "agent") {
      continue;
    }
    const prior = passes.get(result.fixtureId) ?? true;
    passes.set(
      result.fixtureId,
      prior && Boolean(result.councilGrade?.pass),
    );
  }
  return passes;
}

function assertGdpvalFixtureFloors(results: AaFixtureResult[]): void {
  const failures = results.filter(
    (result) =>
      !result.skipped &&
      result.aaEval === "gdpval-aa" &&
      (result.councilGrade?.score ?? 0) < AA_GDPVAL_FIXTURE_FLOOR,
  );
  if (failures.length > 0) {
    console.error(
      `AA regression gate failed: GDPval fixtures below per-fixture floor ${AA_GDPVAL_FIXTURE_FLOOR}: ${failures.map((result) => `${result.fixtureId} (${(result.councilGrade?.score ?? 0).toFixed(2)})`).join(", ")}`,
    );
    process.exit(1);
  }
}

function assertProductSlos(summary: AaRunSummary): void {
  const slos = summary.productSlos;
  if (!slos) {
    console.error(
      "AA regression gate failed: productSlos missing from summary (Wave 8)",
    );
    process.exit(1);
  }
  if (slos.apiFailureRate > 0) {
    console.error(
      `AA regression gate failed: API failure rate ${(slos.apiFailureRate * 100).toFixed(1)}% (target 0%)`,
    );
    process.exit(1);
  }
  if (slos.agentPassRate < 1) {
    console.error(
      `AA regression gate failed: agent pass rate ${(slos.agentPassRate * 100).toFixed(0)}% (target 100%)`,
    );
    process.exit(1);
  }
  if (slos.latencyMs.p95 > AA_PRODUCT_P95_LATENCY_MS_MAX) {
    console.error(
      `AA regression gate failed: routed product p95 latency ${Math.round(slos.latencyMs.p95)}ms exceeds ${AA_PRODUCT_P95_LATENCY_MS_MAX}ms`,
    );
    process.exit(1);
  }
}

function assertRegressionGates(
  summary: AaRunSummary,
  results: AaFixtureResult[],
  routedProxyForGate: number,
  agentPassesAcrossTrials?: Map<string, boolean>,
): void {
  const v8 = isV8RegressionRun(summary.runId);
  const gdpvalMin = v8 ? AA_GDPVAL_PROXY_MIN_V8 : AA_GDPVAL_PROXY_MIN;
  const fullCouncilEvalMin = v8
    ? AA_FULL_COUNCIL_EVAL_MIN_V8
    : AA_FULL_COUNCIL_EVAL_MIN;
  const scicode = summary.proxyIndex.byEval.find(
    (entry) => entry.evalId === "scicode",
  );
  const tau2 = summary.proxyIndex.byEval.find(
    (entry) => entry.evalId === "tau2-bench",
  );
  const gdpval = summary.proxyIndex.byEval.find(
    (entry) => entry.evalId === "gdpval-aa",
  );
  const omniscience = summary.proxyIndex.byEval.find(
    (entry) => entry.evalId === "aa-omniscience",
  );

  if (routedProxyForGate < AA_ROUTED_PROXY_MIN) {
    console.error(
      `AA regression gate failed: routed proxy ${routedProxyForGate.toFixed(2)} is below ${AA_ROUTED_PROXY_MIN}`,
    );
    process.exit(1);
  }
  if (
    scicode &&
    scicode.fixtureCount > 0 &&
    scicode.councilScore < AA_SCICODE_PROXY_MIN
  ) {
    console.error(
      `AA regression gate failed: SciCode proxy ${scicode.councilScore.toFixed(1)} is below ${AA_SCICODE_PROXY_MIN}`,
    );
    process.exit(1);
  }
  if (
    tau2 &&
    tau2.fixtureCount > 0 &&
    tau2.councilScore < AA_TAU2_PROXY_MIN
  ) {
    console.error(
      `AA regression gate failed: tau2 proxy ${tau2.councilScore.toFixed(1)} is below ${AA_TAU2_PROXY_MIN}`,
    );
    process.exit(1);
  }
  if (
    gdpval &&
    gdpval.fixtureCount > 0 &&
    gdpval.councilScore < gdpvalMin
  ) {
    console.error(
      `AA regression gate failed: GDPval proxy ${gdpval.councilScore.toFixed(1)} is below ${gdpvalMin}`,
    );
    process.exit(1);
  }
  if (v8) {
    assertGdpvalFixtureFloors(results);
  }
  if (
    omniscience &&
    omniscience.fixtureCount > 0 &&
    omniscience.councilScore < AA_OMNISCIENCE_PROXY_MIN
  ) {
    console.error(
      `AA regression gate failed: Omniscience proxy ${omniscience.councilScore.toFixed(1)} is below ${AA_OMNISCIENCE_PROXY_MIN}`,
    );
    process.exit(1);
  }
  if (
    summary.fullCouncilProxyIndex &&
    summary.fullCouncilProxyIndex.council < AA_FULL_LITE_RENORM_MIN
  ) {
    console.error(
      `AA regression gate failed: full/lite renormalized proxy ${summary.fullCouncilProxyIndex.council.toFixed(1)} is below ${AA_FULL_LITE_RENORM_MIN}`,
    );
    process.exit(1);
  }
  if (
    summary.fullCouncilEvalProxyIndex &&
    summary.fullCouncilEvalProxyIndex.council < fullCouncilEvalMin
  ) {
    console.error(
      `AA regression gate failed: full-council eval lane proxy ${summary.fullCouncilEvalProxyIndex.council.toFixed(1)} is below ${fullCouncilEvalMin}`,
    );
    process.exit(1);
  }
  const routedProductMult =
    summary.aaRoutedProductTokenMultiplier ?? summary.aaTokenMultiplier;
  if (
    routedProductMult !== undefined &&
    routedProductMult > AA_TOKEN_MULTIPLIER_MAX
  ) {
    console.error(
      `AA regression gate failed: routed product token multiplier ${routedProductMult.toFixed(2)}× exceeds ${AA_TOKEN_MULTIPLIER_MAX}× (full-council-eval lane excluded; all-fixtures ${summary.aaTokenMultiplier?.toFixed(2) ?? "n/a"}×)`,
    );
    process.exit(1);
  }

  const agentPasses =
    agentPassesAcrossTrials ?? agentFixturePassMap(results);
  const agentFailures = [...agentPasses.entries()].filter(([, pass]) => !pass);
  if (agentFailures.length > 0) {
    console.error(
      `AA regression gate failed: agent fixtures did not pass all trials (${agentFailures.map(([id]) => id).join(", ")})`,
    );
    process.exit(1);
  }
  const minAgentFixtures = v8 ? 6 : 4;
  if (agentPasses.size < minAgentFixtures) {
    console.error(
      `AA regression gate failed: expected at least ${minAgentFixtures} agent fixtures, found ${agentPasses.size}`,
    );
    process.exit(1);
  }
  if (v8) {
    assertProductSlos(summary);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dryRun) {
    if (!process.env.INCEPTION_API_KEY?.trim()) {
      console.error("INCEPTION_API_KEY is required for council runs.");
      process.exit(1);
    }
    if (!process.env.INCEPTION_API_KEY_FALLBACK?.trim()) {
      console.error(
        "INCEPTION_API_KEY_FALLBACK is required for baseline and judge runs.",
      );
      process.exit(1);
    }
  }

  const trialProxies: number[] = [];
  let output = await runAaBenchmark({
    runId:
      args.trials > 1 && args.runId
        ? `${args.runId}-trial-1`
        : args.runId,
    onlyId: args.onlyId,
    onlyTag: args.onlyTag,
    maxFixtures: args.maxFixtures,
    dryRun: args.dryRun,
    fixturesPath: args.fixturesPath,
    gate: args.gate,
  });

  if (args.dryRun) {
    return;
  }

  trialProxies.push(output.summary.proxyIndex.council);
  const agentPassesAcrossTrials = agentFixturePassMap(output.results);

  for (let trial = 2; trial <= args.trials; trial++) {
    const trialRunId = args.runId
      ? `${args.runId}-trial-${trial}`
      : `${output.summary.runId}-trial-${trial}`;
    const trialOutput = await runAaBenchmark({
      runId: trialRunId,
      onlyId: args.onlyId,
      onlyTag: args.onlyTag,
      maxFixtures: args.maxFixtures,
      fixturesPath: args.fixturesPath,
    });
    trialProxies.push(trialOutput.summary.proxyIndex.council);
    for (const [fixtureId, passed] of agentFixturePassMap(
      trialOutput.results,
    )) {
      const prior = agentPassesAcrossTrials.get(fixtureId) ?? true;
      agentPassesAcrossTrials.set(fixtureId, prior && passed);
    }
  }

  if (args.trials > 1) {
    const mergedResults = output.results.map((result) => {
      if (result.grading !== "agent") {
        return result;
      }
      const pass = agentPassesAcrossTrials.get(result.fixtureId) ?? false;
      if (pass === result.councilGrade?.pass) {
        return result;
      }
      return {
        ...result,
        councilGrade: result.councilGrade
          ? { ...result.councilGrade, pass, score: pass ? 1 : 0 }
          : { score: 0, pass: false, method: "agent" as const, detail: "failed a trial" },
      };
    });
    output = { ...output, results: mergedResults };
    console.log(
      `\n--- Multi-trial summary (${args.trials} trials) ---\nProxy per trial: ${trialProxies.map((value) => value.toFixed(2)).join(", ")}\nMedian routed proxy: ${median(trialProxies).toFixed(2)}`,
    );
  }

  const { summary } = output;
  const { extrapolation, proxyIndex } = summary;
  const routedProxyForGate =
    args.trials > 1 ? median(trialProxies) : proxyIndex.council;

  console.log("\n--- AA Index proxy benchmark complete ---");
  console.log(`Output: ${output.outputDir}`);
  console.log(
    `Tokens: ${summary.totalTokens.toLocaleString()} / ${summary.tokenBudget.toLocaleString()}`,
  );
  console.log(
    `Proxy index — council: ${proxyIndex.council.toFixed(2)}, baseline: ${proxyIndex.baseline.toFixed(2)}`,
  );
  if (args.trials > 1) {
    console.log(
      `Median routed proxy (${args.trials} trials): ${routedProxyForGate.toFixed(2)}`,
    );
  }
  if (summary.aaTokenMultiplier !== undefined) {
    console.log(
      `AA token multiplier (all fixtures): ${summary.aaTokenMultiplier.toFixed(2)}×`,
    );
  }
  if (summary.aaRoutedProductTokenMultiplier !== undefined) {
    console.log(
      `AA routed product multiplier (excl. full-council-eval): ${summary.aaRoutedProductTokenMultiplier.toFixed(2)}×`,
    );
  }
  if (summary.aaFullCouncilEvalTokenMultiplier !== undefined) {
    console.log(
      `Full-council eval lane multiplier: ${summary.aaFullCouncilEvalTokenMultiplier.toFixed(2)}×`,
    );
  }
  if (summary.hardSliceProxyIndex) {
    console.log(
      `Hard slice proxy (hard-v8): ${summary.hardSliceProxyIndex.council.toFixed(2)}`,
    );
  }
  console.log(
    `Verbosity multiplier: ${extrapolation.verbosityMultiplier.toFixed(2)}x API tokens`,
  );
  console.log(
    `Effective synthesis t/s: ${extrapolation.effectiveSynthesisTps.toFixed(1)}`,
  );

  const shouldGate = args.gate || AA_GATE_RUN_IDS.has(summary.runId);
  if (shouldGate) {
    assertRegressionGates(
      summary,
      output.results,
      routedProxyForGate,
      args.trials > 1 ? agentPassesAcrossTrials : undefined,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
