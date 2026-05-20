import { describe, expect, it } from "vitest";
import { analyzeUserInput } from "./user-input-profile";

describe("analyzeUserInput", () => {
  it("detects formal tone", () => {
    const profile = analyzeUserInput(
      "Could you please kindly explain the difference between these two approaches?",
    );
    expect(profile.tone).toBe("formal");
  });

  it("detects casual tone", () => {
    const profile = analyzeUserInput("hey btw lol how does this work tbh");
    expect(profile.tone).toBe("casual");
  });

  it("detects blunt terse tone", () => {
    const profile = analyzeUserInput("tldr just tell me the fix");
    expect(profile.tone).toBe("blunt");
    expect(profile.verbosity).toBe("terse");
  });

  it("detects emotional load", () => {
    const profile = analyzeUserInput(
      "I'm really anxious and overwhelmed about this deadline",
    );
    expect(profile.tone).toBe("emotional");
    expect(profile.emotionalLoad).toBe(true);
  });

  it("detects debug task from code fence", () => {
    const profile = analyzeUserInput(
      "Getting this error:\n```\nTypeError: Cannot read property 'x'\n```",
    );
    expect(profile.task).toBe("debug");
    expect(profile.technical).toBe(true);
  });

  it("detects howto task", () => {
    const profile = analyzeUserInput("How do I set up authentication in Next.js?");
    expect(profile.task).toBe("howto");
  });

  it("detects compare task", () => {
    const profile = analyzeUserInput(
      "What's the difference between Redis vs in-memory cache?",
    );
    expect(profile.task).toBe("compare");
  });

  it("defaults to neutral and general for plain queries", () => {
    const profile = analyzeUserInput("What time is it in Tokyo?");
    expect(profile.tone).toBe("neutral");
    expect(profile.task).toBe("general");
  });
});
