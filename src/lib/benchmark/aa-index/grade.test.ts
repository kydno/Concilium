import { describe, expect, it } from "vitest";
import { gradeAnswer } from "./grade";
import type { AaIndexFixture } from "./types";

function fixture(overrides: Partial<AaIndexFixture>): AaIndexFixture {
  return {
    id: "test",
    tags: ["aa-index"],
    query: "test",
    aaEval: "gpqa-diamond",
    aaCategory: "scientific",
    aaWeight: 0.0625,
    grading: "mcq",
    expectedAnswer: "B",
    ...overrides,
  };
}

describe("gradeAnswer", () => {
  it("grades MCQ answers", () => {
    const result = gradeAnswer("The answer is B because of X.", fixture({}));
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it("prefers Answer: footer line for exact match", () => {
    const result = gradeAnswer(
      "Tungsten is a metal.\n\nAnswer: W",
      fixture({ grading: "exact", expectedAnswer: "W" }),
    );
    expect(result.pass).toBe(true);
  });

  it("prefers Answer: footer line for MCQ", () => {
    const result = gradeAnswer(
      "Long reasoning that mentions A and C.\n\nAnswer: B",
      fixture({ expectedAnswer: "B" }),
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it("grades IFBench constraints", () => {
    const result = gradeAnswer("Yes.", fixture({
      grading: "ifbench",
      ifbenchRules: { maxSentences: 1, answerMustBeOnly: "Yes." },
    }));
    expect(result.pass).toBe(true);
  });

  it("accepts scientific notation for exact mantissa answers", () => {
    const result = gradeAnswer(
      "The speed of light in vacuum is approximately 3×10^8 m/s.\n\nAnswer: 3e8",
      fixture({
        grading: "exact",
        aaEval: "aa-omniscience",
        expectedAnswer: "3",
      }),
    );
    expect(result.pass).toBe(true);
  });

  it("grades numeric answers with tolerance", () => {
    const result = gradeAnswer("The speed is 9.8 m/s.", fixture({
      grading: "numeric",
      expectedAnswer: "9.81",
      numericTolerance: 0.1,
    }));
    expect(result.pass).toBe(true);
  });
});
