import { describe, expect, it } from "vitest";
import {
  buildGdpvalAbReport,
  buildGdpvalLossDigest,
  resolveGdpvalRetryHint,
} from "./report";
import type { AaFixtureResult } from "./types";

function gdpvalLossResult(
  fixtureId: string,
  councilScore: number,
  baselineScore: number,
  councilMarkdown: string,
): AaFixtureResult {
  return {
    fixtureId,
    tags: ["gdpval-aa"],
    councilMarkdown,
    baselineMarkdown: "baseline body",
    councilDurationMs: 1,
    baselineDurationMs: 1,
    failedMembers: 0,
    usage: { council: 1, baseline: 1, judge: 0 },
    structural: {
      council: { pass: true, issues: [] },
      baseline: { pass: true, issues: [] },
    },
    errors: [],
    aaEval: "gdpval-aa",
    aaCategory: "agents",
    grading: "rubric",
    councilGrade: {
      score: councilScore,
      pass: councilScore >= 0.7,
      method: "rubric-normalized",
      detail: "structure weak",
    },
    baselineGrade: {
      score: baselineScore,
      pass: true,
      method: "rubric-normalized",
      detail: "ok",
    },
  };
}

describe("buildGdpvalLossDigest", () => {
  it("attaches retry hints for losing fixtures", () => {
    const digest = buildGdpvalLossDigest([
      gdpvalLossResult(
        "gdpval-02",
        0.7,
        0.9,
        "Here is your email.\n\nTo: x@y.com\n\nDear vendor,\n\nPlease extend shipment.",
      ),
    ]);
    expect(digest).toHaveLength(1);
    expect(digest[0]!.retryHint).toBeTruthy();
    expect(digest[0]!.retryHint).toMatch(/To\/Subject|email/i);
  });

  it("resolveGdpvalRetryHint prefers fixture map", () => {
    const hint = resolveGdpvalRetryHint(
      gdpvalLossResult("gdpval-04", 0.6, 0.8, "Would you like an agenda?\n\n1. Standup"),
    );
    expect(hint).toMatch(/agenda/i);
  });
});

describe("buildGdpvalAbReport", () => {
  it("collects ab entries from fixture results", () => {
    const report = buildGdpvalAbReport([
      {
        ...gdpvalLossResult("gdpval-ab-01", 0.88, 0.85, "Incident report template"),
        gdpvalAb: {
          productionMode: "lite",
          productionScore: 0.88,
          altMode: "full",
          altScore: 0.92,
          scoreDelta: 0.04,
        },
      },
    ]);
    expect(report).toHaveLength(1);
    expect(report![0]!.scoreDelta).toBeCloseTo(0.04);
  });
});
