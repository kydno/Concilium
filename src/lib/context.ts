import type { PriorTurn } from "./types";

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export const MAX_PRIOR_TURNS = 5;
export const PRIOR_ANSWER_MAX_CHARS = 2500;
export const PRIOR_CONTEXT_TOKEN_BUDGET = 8000;

export function getContextLimitTokens(): number {
  const fromEnv = process.env.CONTEXT_LIMIT_TOKENS;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 128_000;
}

/** Client-safe default when process.env is unavailable */
export const DEFAULT_CONTEXT_LIMIT_TOKENS = 128_000;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateStoredTurnTokens(turn: {
  query: string;
  result: { synthesis: { markdown: string } };
  contextExcerpt?: string;
}): number {
  let total = estimateTokens(turn.query);
  total += estimateTokens(turn.result.synthesis.markdown);
  if (turn.contextExcerpt) {
    total += estimateTokens(turn.contextExcerpt);
  }
  return total;
}

export function estimateConversationTokens(
  turns: Array<{
    query: string;
    result: { synthesis: { markdown: string } };
    contextExcerpt?: string;
  }>,
): number {
  return turns.reduce((sum, turn) => sum + estimateStoredTurnTokens(turn), 0);
}

function priorTurnTokenEstimate(turn: PriorTurn): number {
  let total = estimateTokens(turn.query);
  total += estimateTokens(turn.synthesisMarkdown.slice(0, PRIOR_ANSWER_MAX_CHARS));
  if (turn.contextExcerpt) {
    total += estimateTokens(turn.contextExcerpt);
  }
  return total;
}

export function selectPriorTurns(
  turns: Array<{
    query: string;
    result: { synthesis: { markdown: string } };
    contextFilename?: string;
    contextExcerpt?: string;
  }>,
  maxTurns = MAX_PRIOR_TURNS,
  tokenBudget = PRIOR_CONTEXT_TOKEN_BUDGET,
): PriorTurn[] {
  if (turns.length === 0) return [];

  const selected: PriorTurn[] = [];
  let usedTokens = 0;

  for (const turn of [...turns].reverse()) {
    if (selected.length >= maxTurns) break;

    const candidate: PriorTurn = {
      query: turn.query,
      synthesisMarkdown: turn.result.synthesis.markdown.slice(0, PRIOR_ANSWER_MAX_CHARS),
      contextFilename: turn.contextFilename,
      contextExcerpt: turn.contextExcerpt,
    };
    const turnTokens = priorTurnTokenEstimate(candidate);

    if (usedTokens + turnTokens > tokenBudget && selected.length > 0) break;

    selected.unshift(candidate);
    usedTokens += turnTokens;
  }

  return selected;
}

export function computeTurnInputTokens(options: {
  query: string;
  contextText?: string;
  priorTurns?: PriorTurn[];
}): number {
  let total = estimateTokens(options.query);
  if (options.contextText) {
    total += estimateTokens(options.contextText);
  }
  if (options.priorTurns) {
    for (const turn of options.priorTurns) {
      total += priorTurnTokenEstimate(turn);
    }
  }
  // Rough overhead for 5 pipeline calls (orchestrator + 3 members + chair)
  return total + 2000;
}

/** Max chars per member analysis passed to the chair (precision member exempt). */
export const CHAIR_MEMBER_MAX_CHARS = 4000;

export function truncateMemberContentForChair(
  content: string,
  options?: { exempt?: boolean; maxChars?: number },
): string {
  if (options?.exempt || !content) return content;
  const maxChars = options?.maxChars ?? CHAIR_MEMBER_MAX_CHARS;
  if (content.length <= maxChars) return content;
  return (
    content.slice(0, maxChars) +
    "\n\n[Member analysis truncated for synthesis token budget]"
  );
}

export function usageTotal(usage?: TokenUsage | null): number {
  if (!usage) return 0;
  return usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
}

export function formatContextLimitLabel(limit: number): string {
  return `${Math.round(limit / 1000)}k`;
}
