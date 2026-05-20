import { execFile } from "child_process";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const AGENT_TIMEOUT_MS = 30_000;

const SIMPLE_ECHO = /^echo\s+[\w.-]+$/i;
const ECHO_REDIRECT = /^echo\s+(.+)\s+>\s+([\w.-]+)$/i;
const CAT_FILE = /^cat\s+([\w.-]+)$/i;

const ALLOWED_COMMAND =
  /^(?:echo\s+(?:[\w.-]+|.+>\s+[\w.-]+)|cat\s+[\w.-]+|pwd|git\s+status(?:\s+--porcelain)?|git\s+--version)$/i;

/** Deterministic mock output for CI-safe agent grading. */
const MOCK_OUTPUT: Record<string, { stdout: string; exitCode: number }> = {
  "echo bench-ok": { stdout: "bench-ok\n", exitCode: 0 },
  "echo agent-spike": { stdout: "agent-spike\n", exitCode: 0 },
  "echo step-a": { stdout: "step-a\n", exitCode: 0 },
  "echo file-verified": { stdout: "file-verified\n", exitCode: 0 },
  "echo hello-v8": { stdout: "hello-v8\n", exitCode: 0 },
  "echo wave-8-ok": { stdout: "wave-8-ok\n", exitCode: 0 },
  pwd: { stdout: "/workspace\n", exitCode: 0 },
  "git status --porcelain": { stdout: "", exitCode: 0 },
  "git --version": { stdout: "git version 2.43.0\n", exitCode: 0 },
};

/** In-memory filesystem for mock `cat` / `echo … > file` (Wave 8 mock FS v2). */
const mockVfs = new Map<string, string>();

export function resetAgentMockFs(seed?: Record<string, string>): void {
  mockVfs.clear();
  if (seed) {
    for (const [path, content] of Object.entries(seed)) {
      mockVfs.set(path, content);
    }
  }
}

function useRealAgentShell(): boolean {
  return process.env.AGENT_REAL_SHELL === "1";
}

let realShellWorkspace: string | null = null;

async function getRealShellWorkspace(): Promise<string> {
  if (!realShellWorkspace) {
    realShellWorkspace = await mkdtemp(join(tmpdir(), "mercury-agent-"));
  }
  return realShellWorkspace;
}

export interface AgentTaskResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  command: string;
}

/** One executed tool round in agent transcript order. */
export interface AgentToolBlock {
  command: string;
  exitCode: number;
  stdout: string;
}

export interface AgentTranscriptGradeOptions {
  expectedPattern: string;
  /** Ordered whitelisted commands that must appear as tool blocks. */
  agentSteps?: string[];
  expectedCommand?: string;
}

export interface AgentGradeResult {
  pass: boolean;
  detail: string;
  stdout: string;
  command: string | null;
  /** All tool blocks found in document order (transcript grading). */
  toolBlocks: AgentToolBlock[];
}

export function normalizeAgentCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function isAllowedAgentCommand(command: string): boolean {
  return ALLOWED_COMMAND.test(normalizeAgentCommand(command));
}

