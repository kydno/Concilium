import { afterEach, describe, expect, it } from "vitest";
import {
  extractAgentCommand,
  extractAgentToolBlocks,
  formatAgentToolBlock,
  gradeAgentOutput,
  gradeAgentTranscript,
  normalizeAgentCommand,
  resetAgentMockFs,
  runAgentTask,
  runDeterministicAgentSteps,
} from "./agent-task";

describe("agent-task", () => {
  afterEach(() => {
    resetAgentMockFs();
    delete process.env.AGENT_REAL_SHELL;
  });

  it("extracts Command footer lines", () => {
    expect(
      extractAgentCommand("Run this.\n\nCommand: `echo bench-ok`"),
    ).toBe("echo bench-ok");
  });

  it("grades mock agent stdout against expected pattern", () => {
    const graded = gradeAgentOutput(
      "Command: `echo agent-spike`",
      "agent-spike",
      "echo agent-spike",
    );
    expect(graded.pass).toBe(true);
  });

  it("normalizes whitespace in commands", () => {
    expect(normalizeAgentCommand("echo   bench-ok")).toBe("echo bench-ok");
  });

  it("rejects path traversal in agent file commands", async () => {
    await expect(runAgentTask("cat ..")).rejects.toThrow(/invalid workspace path/);
  });

  it("extracts tool blocks in document order", () => {
    const markdown = [
      "Analysis",
      formatAgentToolBlock({
        command: "echo step-a",
        stdout: "step-a\n",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
      formatAgentToolBlock({
        command: "echo file-verified",
        stdout: "file-verified\n",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    ].join("");
    const blocks = extractAgentToolBlocks(markdown);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.command).toBe("echo step-a");
    expect(blocks[1]?.command).toBe("echo file-verified");
  });

  it("grades multi-step transcript in order", () => {
    const markdown = [
      formatAgentToolBlock({
        command: "echo step-a",
        stdout: "step-a\n",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
      formatAgentToolBlock({
        command: "echo file-verified",
        stdout: "file-verified\n",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
      "Command: `echo file-verified`",
    ].join("");
    const graded = gradeAgentTranscript(markdown, {
      expectedPattern: "file-verified",
      agentSteps: ["echo step-a", "echo file-verified"],
    });
    expect(graded.pass).toBe(true);
    expect(graded.toolBlocks).toHaveLength(2);
  });

  it("fails when an intermediate step is missing from transcript", () => {
    const markdown = formatAgentToolBlock({
      command: "echo file-verified",
      stdout: "file-verified\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    });
    const graded = gradeAgentTranscript(markdown, {
      expectedPattern: "file-verified",
      agentSteps: ["echo step-a", "echo file-verified"],
    });
    expect(graded.pass).toBe(false);
    expect(graded.detail).toMatch(/expected 2 tool blocks/);
  });

  it("fails when any tool round has non-zero exit", () => {
    const markdown = [
      formatAgentToolBlock({
        command: "echo bench-ok",
        stdout: "",
        stderr: "fail",
        exitCode: 1,
        durationMs: 1,
      }),
      "Command: `echo bench-ok`",
    ].join("");
    const graded = gradeAgentOutput(markdown, "bench-ok", "echo bench-ok");
    expect(graded.pass).toBe(false);
    expect(graded.detail).toMatch(/tool round 1/);
  });

  it("runs mock FS echo redirect and cat", async () => {
    resetAgentMockFs();
    const write = await runAgentTask("echo hello-v8 > greet.txt");
    expect(write.exitCode).toBe(0);
    const read = await runAgentTask("cat greet.txt");
    expect(read.exitCode).toBe(0);
    expect(read.stdout.trim()).toBe("hello-v8");
  });

  it("passes agent-03 transcript when chair omits tool blocks but footer is present", async () => {
    resetAgentMockFs();
    const { transcript } = await runDeterministicAgentSteps([
      "echo step-a",
      "echo file-verified",
    ]);
    const markdown = `${transcript}\n\nBoth commands succeeded.\n\nCommand: \`echo file-verified\``;
    const graded = gradeAgentTranscript(markdown, {
      expectedPattern: "file-verified",
      agentSteps: ["echo step-a", "echo file-verified"],
    });
    expect(graded.pass).toBe(true);
  });

  it("grades mock FS multi-step via deterministic steps", async () => {
    resetAgentMockFs();
    const { transcript } = await runDeterministicAgentSteps([
      "echo hello-v8 > greet.txt",
      "cat greet.txt",
    ]);
    const graded = gradeAgentTranscript(
      `${transcript}\n\nCommand: \`cat greet.txt\``,
      {
        expectedPattern: "hello-v8",
        agentSteps: ["echo hello-v8 > greet.txt", "cat greet.txt"],
      },
    );
    expect(graded.pass).toBe(true);
  });

  it("reads pre-seeded mock FS files", async () => {
    resetAgentMockFs({ "readme.txt": "wave-8-readme\n" });
    const read = await runAgentTask("cat readme.txt");
    expect(read.exitCode).toBe(0);
    expect(read.stdout.trim()).toBe("wave-8-readme");
  });

  it("rejects disallowed commands without real shell", async () => {
    const result = await runAgentTask("rm -rf /");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not allowed/i);
  });

  it("blocks unknown allowlisted commands when AGENT_REAL_SHELL is unset", async () => {
    const result = await runAgentTask("git log --oneline");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not allowed|AGENT_REAL_SHELL/);
  });
});
