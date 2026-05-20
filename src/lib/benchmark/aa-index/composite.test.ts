import { describe, expect, it } from "vitest";
import { buildProxyIndex } from "./composite";
import type { AaFixtureResult } from "./types";

function gdpvalResult(
  id: string,
  councilScore: number,
  baselineScore: number,
): AaFixtureResult {
  return {
    fixtureId: id,
    tags: ["gdpval-aa"],
    councilMarkdown: "",
    baselineMarkdown: "",
    councilDurationMs: 0,
    baselineDurationMs: 0,
    failedMembers: 0,
    usage: { council: 0, baseline: 0, judge: 0 },
    structural: {
      council: { pass: true, issues: [] },
      baseline: { pass: true, issues: [] },
    },
    errors: [],
    aaEval: "gdpval-aa",
    aaCategory: "agents",
    grading: "rubric",
    routingMode: "full",
    councilGrade: {
      score: councilScore,
      pass: councilScore >= 0.5,
      method: "rubric-normalized",
      detail: "",
    },
    baselineGrade: {
      score: baselineScore,
      pass: baselineScore >= 0.5,
      method: "rubric-normalized",
      detail: "",
    },
  };
}

describe("buildProxyIndex", () => {
  it("renormalizes subset weights so gdpval-only index reflects actual scores", () => {
    const results = [
      gdpvalResult("gdpval-01", 0.9, 0.7),
      gdpvalResult("gdpval-02", 0.9, 0.7),
      gdpvalResult("gdpval-03", 0.9, 0.7),
      gdpvalResult("gdpval-04", 0.9, 0.7),
      gdpvalResult("gdpval-05", 0.9, 0.7),
      gdpvalResult("gdpval-06", 0.9, 0.7),
    ];

    const legacy = buildProxyIndex(results);
    const renormalized = buildProxyIndex(results, { renormalizeWeights: true });

    expect(legacy.council).toBeLessThan(20);
    expect(renormalized.council).toBeGreaterThan(85);
    expect(renormalized.council).toBeCloseTo(90, 0);
  });
});
