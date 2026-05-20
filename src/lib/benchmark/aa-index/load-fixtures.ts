import { readFileSync } from "fs";
import { join } from "path";
import type { AaIndexFixture } from "./types";

export function loadAaIndexFixtures(fixturesPath?: string): AaIndexFixture[] {
  const path =
    fixturesPath ?? join(process.cwd(), "benchmarks", "aa-index-fixtures.jsonl");
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as AaIndexFixture;
    } catch {
      throw new Error(`Invalid JSON on aa-index fixtures line ${index + 1}`);
    }
  });
}

export function filterAaFixtures(
  fixtures: AaIndexFixture[],
  onlyId?: string | string[],
  maxFixtures?: number,
  onlyTag?: string | string[],
): AaIndexFixture[] {
  let filtered = fixtures;
  const ids = onlyId
    ? Array.isArray(onlyId)
      ? onlyId
      : [onlyId]
    : undefined;
  if (ids && ids.length > 0) {
    filtered = fixtures.filter((fixture) => ids.includes(fixture.id));
    if (filtered.length === 0) {
      throw new Error(`AA fixture not found: ${ids.join(", ")}`);
    }
    const missing = ids.filter(
      (id) => !fixtures.some((fixture) => fixture.id === id),
    );
    if (missing.length > 0) {
      throw new Error(`AA fixture not found: ${missing.join(", ")}`);
    }
  }
  const tags = onlyTag
    ? Array.isArray(onlyTag)
      ? onlyTag
      : [onlyTag]
    : undefined;
  if (tags && tags.length > 0) {
    filtered = filtered.filter((fixture) =>
      tags.some((tag) => fixture.tags.includes(tag)),
    );
    if (filtered.length === 0) {
      throw new Error(`No AA fixtures with tag(s): ${tags.join(", ")}`);
    }
  }
  if (maxFixtures !== undefined && maxFixtures > 0) {
    filtered = filtered.slice(0, maxFixtures);
  }
  return filtered;
}
