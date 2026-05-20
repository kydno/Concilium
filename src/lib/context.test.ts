import { describe, expect, it } from "vitest";
import {
  estimateConversationTokens,
  PRIOR_ANSWER_MAX_CHARS,
  PRIOR_CONTEXT_TOKEN_BUDGET,
  selectPriorTurns,
} from "./context";
import { buildPriorContext } from "./prompts";

function makeTurn(query: string, answer: string, excerpt?: string) {
  return {
    query,
    result: { synthesis: { markdown: answer } },
    contextFilename: excerpt ? "notes.txt" : undefined,
    contextExcerpt: excerpt,
  };
}

describe("estimateConversationTokens", () => {
  it("includes document excerpts from attached turns", () => {
    const total = estimateConversationTokens([
      makeTurn("q", "answer", "document body excerpt"),
    ]);
    expect(total).toBeGreaterThan(estimateConversationTokens([makeTurn("q", "answer")]));
  });
});

describe("selectPriorTurns", () => {
  it("returns empty array for no turns", () => {
    expect(selectPriorTurns([])).toEqual([]);
  });

  it("includes recent turns up to the token budget", () => {
    const turns = [
      makeTurn("first", "a".repeat(100)),
      makeTurn("second", "b".repeat(100)),
      makeTurn("third", "c".repeat(100)),
    ];

    const selected = selectPriorTurns(turns);
    expect(selected).toHaveLength(3);
    expect(selected[2]?.query).toBe("third");
  });

  it("truncates long answers", () => {
    const longAnswer = "x".repeat(PRIOR_ANSWER_MAX_CHARS + 500);
    const selected = selectPriorTurns([makeTurn("q", longAnswer)]);

    expect(selected[0]?.synthesisMarkdown).toHaveLength(PRIOR_ANSWER_MAX_CHARS);
  });

  it("preserves attachment metadata", () => {
    const selected = selectPriorTurns([
      makeTurn("q", "answer", "excerpt from file"),
    ]);

    expect(selected[0]).toMatchObject({
      contextFilename: "notes.txt",
      contextExcerpt: "excerpt from file",
    });
  });

  it("stops adding turns when the budget is exceeded", () => {
    const huge = "z".repeat(PRIOR_CONTEXT_TOKEN_BUDGET * 4);
    const turns = [
      makeTurn("old", huge),
      makeTurn("recent", "short answer"),
    ];

    const selected = selectPriorTurns(turns, 5, 500);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.query).toBe("recent");
  });
});

describe("buildPriorContext", () => {
  it("formats turns for coherent follow-ups", () => {
    const context = buildPriorContext([
      {
        query: "What is Mercury?",
        synthesisMarkdown: "Mercury is a council runner.",
        contextFilename: "brief.txt",
        contextExcerpt: "Product overview",
      },
    ]);

    expect(context).toContain("Continue this conversation coherently");
    expect(context).toContain("User: What is Mercury?");
    expect(context).toContain("[Attached brief.txt: Product overview]");
    expect(context).toContain("Assistant: Mercury is a council runner.");
  });
});