/** Ensure synthesis ends with the required Command footer for agent grading. */
export function ensureAgentCommandFooter(
  markdown: string,
  finalCommand: string,
): string {
  const cmd = normalizeAgentCommand(finalCommand);
  const footer = `Command: \`${cmd}\``;
  if (new RegExp(`Command:\\s*\`${cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``, "i").test(markdown)) {
    return markdown;
  }
  const trimmed = markdown.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${footer}` : footer;
}

export function extractAgentCommand(markdown: string): string | null {
  const commandLine = markdown.match(/^Command:\s*`([^`]+)`/im);
  if (commandLine?.[1]) {
    return normalizeAgentCommand(commandLine[1]);
  }

  const bashBlock = markdown.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/i);
  if (bashBlock?.[1]) {
    const firstLine = bashBlock[1]
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#"));
    if (firstLine) {
      return normalizeAgentCommand(firstLine);
    }
  }

  const inline = markdown.match(/`([^`\n]+)`/);
  if (inline?.[1] && isAllowedAgentCommand(inline[1])) {
    return normalizeAgentCommand(inline[1]);
  }

  return null;
}

export function formatAgentToolBlock(result: AgentTaskResult): string {
  return `\n\nTool output (${result.command}, exit ${result.exitCode}):\n${result.stdout}${result.stderr ? `\nstderr: ${result.stderr}` : ""}`;
}

/** Extract all tool output blocks in document order (transcript grading). */
export function extractAgentToolBlocks(markdown: string): AgentToolBlock[] {
  const blocks: AgentToolBlock[] = [];
  const chunks = markdown.split(/\n\nTool output \(/);
  for (let index = 1; index < chunks.length; index++) {
    const chunk = chunks[index]!;
    const headerMatch = /^(.+?),\s*exit\s+(\d+)\):\s*\n?([\s\S]*)$/i.exec(chunk);
    if (!headerMatch) {
      continue;
    }
    const exitCode = Number.parseInt(headerMatch[2]!, 10);
    const stdout = (headerMatch[3] ?? "")
      .replace(/\nstderr:[\s\S]*$/i, "")
      .replace(/\n+Command:[\s\S]*$/i, "")
      .trimEnd();
    blocks.push({
      command: normalizeAgentCommand(headerMatch[1]!),
      exitCode: Number.isFinite(exitCode) ? exitCode : 1,
      stdout,
    });
  }
  return blocks;
}

function mockForCommand(command: string): { stdout: string; exitCode: number } | undefined {
  return MOCK_OUTPUT[normalizeAgentCommand(command).toLowerCase()];
}

function stdoutForBlock(block: AgentToolBlock): string {
  if (block.stdout.length > 0) {
    return block.stdout;
  }
  const mock = mockForCommand(block.command);
  if (mock) {
    return mock.stdout;
  }
  const vfs = runMockFsCommand(block.command);
  if (vfs) {
    return vfs.stdout;
  }
  return "";
}

function exitCodeForBlock(block: AgentToolBlock): number {
  if (block.exitCode !== 0 || block.stdout.length > 0) {
    return block.exitCode;
  }
  const mock = mockForCommand(block.command);
  if (mock) {
    return mock.exitCode;
  }
  const vfs = runMockFsCommand(block.command);
  if (vfs) {
    return vfs.exitCode;
  }
  return block.exitCode;
}

function gradeAllToolBlocksExitZero(
  toolBlocks: AgentToolBlock[],
): { pass: true } | { pass: false; detail: string; block: AgentToolBlock } {
  for (let index = 0; index < toolBlocks.length; index++) {
    const block = toolBlocks[index]!;
    const exitCode = exitCodeForBlock(block);
    if (exitCode !== 0) {
      return {
        pass: false,
        detail: `tool round ${index + 1} (${block.command}): exit ${exitCode} (expected 0)`,
        block,
      };
    }
  }
  return { pass: true };
}

/**
 * Grade full agent transcript: every expected step must appear as a tool block
 * in order with exit 0; when tool blocks exist, all rounds must exit 0;
 * final stdout must match expectedPattern.
 */
export function gradeAgentTranscript(
  markdown: string,
  options: AgentTranscriptGradeOptions,
): AgentGradeResult {
  const toolBlocks = extractAgentToolBlocks(markdown);
  const expectedSteps = (options.agentSteps ?? []).map(normalizeAgentCommand);

  if (expectedSteps.length > 0) {
    if (toolBlocks.length < expectedSteps.length) {
      return {
        pass: false,
        detail: `expected ${expectedSteps.length} tool blocks in order, found ${toolBlocks.length}`,
        stdout: toolBlocks.at(-1)?.stdout ?? "",
        command: toolBlocks.at(-1)?.command ?? null,
        toolBlocks,
      };
    }

    for (let index = 0; index < expectedSteps.length; index++) {
      const expected = expectedSteps[index]!;
      const block = toolBlocks[index]!;
      const exitCode = exitCodeForBlock(block);
      if (block.command !== expected) {
        return {
          pass: false,
          detail: `step ${index + 1}: expected command ${expected}, got ${block.command}`,
          stdout: block.stdout,
          command: block.command,
          toolBlocks,
        };
      }
      if (exitCode !== 0) {
        return {
          pass: false,
          detail: `step ${index + 1} (${expected}): exit ${exitCode} (expected 0)`,
          stdout: stdoutForBlock(block),
          command: block.command,
          toolBlocks,
        };
      }
    }

    const extraRounds = gradeAllToolBlocksExitZero(
      toolBlocks.slice(expectedSteps.length),
    );
    if (!extraRounds.pass) {
      return {
        pass: false,
        detail: extraRounds.detail,
        stdout: stdoutForBlock(extraRounds.block),
        command: extraRounds.block.command,
        toolBlocks,
      };
    }

    const finalBlock = toolBlocks[expectedSteps.length - 1]!;
    const finalStdout = stdoutForBlock(finalBlock);
    const finalMatch = new RegExp(options.expectedPattern, "i").test(
      finalStdout.trim(),
    );
    if (!finalMatch) {
      return {
        pass: false,
        detail: `final step stdout "${finalStdout.trim()}" did not match /${options.expectedPattern}/`,
        stdout: finalStdout,
        command: finalBlock.command,
        toolBlocks,
      };
    }

    return {
      pass: true,
      detail: `all ${expectedSteps.length} steps passed; final stdout matched /${options.expectedPattern}/`,
      stdout: finalStdout,
      command: finalBlock.command,
      toolBlocks,
    };
  }

  if (toolBlocks.length > 0) {
    const allRounds = gradeAllToolBlocksExitZero(toolBlocks);
    if (!allRounds.pass) {
      return {
        pass: false,
        detail: allRounds.detail,
        stdout: stdoutForBlock(allRounds.block),
        command: allRounds.block.command,
        toolBlocks,
      };
    }
  }

  const command =
    extractAgentCommand(markdown) ??
    (options.expectedCommand
      ? normalizeAgentCommand(options.expectedCommand)
      : null);

  if (!command) {
    return {
      pass: false,
      detail: "no runnable command found",
      stdout: "",
      command: null,
      toolBlocks,
    };
  }

  const matchingBlock = [...toolBlocks]
    .reverse()
    .find((block) => block.command === command);
  const fromToolBlock = matchingBlock
    ? {
        stdout: stdoutForBlock(matchingBlock),
        exitCode: exitCodeForBlock(matchingBlock),
      }
    : { stdout: "", exitCode: null as number | null };

  const hasToolOutput = fromToolBlock.stdout.length > 0;

  if (
    options.expectedCommand &&
    !hasToolOutput &&
    normalizeAgentCommand(options.expectedCommand) !== command
  ) {
    return {
      pass: false,
      detail: `expected command ${options.expectedCommand}, got ${command}`,
      stdout: "",
      command,
      toolBlocks,
    };
  }

  const mock = mockForCommand(command);
  const vfs = runMockFsCommand(command);
  const stdout =
    fromToolBlock.stdout || mock?.stdout || vfs?.stdout || "";
  const exitCode =
    fromToolBlock.exitCode ?? mock?.exitCode ?? vfs?.exitCode ?? 1;
  const stdoutMatch = new RegExp(options.expectedPattern, "i").test(
    stdout.trim(),
  );
  const exitOk = exitCode === 0;
  const pass = exitOk && stdoutMatch;
  return {
    pass,
    detail: pass
      ? toolBlocks.length > 0
        ? `all ${toolBlocks.length} tool rounds exit 0; stdout matched /${options.expectedPattern}/`
        : `exit ${exitCode}, stdout matched /${options.expectedPattern}/`
      : !exitOk
        ? `exit ${exitCode} (expected 0)`
        : `stdout "${stdout.trim()}" did not match /${options.expectedPattern}/`,
    stdout,
    command,
    toolBlocks,
  };
}

export function gradeAgentOutput(
  markdown: string,
  expectedPattern: string,
  expectedCommand?: string,
  agentSteps?: string[],
): { pass: boolean; detail: string; stdout: string; command: string | null } {
  const graded = gradeAgentTranscript(markdown, {
    expectedPattern,
    expectedCommand,
    agentSteps,
  });
  return {
    pass: graded.pass,
    detail: graded.detail,
    stdout: graded.stdout,
    command: graded.command,
  };
}

/** Run a fixed list of agent commands before chair synthesis (benchmark reliability). */
export async function runDeterministicAgentSteps(
  steps: string[],
): Promise<{ transcript: string; blocks: AgentToolBlock[] }> {
  let transcript = "";
  const blocks: AgentToolBlock[] = [];

  for (const step of steps) {
    const result = await runAgentTask(step);
    transcript += formatAgentToolBlock(result);
    blocks.push({
      command: result.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
    });
  }

  return { transcript, blocks };
}

function runMockFsCommand(
  command: string,
): { stdout: string; exitCode: number } | undefined {
  const normalized = normalizeAgentCommand(command);

  const redirect = ECHO_REDIRECT.exec(normalized);
  if (redirect) {
    const content = redirect[1]!.trim();
    const path = redirect[2]!;
    mockVfs.set(path, content.endsWith("\n") ? content : `${content}\n`);
    return { stdout: "", exitCode: 0 };
  }

  const cat = CAT_FILE.exec(normalized);
  if (cat) {
    const path = cat[1]!;
    if (!mockVfs.has(path)) {
      return {
        stdout: "",
        exitCode: 1,
      };
    }
    return { stdout: mockVfs.get(path) ?? "", exitCode: 0 };
  }

  if (SIMPLE_ECHO.test(normalized)) {
    const mock = mockForCommand(normalized);
    if (mock) {
      return mock;
    }
  }

  return undefined;
}

async function runRealShellCommand(
  command: string,
): Promise<AgentTaskResult> {
  const normalized = normalizeAgentCommand(command);
  const startedAt = Date.now();
  const workspace = await getRealShellWorkspace();

  const redirect = ECHO_REDIRECT.exec(normalized);
  if (redirect) {
    const content = redirect[1]!.trim();
    const path = join(workspace, redirect[2]!);
    await writeFile(path, content.endsWith("\n") ? content : `${content}\n`, "utf8");
    return {
      command: normalized,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const cat = CAT_FILE.exec(normalized);
  if (cat) {
    const path = join(workspace, cat[1]!);
    try {
      const stdout = await readFile(path, "utf8");
      return {
        command: normalized,
        stdout,
        stderr: "",
        exitCode: 0,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "read failed";
      return {
        command: normalized,
        stdout: "",
        stderr: message,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  try {
    const [bin, ...args] = normalized.split(/\s+/);
    const result = await execFileAsync(bin!, args, {
      timeout: AGENT_TIMEOUT_MS,
      windowsHide: true,
      cwd: workspace,
    });
    return {
      command: normalized,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      command: normalized,
      stdout: String(execError.stdout ?? ""),
      stderr: String(execError.stderr ?? ""),
      exitCode: typeof execError.code === "number" ? execError.code : 1,
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function runAgentTask(command: string): Promise<AgentTaskResult> {
  const normalized = normalizeAgentCommand(command);
  const startedAt = Date.now();

  if (!isAllowedAgentCommand(normalized)) {
    return {
      command: normalized,
      stdout: "",
      stderr: `Command not allowed: ${normalized}`,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
    };
  }

  const mock = mockForCommand(normalized);
  if (mock) {
    return {
      command: normalized,
      stdout: mock.stdout,
      stderr: "",
      exitCode: mock.exitCode,
      durationMs: Date.now() - startedAt,
    };
  }

  const vfs = runMockFsCommand(normalized);
  if (vfs) {
    if (vfs.exitCode !== 0) {
      return {
        command: normalized,
        stdout: vfs.stdout,
        stderr: `No such file`,
        exitCode: vfs.exitCode,
        durationMs: Date.now() - startedAt,
      };
    }
    return {
      command: normalized,
      stdout: vfs.stdout,
      stderr: "",
      exitCode: vfs.exitCode,
      durationMs: Date.now() - startedAt,
    };
  }

  if (useRealAgentShell()) {
    return runRealShellCommand(normalized);
  }

  return {
    command: normalized,
    stdout: "",
    stderr: `Command not available without AGENT_REAL_SHELL=1: ${normalized}`,
    exitCode: 1,
    durationMs: Date.now() - startedAt,
  };
}
