import { describe, expect, it } from "vitest";
import { mercuryApiCostUsd } from "../pricing";
import {
  buildProductSlos,
  routedProductCouncilDurationsMs,
} from "./product-slos";
import type { AaFixtureResult } from "./types";

function baseResult(
  overrides: Partial<AaFixtureResult> & Pick<AaFixtureResult, "fixtureId">,
): AaFixtureResult {
  const { fixtureId, ...rest } = overrides;
  return {
    fixtureId,
    tags: [],
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
    aaEval: "terminal-bench",
    aaCategory: "coding",
    grading: "regex",
    ...rest,
  };
}

describe("buildProductSlos", () => {
  it("computes api failure rate and agent pass rate", () => {
    const results = [
      baseResult({
        fixtureId: "ok-01",
        councilDurationMs: 1000,
        councilGrade: {
          score: 1,
          pass: true,
          method: "regex",
          detail: "",
        },
      }),
      baseResult({
        fixtureId: "fail-api",
        errors: ["Council failed: timeout"],
        councilGrade: {
          score: 0,
          pass: false,
          method: "regex",
          detail: "",
        },
      }),
      baseResult({
        fixtureId: "agent-ok",
        grading: "agent",
        councilGrade: {
          score: 1,
          pass: true,
          method: "agent",
          detail: "",
        },
      }),
      baseResult({
        fixtureId: "agent-bad",
        grading: "agent",
        councilGrade: {
          score: 0,
          pass: false,
          method: "agent",
          detail: "",
        },
      }),
    ];

    const slos = buildProductSlos(results);
    expect(slos.apiFailureRate).toBeCloseTo(0.25);
    expect(slos.agentPassRate).toBeCloseTo(0.5);
  });

  it("excludes full-council-eval from routed latency percentiles", () => {
    const results = [
      baseResult({ fixtureId: "routed-fast", councilDurationMs: 10_000 }),
      baseResult({ fixtureId: "routed-slow", councilDurationMs: 50_000 }),
      baseResult({
        fixtureId: "fc-eval",
        tags: ["full-council-eval"],
        councilDurationMs: 500_000,
      }),
    ];

    expect(routedProductCouncilDurationsMs(results)).toEqual([10_000, 50_000]);
    const slos = buildProductSlos(results);
    expect(slos.latencyMs.p50).toBe(10_000);
    expect(slos.latencyMs.p95).toBe(50_000);
  });

  it("estimates cost per pass from council tokens and Mercury pricing", () => {
    const results = [
      baseResult({
        fixtureId: "pass-01",
        usage: { council: 1_000_000, baseline: 0, judge: 0 },
        councilGrade: {
          score: 1,
          pass: true,
          method: "regex",
          detail: "",
        },
      }),
      baseResult({
        fixtureId: "pass-02",
        usage: { council: 1_000_000, baseline: 0, judge: 0 },
        councilGrade: {
          score: 1,
          pass: true,
          method: "regex",
          detail: "",
        },
      }),
    ];

    const slos = buildProductSlos(results);
    const expected =
      mercuryApiCostUsd(2_000_000) / 2;
    expect(slos.costPerPassUsd).toBeCloseTo(expected, 6);
  });
});
