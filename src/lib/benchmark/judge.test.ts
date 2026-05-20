import { describe, expect, it } from "vitest";
import {
  councilWonRubric,
  minUserRubricScore,
  rubricWeightedTotal,
  USER_RUBRIC_DIMENSIONS,
} from "./judge";
import type { RubricScores } from "./types";

function scores(overrides: Partial<RubricScores>): RubricScores {
  return {
    usefulness: 8,
    structure: 8,
    accuracy: 8,
    voice: 8,
    actionability: 8,
    correctness: 8,
    brevity: 8,
    ...overrides,
  };
}

describe("user rubric dimensions", () => {
  it("exposes three user-facing dimensions", () => {
    expect(USER_RUBRIC_DIMENSIONS).toEqual([
      "actionability",
      "correctness",
      "brevity",
    ]);
  });

  it("detects council wins by weighted core rubric only", () => {
    const council = scores({ usefulness: 9 });
    const baseline = scores({ usefulness: 7 });
    expect(rubricWeightedTotal(council)).toBeGreaterThan(
      rubricWeightedTotal(baseline),
    );
    expect(councilWonRubric(council, baseline)).toBe(true);
  });

  it("returns minimum user dimension score when all present", () => {
    expect(minUserRubricScore(scores({ brevity: 6 }))).toBe(6);
    expect(
      minUserRubricScore(scores({ actionability: undefined })),
    ).toBeUndefined();
  });
});
