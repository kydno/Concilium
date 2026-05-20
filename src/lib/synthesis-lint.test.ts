import { describe, expect, it } from "vitest";
import {
  shouldSkipIdempotentChairRetry,
  synthesisLintRegenerateClass,
} from "./synthesis-lint";

describe("synthesis-lint idempotent chair retry", () => {
  it("classifies opener vs truncation issues", () => {
    expect(
      synthesisLintRegenerateClass([
        "Deliverable-first task opens with a question instead of content",
      ]),
    ).toBe("opener");
    expect(
      synthesisLintRegenerateClass(["Answer appears truncated (heuristic)"]),
    ).toBe("truncation");
  });

  it("skips second retry when lint class unchanged", () => {
    const initial = [
      "Deliverable-first task opens with a question instead of content",
    ];
    const after = [
      "Deliverable task opens with question before deliverable body",
    ];
    expect(shouldSkipIdempotentChairRetry(initial, after)).toBe(true);
  });

  it("allows second retry when lint class changes", () => {
    const initial = [
      "Deliverable-first task opens with a question instead of content",
    ];
    const after = ["Answer appears truncated (heuristic)"];
    expect(shouldSkipIdempotentChairRetry(initial, after)).toBe(false);
  });
});
