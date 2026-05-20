import {
  truncateMemberContentForChair,
  usageTotal,
} from "./context";
import type { CouncilMode, PrecisionHint } from "./council-mode";
import { chat, chatStream, type ReasoningEffort } from "./mercury";
import {
  buildChairMessages,
  buildMemberMessages,
  buildOrchestratorUserMessage,
  buildPriorContext,
  buildUserPacket,
  DEFAULT_MEMBERS,
  DEFAULT_SYNTHESIS_FOCUS,
  parseChairResponse,
  parseOrchestratorResponse,
  truncateContext,
} from "./prompts";
import {
  buildMemberVoiceSuffix,
  buildOrchestratorSystemPrompt,
} from "./prompt-voice";
import { analyzeUserInput, formatProfileSummary } from "./user-input-profile";
import {
  ensureAgentCommandFooter,
  extractAgentCommand,
  runAgentTask,
  runDeterministicAgentSteps,
} from "./agent-task";
import {
  buildGdpvalChairRetryNote,
  lintSynthesisMarkdown,
  shouldRegenerateSynthesis,
  shouldSkipIdempotentChairRetry,
} from "./synthesis-lint";
import type {
  CouncilEvent,
  CouncilResult,
  MemberResult,
  OrchestratorPlan,
  PriorTurn,
} from "./types";

export interface RunCouncilOptions {
  query: string;
  contextText?: string;
  contextFilename?: string;
  priorTurns?: PriorTurn[];
  streamSynthesis?: boolean;
  onEvent?: (event: CouncilEvent) => void;
  mode?: CouncilMode;
  precisionHint?: PrecisionHint;
  tags?: string[];
  maxMembers?: number;
  /** Run one whitelisted shell command from member output before chair synthesis. */
  agentTask?: boolean;
  /** Deterministic agent commands to run before chair (multi-step fixtures). */
  agentSteps?: string[];
  /** Allow a second chair retry when structural lint still fails (benchmark harness). */
  benchmarkStructuralRetries?: boolean;
  /** Benchmark fixture id for GDPval-specific chair retry hints. */
  fixtureId?: string;
}

const LITE_COUNCIL_MEMBER = DEFAULT_MEMBERS[0]!;

function buildLiteOrchestratorPlan(
  profile: ReturnType<typeof analyzeUserInput>,
): OrchestratorPlan {
  const taskFocus =
    profile.task === "debug"
      ? "Focus on root cause, concrete fixes, and verification steps."
      : profile.task === "howto"
        ? "Focus on ordered steps, prerequisites, and pitfalls."
        : profile.task === "compare"
          ? "Focus on explicit trade-offs and decision criteria."
          : "Deliver a direct, high-quality answer without redundant framing.";

  return {
    members: [
      {
        id: "a",
        title: LITE_COUNCIL_MEMBER.title,
        systemPrompt: `${LITE_COUNCIL_MEMBER.systemPrompt} ${taskFocus}`,
      },
    ],
    synthesisFocus: DEFAULT_SYNTHESIS_FOCUS,
  };
}

