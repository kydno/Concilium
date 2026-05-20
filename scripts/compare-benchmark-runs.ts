import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  MERCURY_INPUT_USD_PER_M,
  MERCURY_OUTPUT_USD_PER_M,
} from "../src/lib/benchmark/pricing";

const MISTRAL_INPUT_USD_PER_M = 1.5;
const MISTRAL_OUTPUT_USD_PER_M = 7.5;
const AA_MERCURY_PUBLISHED_INDEX = 33;
const AA_MISTRAL_OFFICIAL_INDEX = 39;
const AA_MERCURY_PUBLISHED_OUTPUT_TOKENS = 70_000_000;
const AA_MISTRAL_PUBLISHED_OUTPUT_TOKENS = 90_000_000;

interface AaSummaryRow {
  runId: string;
  proxyCouncil: number;
  proxyBaseline: number;
  estimatedIndex: number;
  aaTokenMultiplier: number;
  gdpvalProxy?: number;
  tau2Proxy?: number;
  fullLiteRenorm?: number;
  routingFull: number;
  routingLite: number;
  routingSingle: number;
}

interface OpenSummaryRow {
  runId: string;
  winRate: number;
  openCouncilOverBaseline?: number;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadAaRow(runId: string): AaSummaryRow | null {
  const summary = readJson<{
    runId: string;
    extrapolation: { estimatedCouncilIndex: number };
    aaTokenMultiplier?: number;
    aaRoutedProductTokenMultiplier?: number;
    totalCouncilTokens: number;
    totalBaselineTokens: number;
    fullCouncilProxyIndex?: { council: number };
    routingStats?: { full: number; lite: number; single: number };
    gdpvalAbReport?: Array<{
      fixtureId: string;
      productionMode: string;
      productionScore: number;
      altMode: string;
      altScore: number;
      scoreDelta: number;
    }>;
    proxyIndex: {
      council: number;
      baseline: number;
      byEval: Array<{ evalId: string; councilScore: number }>;
    };
  }>(join(process.cwd(), "benchmarks", "runs", runId, "summary.json"));

  if (!summary) {
    return null;
  }

  const tokenMult =
    summary.aaRoutedProductTokenMultiplier ??
    summary.aaTokenMultiplier ??
    (summary.totalBaselineTokens > 0
      ? summary.totalCouncilTokens / summary.totalBaselineTokens
      : 0);

  return {
    runId: summary.runId,
    proxyCouncil: summary.proxyIndex.council,
    proxyBaseline: summary.proxyIndex.baseline,
    estimatedIndex: summary.extrapolation.estimatedCouncilIndex,
    aaTokenMultiplier: tokenMult,
    gdpvalProxy: summary.proxyIndex.byEval.find((e) => e.evalId === "gdpval-aa")
      ?.councilScore,
    tau2Proxy: summary.proxyIndex.byEval.find((e) => e.evalId === "tau2-bench")
      ?.councilScore,
    fullLiteRenorm: summary.fullCouncilProxyIndex?.council,
    routingFull: summary.routingStats?.full ?? 0,
    routingLite: summary.routingStats?.lite ?? 0,
    routingSingle: summary.routingStats?.single ?? 0,
  };
}

function loadOpenRow(runId: string): OpenSummaryRow | null {
  const summary = readJson<{
    runId: string;
    councilWinRate: number;
    openCouncilOverBaseline?: number;
    totalCouncilTokens?: number;
    totalBaselineTokens?: number;
  }>(join(process.cwd(), "benchmarks", "runs", runId, "summary.json"));

  if (!summary) {
    return null;
  }

  const ratio =
    summary.openCouncilOverBaseline ??
    (summary.totalBaselineTokens && summary.totalCouncilTokens
      ? summary.totalCouncilTokens / summary.totalBaselineTokens
      : undefined);

  return {
    runId: summary.runId,
    winRate: summary.councilWinRate,
    openCouncilOverBaseline: ratio,
  };
}

const AA_RUN_IDS = [
  "regression-aa-routed",
  "regression-aa-routed-v2",
  "regression-aa-routed-v3",
  "regression-aa-routed-v4",
  "regression-aa-routed-v5",
  "regression-aa-routed-v6",
  "regression-aa-routed-v7",
  "regression-aa-routed-v8",
];

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

function loadTrialProxies(baseRunId: string, trialCount = 3): number[] {
  const proxies: number[] = [];
  for (let trial = 1; trial <= trialCount; trial++) {
    const row = loadAaRow(`${baseRunId}-trial-${trial}`);
    if (row) {
      proxies.push(row.proxyCouncil);
    }
  }
  return proxies;
}

function main() {
  console.log("# Mercury2 Council — benchmark composite (pre-route → v8)\n");
  console.log("## Pricing constants (per 1M tokens)");
  console.log(
    `| Model | Input | Output |\n|-------|-------|--------|\n| Mercury 2 (proxy) | $${MERCURY_INPUT_USD_PER_M} | $${MERCURY_OUTPUT_USD_PER_M} |\n| Mistral (AA reference) | $${MISTRAL_INPUT_USD_PER_M} | $${MISTRAL_OUTPUT_USD_PER_M} |`,
  );
  console.log("\n## AA Index anchors");
  console.log(
    `- Mercury published proxy index: **${AA_MERCURY_PUBLISHED_INDEX}** (~${(AA_MERCURY_PUBLISHED_OUTPUT_TOKENS / 1_000_000).toFixed(0)}M output tokens @ Mercury pricing)`,
  );
  console.log(
    `- Mistral official AA index: **${AA_MISTRAL_OFFICIAL_INDEX}** (~${(AA_MISTRAL_PUBLISHED_OUTPUT_TOKENS / 1_000_000).toFixed(0)}M output tokens @ Mistral pricing)`,
  );
  console.log(
    `- Extrapolated council index @ Mercury pricing often lands ~36–38 when routed proxy ≈97 (heuristic; not a release gate).\n`,
  );

  console.log("## Routed AA proxy runs\n");
  console.log(
    "| Run | Routed proxy | Baseline proxy | Est. AA index | Routed product mult | GDPval | tau2 | Full/lite renorm | full | lite | single |",
  );
  console.log(
    "|-----|--------------|----------------|---------------|---------------|--------|------|------------------|------|------|--------|",
  );

  for (const runId of AA_RUN_IDS) {
    const row = loadAaRow(runId);
    if (!row) {
      console.log(`| ${runId} | — | — | — | — | — | — | — | — | — | — |`);
      continue;
    }
    console.log(
      `| ${row.runId} | ${row.proxyCouncil.toFixed(2)} | ${row.proxyBaseline.toFixed(2)} | ${row.estimatedIndex.toFixed(1)} | ${row.aaTokenMultiplier.toFixed(2)}× | ${row.gdpvalProxy?.toFixed(1) ?? "n/a"} | ${row.tau2Proxy?.toFixed(1) ?? "n/a"} | ${row.fullLiteRenorm?.toFixed(1) ?? "n/a"} | ${row.routingFull} | ${row.routingLite} | ${row.routingSingle} |`,
    );
  }

  const v8TrialProxies = loadTrialProxies("regression-aa-routed-v8");
  if (v8TrialProxies.length > 0) {
    const trialMedian = median(v8TrialProxies);
    const mean =
      v8TrialProxies.reduce((sum, value) => sum + value, 0) /
      v8TrialProxies.length;
    const variance =
      v8TrialProxies.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      v8TrialProxies.length;
    console.log("\n## Wave 8 regression trials (`regression-aa-routed-v8`)\n");
    console.log(
      `- Per-trial routed proxy: ${v8TrialProxies.map((value) => value.toFixed(2)).join(", ")}`,
    );
    console.log(`- Median: **${trialMedian.toFixed(2)}** (regression gate)`);
    console.log(`- Variance: **${variance.toFixed(4)}**`);
  }

  const openRow = loadOpenRow("regression-open");
  if (openRow) {
    console.log("\n## Open regression (`regression-open`)\n");
    console.log(
      `- Rubric win rate: **${(openRow.winRate * 100).toFixed(1)}%**`,
    );
    if (openRow.openCouncilOverBaseline !== undefined) {
      console.log(
        `- Council/baseline token ratio: **${openRow.openCouncilOverBaseline.toFixed(2)}×**`,
      );
    }
  } else {
    console.log("\n*(No `regression-open` summary found — run open benchmark first.)*\n");
  }

  const abRuns = AA_RUN_IDS.map((runId) => {
    const summary = readJson<{
      runId: string;
      gdpvalAbReport?: Array<{
        fixtureId: string;
        productionMode: string;
        productionScore: number;
        altMode: string;
        altScore: number;
        scoreDelta: number;
      }>;
    }>(join(process.cwd(), "benchmarks", "runs", runId, "summary.json"));
    return summary?.gdpvalAbReport?.length
      ? { runId: summary.runId, report: summary.gdpvalAbReport }
      : null;
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (abRuns.length > 0) {
    console.log("\n## GDPval routing A/B (`gdpval-ab`, report only)\n");
    for (const { runId, report } of abRuns) {
      console.log(`### ${runId}\n`);
      console.log(
        "| Fixture | Production | Prod score | Alt | Alt score | Δ (alt−prod) |",
      );
      console.log(
        "|---------|------------|------------|-----|-----------|--------------|",
      );
      for (const entry of report) {
        console.log(
          `| ${entry.fixtureId} | ${entry.productionMode} | ${(entry.productionScore * 100).toFixed(1)} | ${entry.altMode} | ${(entry.altScore * 100).toFixed(1)} | ${(entry.scoreDelta * 100).toFixed(1)} |`,
        );
      }
      console.log("");
    }
  }
}

main();
