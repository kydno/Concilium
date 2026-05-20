import { readFileSync } from "fs";
import { join } from "path";
import type { BenchmarkFixture } from "./types";

export function loadFixtures(fixturesPath?: string): BenchmarkFixture[] {
  const path =
    fixturesPath ?? join(process.cwd(), "benchmarks", "fixtures.jsonl");
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as BenchmarkFixture;
    } catch {
      throw new Error(`Invalid JSON on fixtures line ${index + 1}`);
    }
  });
}

export function filterFixtures(
  fixtures: BenchmarkFixture[],
  onlyIds?: string | string[],
  maxFixtures?: number,
): BenchmarkFixture[] {
  let filtered = fixtures;
  const ids = onlyIds
    ? Array.isArray(onlyIds)
      ? onlyIds
      : [onlyIds]
    : undefined;
  if (ids && ids.length > 0) {
    filtered = fixtures.filter((fixture) => ids.includes(fixture.id));
    if (filtered.length === 0) {
      throw new Error(`Fixture not found: ${ids.join(", ")}`);
    }
    const missing = ids.filter(
      (id) => !fixtures.some((fixture) => fixture.id === id),
    );
    if (missing.length > 0) {
      throw new Error(`Fixture not found: ${missing.join(", ")}`);
    }
  }
  if (maxFixtures !== undefined && maxFixtures > 0) {
    filtered = filtered.slice(0, maxFixtures);
  }
  return filtered;
}