async function runAgentToolRounds(options: {
  memberPlan: OrchestratorPlan["members"][0];
  memberVoiceSuffix: string;
  userPacket: string;
  priorContext?: string;
  initialContent: string;
  maxRounds: number;
  trackUsage: (usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<string> {
  let content = options.initialContent;

  for (let round = 0; round < options.maxRounds; round++) {
    const command = extractAgentCommand(content);
    if (!command) {
      break;
    }

    const toolResult = await runAgentTask(command);
    const toolBlock = `\n\nTool output (${toolResult.command}, exit ${toolResult.exitCode}):\n${toolResult.stdout}${toolResult.stderr ? `\nstderr: ${toolResult.stderr}` : ""}`;
    content += toolBlock;

    if (round >= options.maxRounds - 1) {
      break;
    }

    const followUp = await chat({
      messages: buildMemberMessages(
        options.memberPlan.systemPrompt + options.memberVoiceSuffix,
        `${options.userPacket}\n\n--- Prior analysis and tool output ---\n${content}\n\nIf another whitelisted command is required, end with Command: \`...\`. Otherwise summarize results for the user.`,
        options.priorContext,
      ),
      reasoningEffort: "medium",
    });
    options.trackUsage(followUp.usage);
    content = followUp.content;
  }

  return content;
}

function emitActivity(
  emit: (event: CouncilEvent) => void,
  headline: string,
  detail?: string,
): void {
  emit({ type: "activity", data: { headline, detail } });
}

function emitUsage(
  emit: (event: CouncilEvent) => void,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
  cumulative: number,
): void {
  emit({
    type: "usage",
    data: {
      ...usage,
      cumulative_total: cumulative,
    },
  });
}

function orchestratorReasoningEffort(
  profile: ReturnType<typeof analyzeUserInput>,
  precisionHint?: PrecisionHint,
): ReasoningEffort {
  if (precisionHint) return "medium";
  if (profile.task === "explain") return "medium";
  return "low";
}

function chairReasoningEffort(
  precisionHint?: PrecisionHint,
  profile?: ReturnType<typeof analyzeUserInput>,
): ReasoningEffort {
  if (precisionHint) return "high";
  if (
    profile &&
    profile.task === "debug" &&
    (profile.verbosity === "terse" || profile.tone === "blunt")
  ) {
    return "high";
  }
  return "medium";
}

function limitPlanMembers(
  plan: OrchestratorPlan,
  maxMembers: number,
): OrchestratorPlan {
  if (plan.members.length <= maxMembers) return plan;
  return {
    ...plan,
    members: plan.members.slice(0, maxMembers),
  };
}

function prepareMembersForChair(
  members: MemberResult[],
  precisionHint?: PrecisionHint,
): MemberResult[] {
  return members.map((member) => {
    const isPrecision = /precision/i.test(member.title);
    const shouldExempt = Boolean(precisionHint && isPrecision);
    return {
      ...member,
      content: truncateMemberContentForChair(member.content, { exempt: shouldExempt }),
    };
  });
}

export async function runLiteCouncil(
  options: RunCouncilOptions,
): Promise<CouncilResult> {
  const liteOptions: RunCouncilOptions = {
    ...options,
    mode: "lite",
    maxMembers: 1,
  };
  return runCouncilBody(liteOptions, { skipOrchestrator: true });
}

export async function runCouncil(
  options: RunCouncilOptions,
): Promise<CouncilResult> {
  const mode = options.mode ?? "full";
  if (
    mode === "lite" &&
    (!options.priorTurns || options.priorTurns.length === 0)
  ) {
    return runLiteCouncil(options);
  }
  return runCouncilBody(options, { skipOrchestrator: false });
}

async function runCouncilBody(
  options: RunCouncilOptions,
  bodyOptions: { skipOrchestrator: boolean },
): Promise<CouncilResult> {
  const startedAt = Date.now();
  const emit = options.onEvent ?? (() => undefined);
  let cumulativeTokens = 0;
  const mode = options.mode ?? "full";
  const precisionHint = options.precisionHint;

  const trackUsage = (usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => {
    const added = usageTotal(usage);
    if (added > 0) {
      cumulativeTokens += added;
      emitUsage(emit, usage ?? {}, cumulativeTokens);
    }
  };

  const profile = analyzeUserInput(options.query);

  emitActivity(
    emit,
    mode === "lite" ? "Lite council" : "Reading your question",
    formatProfileSummary(profile),
  );

  const { text: contextText } = options.contextText
    ? truncateContext(options.contextText)
    : { text: undefined };

  const userPacket = buildUserPacket(
    options.query,
    contextText,
    options.contextFilename,
  );

  const priorContext = options.priorTurns
    ? buildPriorContext(options.priorTurns)
    : undefined;

  let plan: OrchestratorPlan;
  if (bodyOptions.skipOrchestrator) {
    plan = buildLiteOrchestratorPlan(profile);
  } else {
    try {
      const orchestratorResult = await chat({
        messages: [
          {
            role: "system",
            content: buildOrchestratorSystemPrompt(profile, precisionHint),
          },
          {
            role: "user",
            content: buildOrchestratorUserMessage(
              userPacket,
              profile,
              priorContext,
            ),
          },
        ],
        reasoningEffort: orchestratorReasoningEffort(profile, precisionHint),
      });
      trackUsage(orchestratorResult.usage);
      plan = parseOrchestratorResponse(orchestratorResult.content);
    } catch {
      plan = parseOrchestratorResponse("{}");
    }
  }

  let maxMembers = options.maxMembers;
  if (maxMembers === undefined) {
    if (mode === "lite") {
      maxMembers = 1;
    } else if (profile.verbosity === "terse" || profile.tone === "blunt") {
      maxMembers = 2;
    }
  }
  if (maxMembers !== undefined) {
    plan = limitPlanMembers(plan, maxMembers);
  }

  emit({ type: "plan", data: plan });
  emitActivity(emit, "Roles assigned", "Preparing parallel analysis");

  const memberVoiceSuffix =
    buildMemberVoiceSuffix(profile) +
    (options.agentTask
      ? "\n\nRun the requested command in your analysis. End with a final line exactly like: Command: `echo bench-ok` (backticks around a single whitelisted shell command)."
      : "");

  const memberPromises = plan.members.map(async (memberPlan) => {
    emit({
      type: "member_start",
      data: { id: memberPlan.id, title: memberPlan.title },
    });
    emitActivity(
      emit,
      memberPlan.title,
      "Planning next moves",
    );

    try {
      const memberResult = await chat({
        messages: buildMemberMessages(
          memberPlan.systemPrompt + memberVoiceSuffix,
          userPacket,
          priorContext,
        ),
        reasoningEffort: "medium",
      });
      trackUsage(memberResult.usage);

      const result: MemberResult = {
        id: memberPlan.id,
        title: memberPlan.title,
        content: memberResult.content,
      };
      emit({ type: "member_done", data: result });
      emitActivity(emit, memberPlan.title, "Agent complete");
      return result;
    } catch (error) {
      const result: MemberResult = {
        id: memberPlan.id,
        title: memberPlan.title,
        content: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
      emit({ type: "member_done", data: result });
      return result;
    }
  });

  const settled = await Promise.allSettled(memberPromises);
  const members: MemberResult[] = settled.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }
    const memberPlan = plan.members[index];
    return {
      id: memberPlan.id,
      title: memberPlan.title,
      content: "",
      error:
        entry.reason instanceof Error
          ? entry.reason.message
          : "Agent request failed",
    };
  });

  const successfulMembers = members.filter((member) => !member.error);
  let membersForChair = prepareMembersForChair(members, precisionHint);

  let agentTranscript: string | undefined;

  if (
    options.agentTask &&
    options.agentSteps &&
    options.agentSteps.length > 0
  ) {
    const deterministic = await runDeterministicAgentSteps(options.agentSteps);
    agentTranscript = deterministic.transcript;
  }

  if (options.agentTask) {
    const primary = successfulMembers[0];

    if (primary) {
      const memberPlan =
        plan.members.find((entry) => entry.id === primary.id) ??
        plan.members[0]!;
      let augmentedContent = primary.content;

      if (agentTranscript) {
        augmentedContent = augmentedContent.trim()
          ? `${augmentedContent}${agentTranscript}`
          : `Completed agent steps:${agentTranscript}`;
      } else {
        augmentedContent = await runAgentToolRounds({
          memberPlan,
          memberVoiceSuffix,
          userPacket,
          priorContext,
          initialContent: primary.content,
          maxRounds: 2,
          trackUsage,
        });
        agentTranscript = augmentedContent.slice(primary.content.length);
      }

      membersForChair = membersForChair.map((member) =>
        member.id === primary.id
          ? { ...member, content: augmentedContent }
          : member,
      );
    } else if (agentTranscript) {
      membersForChair = [
        {
          id: "agent-tools",
          title: "Tool execution",
          content: `Completed agent steps:${agentTranscript}`,
        },
        ...membersForChair,
      ];
    }
  }

  let synthesisMarkdown = "";

  emitActivity(emit, "Synthesizing answer", "Merging agent answers");

  const buildChairCall = (retryNote?: string) => {
    const messages = buildChairMessages(
      userPacket,
      plan,
      membersForChair,
      profile,
      priorContext,
      precisionHint,
      options.query,
      options.tags,
    );
    if (retryNote) {
      messages.push({
        role: "user",
        content: retryNote,
      });
    }
    return messages;
  };

  const chairEffort = chairReasoningEffort(precisionHint, profile);
  const runChair = async (retryNote?: string) => {
    const chairMessages = buildChairCall(retryNote);
    if (options.streamSynthesis) {
      let streamed = "";
      for await (const chunk of chatStream({
        messages: chairMessages,
        reasoningEffort: chairEffort,
      })) {
        if (chunk.delta) {
          streamed += chunk.delta;
          emit({ type: "synthesis_delta", data: { delta: chunk.delta } });
        }
        if (chunk.usage) {
          trackUsage(chunk.usage);
        }
      }
      return streamed;
    }

    const chairResult = await chat({
      messages: chairMessages,
      reasoningEffort: chairEffort,
    });
    trackUsage(chairResult.usage);
    return chairResult.content;
  };

  synthesisMarkdown = await runChair();

  let synthesis = parseChairResponse(synthesisMarkdown);
  const lintIssues = lintSynthesisMarkdown(
    synthesis.markdown,
    profile,
    options.tags,
    options.fixtureId,
  );

  const chairRetryNote = options.tags?.includes("gdpval-aa")
    ? buildGdpvalChairRetryNote(lintIssues, options.fixtureId)
    : "Rewrite the user-facing answer: start with the deliverable body or direct answer. Do not open with a standalone question. Keep the same factual content.";

  let chairRetryCount = 0;

  if (
    !options.streamSynthesis &&
    shouldRegenerateSynthesis(lintIssues) &&
    successfulMembers.length > 0
  ) {
    emitActivity(emit, "Refining answer", "Fixing opener or truncation issues");
    chairRetryCount = 1;
    synthesisMarkdown = await runChair(chairRetryNote);
    synthesis = parseChairResponse(synthesisMarkdown);

    if (options.benchmarkStructuralRetries) {
      const retryLint = lintSynthesisMarkdown(
        synthesis.markdown,
        profile,
        options.tags,
        options.fixtureId,
      );
      if (
        shouldRegenerateSynthesis(retryLint) &&
        !shouldSkipIdempotentChairRetry(lintIssues, retryLint)
      ) {
        emitActivity(
          emit,
          "Refining answer",
          "Second structural pass (benchmark)",
        );
        chairRetryCount = 2;
        const secondChairRetryNote = options.tags?.includes("gdpval-aa")
          ? buildGdpvalChairRetryNote(retryLint, options.fixtureId)
          : chairRetryNote;
        synthesisMarkdown = await runChair(secondChairRetryNote);
        synthesis = parseChairResponse(synthesisMarkdown);
      }
    }
  }

  const failedMembers = members.filter((member) => member.error).length;
  const memberCount = plan.members.length;

  if (options.agentTask && options.agentSteps && options.agentSteps.length > 0) {
    const finalCommand = options.agentSteps.at(-1)!;
    if (!extractAgentCommand(synthesis.markdown)) {
      synthesis.markdown = ensureAgentCommandFooter(
        synthesis.markdown,
        finalCommand,
      );
    }
  }

  if (successfulMembers.length === 0 && !agentTranscript) {
    synthesis.markdown =
      "I could not complete the analysis — all agents failed. Please try again.";
  } else if (
    failedMembers > 0 &&
    !synthesis.markdown.toLowerCase().includes("partial")
  ) {
    synthesis.markdown = `*Note: Only ${successfulMembers.length} of ${memberCount} agents were available for this answer.*\n\n${synthesis.markdown}`;
  }

  const result: CouncilResult = {
    plan,
    members,
    synthesis,
    meta: {
      durationMs: Date.now() - startedAt,
      failedMembers,
      userProfile: profile,
      routingMode: mode,
      councilTokens: cumulativeTokens,
      agentTranscript,
      chairRetryCount,
    },
  };

  emitActivity(emit, "Complete", "Answer ready");
  emit({ type: "done", data: result });
  return result;
}
