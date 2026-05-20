import { config } from "dotenv";
import { resolve } from "path";
import {
  councilWonRubric,
  minUserRubricScore,
} from "../src/lib/benchmark/judge";
import { runBenchmark } from "../src/lib/benchmark/runner";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function parseArgs(argv: string[]) {
  let runId: string | undefined;
  const onlyIds: string[] = [];
  let maxFixtures: number | undefined;
  let dryRun = false;
  let gate = false;
  let fixturesPath: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--gate") gate = true;
    else if (arg === "--run-id" && argv[index + 1]) {
      runId = argv[++index];
    } else if (arg === "--only" && argv[index + 1]) {
      onlyIds.push(argv[++index]);
    } else if (arg === "--max-fixtures" && argv[index + 1]) {
      maxFixtures = Number.parseInt(argv[++index], 10);
    } else if (arg === "--fixtures" && argv[index + 1]) {
      fixturesPath = argv[++index];
    }
  }

  return {
    runId,
    onlyId: onlyIds.length > 0 ? onlyIds : undefined,
    maxFixtures,
    dryRun,
    fixturesPath,
    gate,
  };
}

const OPEN_REGRESSION_RUN_IDS = new Set(["regression-open"]);
const OPEN_WIN_RATE_THRESHOLD = 0.9;
const OPEN_USER_RUBRIC_MIN = 7;

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

  const output = await runBenchmark({
    runId: args.runId,
    onlyId: args.onlyId,
    maxFixtures: args.maxFixtures,
    dryRun: args.dryRun,
    fixturesPath: args.fixturesPath,
  });

  if (args.dryRun) {
    return;
  }

  const { summary } = output;
  console.log("\n--- Benchmark complete ---");
  console.log(`Output: ${output.outputDir}`);
  console.log(
    `Tokens: ${summary.totalTokens.toLocaleString()} / ${summary.tokenBudget.toLocaleString()}`,
  );
  console.log(
    `Council win rate: ${(summary.councilWinRate * 100).toFixed(1)}% (${summary.councilWins}W / ${summary.baselineWins}L / ${summary.ties}T)`,
  );
  console.log(
    `Avg rubric — council usefulness: ${summary.councilAvgRubric.usefulness.toFixed(2)}, baseline: ${summary.baselineAvgRubric.usefulness.toFixed(2)}`,
  );

  const shouldGate =
    args.gate || OPEN_REGRESSION_RUN_IDS.has(summary.runId);
  if (shouldGate) {
    if (summary.councilWinRate < OPEN_WIN_RATE_THRESHOLD) {
      console.error(
        `Regression gate failed: council win rate ${(summary.councilWinRate * 100).toFixed(1)}% is below ${OPEN_WIN_RATE_THRESHOLD * 100}%`,
      );
      process.exit(1);
    }

    const userRubricFailures = output.results.filter((result) => {
      if (result.skipped || !result.rubric) return false;
      if (
        !councilWonRubric(result.rubric.council, result.rubric.baseline)
      ) {
        return false;
      }
      const minScore = minUserRubricScore(result.rubric.council);
      return minScore === undefined || minScore < OPEN_USER_RUBRIC_MIN;
    });
    if (userRubricFailures.length > 0) {
      console.error(
        `Regression gate failed: ${userRubricFailures.length} council win(s) scored below ${OPEN_USER_RUBRIC_MIN} on actionability/correctness/brevity (${userRubricFailures.map((r) => r.fixtureId).join(", ")})`,
      );
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
