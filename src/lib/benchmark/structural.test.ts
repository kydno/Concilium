import { describe, expect, it } from "vitest";
import {
  checkQuestionOnlyOpener,
  checkStandaloneOpenerQuestion,
  checkTerseDebugSteps,
  runStructuralChecks,
} from "./structural";

describe("runStructuralChecks", () => {
  it("passes a well-formed answer", () => {
    const markdown =
      "Here is a direct answer with enough detail to be useful.\n\n" +
      "A second paragraph adds structure without meta jargon.";

    const result = runStructuralChecks(markdown);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags council meta jargon", () => {
    const markdown =
      "The council concluded that you should use a connection pool.\n\n" +
      "This is otherwise a reasonable length answer with two paragraphs.";

    const result = runStructuralChecks(markdown);
    expect(result.pass).toBe(false);
    expect(result.issues.some((issue) => issue.includes("Meta jargon"))).toBe(
      true,
    );
  });

  it("flags very short answers", () => {
    const result = runStructuralChecks("Too short.");
    expect(result.pass).toBe(false);
  });

  it("flags question-only openers for deliverable-first tags", () => {
    const issue = checkQuestionOnlyOpener("What Nginx block handles /ws/?", [
      "debug",
      "terse",
    ]);
    expect(issue).toBeTruthy();

    const result = runStructuralChecks("What Nginx block handles /ws/?", [
      "howto",
    ]);
    expect(result.pass).toBe(false);
  });

  it("flags terse debug answers without numbered steps", () => {
    const issue = checkTerseDebugSteps("Force a Node.js runtime for the route.", [
      "debug",
      "terse",
      "blunt",
    ]);
    expect(issue).toBeTruthy();

    const ok = checkTerseDebugSteps(
      "Dynamic server usage means Node-only APIs on Edge.\n\n1. Add export const runtime = 'nodejs'.\n2. Remove fs usage from the route.",
      ["debug", "terse"],
    );
    expect(ok).toBeNull();
  });

  it("allows a question followed by an answer paragraph", () => {
    const markdown =
      "What error do you see in prod?\n\n" +
      "Add export const runtime = 'nodejs' to the route file to fix Dynamic server usage.";

    const result = runStructuralChecks(markdown, ["debug"]);
    expect(result.pass).toBe(true);
  });

  it("flags gdpval deliverables that open with a question", () => {
    const markdown =
      "Would you like a printable version of the daily task list template?\n\n" +
      "Retail Electronics – Daily Task List\nSupervisor: ______ Date: ______";

    const issue = checkStandaloneOpenerQuestion(markdown, ["gdpval-aa"]);
    expect(issue).toBeTruthy();
  });

  it("flags howto answers that open with a question", () => {
    const issue = checkQuestionOnlyOpener(
      "Need a quick, step-by-step guide?\n\n1. Create a token.",
      ["howto", "terse"],
    );
    expect(issue).toBeTruthy();
  });
});
