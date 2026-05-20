import { describe, expect, it } from "vitest";
import { detectCouncilMode } from "./council-mode";

describe("detectCouncilMode", () => {
  it("routes MCQ prompts to single", () => {
    const result = detectCouncilMode(
      "Which of the following is correct?\nA) foo\nB) bar\nC) baz\nD) qux",
    );
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("mcq");
  });

  it("routes terminal prompts to single", () => {
    const result = detectCouncilMode(
      "Given this terminal output, what command should I run next?",
    );
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("terminal");
  });

  it("routes short compare tasks to lite council", () => {
    const result = detectCouncilMode(
      "Compare Postgres vs MySQL for a SaaS billing system with heavy writes.",
    );
    expect(result.mode).toBe("lite");
    expect(result.reasons).toContain("compare:lite");
  });

  it("routes long open compare tasks to full council", () => {
    const longCompare =
      "Compare managed Postgres (Neon), Supabase Postgres, and self-hosted Postgres on a single Hetzner box for a Next.js SaaS with moderate writes, preview branches, EU data residency, and a team of four engineers. We care about operational burden, branching workflows, connection pooling, auth integration, cost at ~500GB storage and 50M rows, and escape hatches if we outgrow the vendor. Which would you pick for year one and what would trigger a migration?";
    expect(longCompare.length).toBeGreaterThanOrEqual(400);
    const result = detectCouncilMode(longCompare);
    expect(result.mode).toBe("full");
    expect(result.reasons).toContain("compare:long-full");
  });

  it("routes short compare with full-council-eval tag to full", () => {
    const result = detectCouncilMode(
      "Compare Redis versus Memcached for a session cache on a single-region Next.js app with 50k DAU, 24h TTL, and occasional thundering-herd on login. Pick one for year one.",
      { tags: ["full-council-eval", "compare"] },
    );
    expect(result.mode).toBe("full");
    expect(result.reasons).toContain("tag:full-council-eval");
  });

  it("routes terse procedural howto to single", () => {
    const result = detectCouncilMode(
      "Steps to rotate an API key in Vercel and invalidate the old one without downtime?",
    );
    expect(result.mode).toBe("single");
    expect(result.reasons).toContain("howto:terse-procedural");
  });

  it("routes agent grading to lite with agentTask flag", () => {
    const result = detectCouncilMode("Run echo bench-ok and report stdout.", {
      grading: "agent",
    });
    expect(result.mode).toBe("lite");
    expect(result.agentTask).toBe(true);
  });

  it("routes medium howto to lite", () => {
    const result = detectCouncilMode(
      "How do I set up a local Postgres database with Docker for development?",
    );
    expect(result.mode).toBe("lite");
  });

  it("routes objective grading metadata to single", () => {
    const result = detectCouncilMode("Pick one.", { grading: "mcq" });
    expect(result.mode).toBe("single");
  });

  it("routes long GDPval deliverables to full", () => {
    const longQuery = `${"Write a comprehensive one-page standard operating procedure for opening shift at a retail electronics department. ".repeat(3)}Include employee name columns, initials, manager sign-off, cash handling rules, security checks, and end-of-day filing instructions with folder names and email recipients.`;
    expect(longQuery.length).toBeGreaterThan(400);
    const result = detectCouncilMode(longQuery, {
      tags: ["gdpval-aa"],
    });
    expect(result.mode).toBe("full");
  });

  it("routes short GDPval prompts to lite", () => {
    const result = detectCouncilMode(
      "Outline a meeting agenda for a weekly team standup (15 minutes max, 5 agenda items).",
      { tags: ["gdpval-aa"] },
    );
    expect(result.mode).toBe("lite");
    expect(result.reasons).toContain("gdpval:short-lite");
  });

  it("routes casual infra debug to lite", () => {
    const result = detectCouncilMode(
      "hey my websocket keeps disconnecting every 30 sec, nginx in front, any ideas?",
    );
    expect(result.mode).toBe("lite");
    expect(result.reasons).toContain("debug:casual-infra");
  });

  it("routes ifbench grading to constrained single without exact footer", () => {
    const result = detectCouncilMode("Reply with only the word YES in capital letters.", {
      grading: "ifbench",
      constraintRules: { answerMustBeOnly: "YES" },
    });
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("constrained");
    expect(result.constraintRules?.answerMustBeOnly).toBe("YES");
  });

  it("routes omniscience exact facts to single", () => {
    const result = detectCouncilMode(
      "What is the chemical symbol for tungsten?",
      { grading: "exact" },
    );
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("exact");
  });

  it("routes terse blunt debug with tldr to lite", () => {
    const result = detectCouncilMode(
      "Next.js API route returns 500 only in prod. Logs show 'Dynamic server usage'. tldr fix?",
    );
    expect(result.mode).toBe("lite");
    expect(result.reasons).toContain("debug:terse-actionable");
  });

  it("routes scicode regex fixtures to code single-shot", () => {
    const result = detectCouncilMode(
      "Write a Python function `is_palindrome(s: str) -> bool`. Include the function signature.",
      { grading: "regex", tags: ["scicode", "coding"] },
    );
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("code");
  });

  it("routes terminal regex fixtures to terminal single-shot", () => {
    const result = detectCouncilMode(
      "To find files named config.yml, give the find command pattern.",
      { grading: "regex" },
    );
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("terminal");
  });

  it("routes full-council-eval tag to full", () => {
    const result = detectCouncilMode("Short compare question?", {
      tags: ["full-council-eval", "compare"],
    });
    expect(result.mode).toBe("full");
    expect(result.reasons).toContain("tag:full-council-eval");
  });

  it("detects constrained queries from heuristics", () => {
    const result = detectCouncilMode(
      "Explain why the sky is blue in exactly 3 sentences. No bullet points.",
    );
    expect(result.mode).toBe("single");
    expect(result.precisionHint).toBe("constrained");
  });
});
