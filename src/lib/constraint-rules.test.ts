import { describe, expect, it } from "vitest";
import {
  buildConstraintPromptLines,
  inferConstraintsFromQuery,
} from "./constraint-rules";

describe("constraint-rules", () => {
  it("infers sentence count constraints", () => {
    const rules = inferConstraintsFromQuery(
      "Explain photosynthesis in exactly 3 sentences.",
    );
    expect(rules?.minSentences).toBe(3);
    expect(rules?.maxSentences).toBe(3);
  });

  it("builds prompt lines for answerMustBeOnly", () => {
    const lines = buildConstraintPromptLines({ answerMustBeOnly: "YES" });
    expect(lines.join("\n")).toContain("exactly: YES");
  });
});
