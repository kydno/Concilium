import { describe, expect, it } from "vitest";
import { resolveSubagentViews } from "./subagent-views";
import type { CouncilResult, OrchestratorPlan } from "./types";

const samplePlan: OrchestratorPlan = {
  synthesisFocus: "test",
  members: [
    { id: "a", title: "Analyst", systemPrompt: "Analyze evidence." },
    { id: "b", title: "Skeptic", systemPrompt: "Challenge claims." },
    { id: "c", title: "Planner", systemPrompt: "Plan actions." },
  ],
};

const sampleResult: CouncilResult = {
  plan: samplePlan,
  members: [
    { id: "a", title: "Analyst", content: "Analysis here." },
    { id: "b", title: "Skeptic", content: "Counterpoints here." },
    { id: "c", title: "Planner", content: "Steps here." },
  ],
  synthesis: { markdown: "Final answer.", consensus: [], conflicts: [] },
  meta: { durationMs: 1, failedMembers: 0 },
};

describe("resolveSubagentViews", () => {
  it("returns null when there is no council data", () => {
    expect(
      resolveSubagentViews({
        liveQuery: null,
        upload: null,
        plan: null,
        members: [],
        result: null,
        priorTurns: [],
      }),
    ).toBeNull();
  });

  it("builds views from the latest stored turn", () => {
    const views = resolveSubagentViews({
      liveQuery: null,
      upload: null,
      plan: null,
      members: [],
      result: null,
      priorTurns: [],
      latestTurn: {
        id: "t1",
        query: "What is X?",
        createdAt: new Date().toISOString(),
        result: sampleResult,
      },
    });

    expect(views).toHaveLength(3);
    expect(views?.[0]).toMatchObject({
      title: "Analyst",
      systemPrompt: "Analyze evidence.",
      response: "Analysis here.",
      status: "ready",
    });
    expect(views?.[0]?.userPrompt).toContain("What is X?");
  });

  it("uses live plan and partial members during an active run", () => {
    const views = resolveSubagentViews({
      liveQuery: "Live question",
      upload: null,
      plan: samplePlan,
      members: [{ id: "a", title: "Analyst", content: "Partial." }],
      result: null,
      priorTurns: [],
    });

    expect(views?.[0]?.status).toBe("ready");
    expect(views?.[1]?.status).toBe("pending");
  });
});
