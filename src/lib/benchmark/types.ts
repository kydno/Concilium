import type { CouncilMode } from "../council-mode";
import type { PriorTurn } from "../types";
import type { TokenUsage } from "../mercury";

export interface BenchmarkFixture {
  id: string;
  tags: string[];
  query: string;
  contextText?: string | null;
  contextFilename?: string;
  priorTurns?: PriorTurn[];
  /** Ordered whitelisted commands for multi-step agent fixtures. */
  agentSteps?: string[];
  /** Seed in-memory mock FS before agent grading (Wave 8). */
  agentMockFsSeed?: Record<string, string>;
}

export interface RubricScores {
  usefulness: number;
  structure: number;
  accuracy: number;
  voice: number;
  /** User-facing rubric (open harness). */
  actionability?: number;
  correctness?: number;
  brevity?: number;
}

export interface RubricResult {
  council: RubricScores;
  baseline: RubricScores;
  delta: RubricScores;
  judgeNotes: string;
  usage?: TokenUsage;
}

export interface StructuralCheck {
  pass: boolean;
  issues: string[];
}

export interface StageUsage {
  council: number;
  baseline: number;
  judge: number;
}

export interface RoutingStats {
  full: number;
  lite: number;
  single: number;
  councilTokensByMode: Record<CouncilMode, number>;
}

export interface FixtureResult {
  fixtureId: string;
  tags: string[];
  councilMarkdown: string;
  baselineMarkdown: string;
  councilDurationMs: number;
  baselineDurationMs: number;
  failedMembers: number;
  routingMode?: CouncilMode;
  usage: StageUsage;
  rubric?: RubricResult;
  structural: {
    council: StructuralCheck;
    baseline: StructuralCheck;
  };
  errors: string[];
  skipped?: string;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  fixtureCount: number;
  completedCount: number;
  skippedCount: number;
  totalTokens: number;
  tokenBudget: number;
  councilAvgRubric: RubricScores;
  baselineAvgRubric: RubricScores;
  councilWins: number;
  baselineWins: number;
  ties: number;
  councilWinRate: number;
  avgCouncilDurationMs: number;
  avgBaselineDurationMs: number;
  totalFailedMembers: number;
  topCouncilWins: Array<{ fixtureId: string; delta: number }>;
  topBaselineWins: Array<{ fixtureId: string; delta: number }>;
  routingStats?: RoutingStats;
  /** Fixtures where council path raised an API error (may include fallback). */
  councilApiFailures?: number;
  totalCouncilTokens?: number;
  totalBaselineTokens?: number;
  /** Council API tokens divided by baseline API tokens (open subset). */
  openCouncilOverBaseline?: number;
  /** @deprecated Misleading mix of council+baseline; use openCouncilOverBaseline. */
  tokenMultiplier?: number;
}

export const MAX_BENCHMARK_TOKENS = 9_500_000;
