import { runMercuryAnswer } from "../mercury-answer";
import { priorTurnsForCouncil } from "./fixture-context";
import type { BenchmarkFixture } from "./types";

export interface SingleShotResult {
  markdown: string;
  durationMs: number;
  tokens: number;
}

export async function runSingleShot(fixture: BenchmarkFixture): Promise<SingleShotResult> {
  const result = await runMercuryAnswer({
    query: fixture.query,
    contextText: fixture.contextText ?? undefined,
    contextFilename:
      fixture.contextFilename ?? (fixture.contextText ? "attachment.txt" : undefined),
    priorTurns: priorTurnsForCouncil(fixture),
    apiKey: "fallback-only",
  });

  return {
    markdown: result.markdown,
    durationMs: result.durationMs,
    tokens: result.tokens,
  };
}
