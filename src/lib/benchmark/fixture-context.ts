import { buildPriorContext } from "../prompts";
import type { PriorTurn } from "../types";
import type { BenchmarkFixture } from "./types";

export function buildPriorContextFromFixture(
  fixture: BenchmarkFixture,
): string | undefined {
  if (!fixture.priorTurns?.length) return undefined;
  return buildPriorContext(fixture.priorTurns);
}

export function priorTurnsForCouncil(fixture: BenchmarkFixture): PriorTurn[] | undefined {
  return fixture.priorTurns?.length ? fixture.priorTurns : undefined;
}
