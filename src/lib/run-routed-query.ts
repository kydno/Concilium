import {
  detectCouncilMode,
  type CouncilMode,
  type PrecisionHint,
} from "./council-mode";
import type { ConstraintRules } from "./constraint-rules";
import {
  ensureAgentCommandFooter,
  extractAgentCommand,
  runDeterministicAgentSteps,
} from "./agent-task";
import { runCouncil, type RunCouncilOptions } from "./council";
import { runMercuryAnswer } from "./mercury-answer";
import { DEFAULT_SYNTHESIS_FOCUS } from "./prompts";
import { analyzeUserInput } from "./user-input-profile";
import { looksTruncated } from "./answer-quality";
import { lintSynthesisMarkdown, logSynthesisLintIssues } from "./synthesis-lint";
import type { CouncilResult } from "./types";

export interface RunRoutedQueryOptions extends RunCouncilOptions {
  tags?: string[];
  grading?: string;
  forceMode?: CouncilMode;
  constraintRules?: ConstraintRules;
  checklistItems?: string[];
  benchmarkStructuralRetries?: boolean;
}

export type RoutedQueryResult = CouncilResult;

function singleShotCouncilResult(
  markdown: string,
  durationMs: number,
  profile: CouncilResult["meta"]["userProfile"],
): CouncilResult {
  return {
    plan: {
      members: [
        {
          id: "direct",
          title: "Direct answer",
          systemPrompt: "Single-pass Mercury 2 response (routed).",
        },
      ],
      synthesisFocus: DEFAULT_SYNTHESIS_FOCUS,
    },
    members: [],
    synthesis: {
      markdown,
      consensus: [],
      conflicts: [],
    },
    meta: {
      durationMs,
      failedMembers: 0,
      userProfile: profile,
    },
  };
}

export function resolveRouting(
  query: string,
  options?: Pick<
    RunRoutedQueryOptions,
    "tags" | "grading" | "forceMode" | "priorTurns" | "constraintRules"
  >,
) {
  return detectCouncilMode(query, {
    tags: options?.tags,
    grading: options?.grading,
    priorTurnCount: options?.priorTurns?.length ?? 0,
    forceMode: options?.forceMode,
    constraintRules: options?.constraintRules,
  });
}

function maybeLogSynthesisLint(
  markdown: string,
  query: string,
  routingMode: CouncilMode,
  tags?: string[],
): void {
  if (process.env.SYNTHESIS_LINT === "0") {
    return;
  }
  const profile = analyzeUserInput(query);
  const issues = lintSynthesisMarkdown(markdown, profile, tags);
  logSynthesisLintIssues(issues, { query, routingMode });
}

export async function runRoutedQuery(
  options: RunRoutedQueryOptions,
): Promise<RoutedQueryResult> {
  const routing = resolveRouting(options.query, options);
  const emit = options.onEvent;

  emit?.({
    type: "mode",
    data: {
      mode: routing.mode,
      reasons: routing.reasons,
      precisionHint: routing.precisionHint,
    },
  });

  if (routing.mode === "single") {
    emit?.({
      type: "activity",
      data: {
        headline: "Direct answer",
        detail: "Routed to single-pass Mercury 2 for precision",
      },
    });

    const direct = await runMercuryAnswer({
      query: options.query,
      contextText: options.contextText,
      contextFilename: options.contextFilename,
      priorTurns: options.priorTurns,
      precisionHint: routing.precisionHint,
      constraintRules:
        routing.constraintRules ?? options.constraintRules,
      checklistItems: options.checklistItems,
    });

    const profile = analyzeUserInput(options.query);
    const result = singleShotCouncilResult(
      direct.markdown,
      direct.durationMs,
      profile,
    );

    emit?.({
      type: "usage",
      data: {
        total_tokens: direct.tokens,
        cumulative_total: direct.tokens,
      },
    });

    const routed: RoutedQueryResult = {
      ...result,
      meta: {
        ...result.meta,
        routingMode: "single",
        routingReasons: routing.reasons,
        precisionHint: routing.precisionHint,
        councilTokens: direct.tokens,
      },
    };

    maybeLogSynthesisLint(
      routed.synthesis.markdown,
      options.query,
      "single",
      options.tags,
    );

    emit?.({ type: "done", data: routed });
    return routed;
  }

  const wrapEmit = options.onEvent
    ? (event: import("./types").CouncilEvent) => {
        if (event.type === "done") {
          options.onEvent?.({
            type: "done",
            data: {
              ...event.data,
              meta: {
                ...event.data.meta,
                routingMode: routing.mode,
                routingReasons: routing.reasons,
                precisionHint: routing.precisionHint,
              },
            },
          });
          return;
        }
        options.onEvent?.(event);
      }
    : undefined;

  let councilResult: CouncilResult;
  let routingFallback = false;

  try {
    councilResult = await runCouncil({
      ...options,
      onEvent: wrapEmit,
      mode: routing.mode,
      precisionHint: routing.precisionHint,
      tags: options.tags,
      agentTask: options.agentTask ?? routing.agentTask,
      agentSteps: options.agentSteps,
      benchmarkStructuralRetries: options.benchmarkStructuralRetries,
    });

    if (looksTruncated(councilResult.synthesis.markdown)) {
      throw new Error("Council synthesis truncated");
    }
  } catch {
    const direct = await runMercuryAnswer({
      query: options.query,
      contextText: options.contextText,
      contextFilename: options.contextFilename,
      priorTurns: options.priorTurns,
      precisionHint: routing.precisionHint,
      constraintRules:
        routing.constraintRules ?? options.constraintRules,
      checklistItems: options.checklistItems,
      reasoningEffort: "high",
    });

    let markdown = direct.markdown;
    let agentTranscript: string | undefined;

    if (options.agentSteps && options.agentSteps.length > 0) {
      const deterministic = await runDeterministicAgentSteps(
        options.agentSteps,
      );
      agentTranscript = deterministic.transcript;
      markdown = markdown.trim()
        ? `${agentTranscript}\n\n${markdown}`
        : agentTranscript.trim();
      const finalCommand = options.agentSteps.at(-1)!;
      if (!extractAgentCommand(markdown)) {
        markdown = ensureAgentCommandFooter(markdown, finalCommand);
      }
    }

    const profile = analyzeUserInput(options.query);
    councilResult = singleShotCouncilResult(
      markdown,
      direct.durationMs,
      profile,
    );
    councilResult.meta.councilTokens = direct.tokens;
    councilResult.meta.agentTranscript = agentTranscript;
    routingFallback = true;
  }

  const routedResult: RoutedQueryResult = {
    ...councilResult,
    meta: {
      ...councilResult.meta,
      routingMode: routing.mode,
      routingReasons: routing.reasons,
      precisionHint: routing.precisionHint,
      councilTokens:
        councilResult.meta.councilTokens ?? undefined,
      routingFallback,
    },
  };

  maybeLogSynthesisLint(
    routedResult.synthesis.markdown,
    options.query,
    routing.mode,
    options.tags,
  );

  return routedResult;
}
