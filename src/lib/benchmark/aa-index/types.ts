import type { CouncilMode } from "../../council-mode";
import type { ConstraintRules } from "../../constraint-rules";
import type { BenchmarkFixture, FixtureResult } from "../types";

export type IfBenchRules = ConstraintRules;

export type AaEvalId =
  | "gdpval-aa"
  | "tau2-bench"
  | "terminal-bench"
  | "scicode"
  | "aa-lcr"
  | "aa-omniscience"
  | "ifbench"
  | "hle"
  | "gpqa-diamond"
  | "critpt";

export type AaCategory = "agents" | "coding" | "general" | "scientific";

export type AaGradingType =
  | "mcq"
  | "exact"
  | "numeric"
  | "regex"
  | "ifbench"
  | "rubric"
  | "checklist"
  | "agent";

export interface AaIndexFixture extends BenchmarkFixture {
  aaEval: AaEvalId;
  aaCategory: AaCategory;
  aaWeight: number;
  grading: AaGradingType;
  expectedAnswer?: string;
  choices?: string[];
  numericTolerance?: number;
  ifbenchRules?: IfBenchRules;
  checklistItems?: string[];
  /** Expected whitelisted command for agent-graded fixtures. */
  agentCommand?: string;
  /** Ordered steps for multi-step agent fixtures (deterministic before chair). */
  agentSteps?: string[];
  /** Seed mock in-memory FS before agent run (e.g. pre-existing readme.txt). */
  agentMockFsSeed?: Record<string, string>;
}

export interface AaGradeResult {
  score: number;
  pass: boolean;
  method: AaGradingType | "rubric-normalized";
  detail: string;
}

export interface AaFixtureResult extends FixtureResult {
  aaEval: AaEvalId;
  aaCategory: AaCategory;
  grading: AaGradingType;
  routingMode?: CouncilMode;
  routingReasons?: string[];
  councilGrade?: AaGradeResult;
  baselineGrade?: AaGradeResult;
  councilRubricNormalized?: number;
  baselineRubricNormalized?: number;
  scoreDelta?: number;
  /** Chair synthesis regeneration attempts after the initial call (0–2). */
  chairRetryCount?: number;
  /** Populated for `gdpval-ab` fixtures: alternate routing mode council score. */
  gdpvalAb?: Omit<GdpvalAbEntry, "fixtureId">;
}

export interface AaEvalScores {
  evalId: AaEvalId;
  category: AaCategory;
  weight: number;
  fixtureCount: number;
  councilScore: number;
  baselineScore: number;
}

export interface AaProxyIndex {
  council: number;
  baseline: number;
  byEval: AaEvalScores[];
  byCategory: Array<{
    category: AaCategory;
    council: number;
    baseline: number;
  }>;
}

export interface AaExtrapolation {
  mercuryPublishedIndex: number;
  proxyCouncil: number;
  proxyBaseline: number;
  estimatedCouncilIndex: number;
  estimatedCouncilIndexLow: number;
  estimatedCouncilIndexHigh: number;
  upliftRatio: number;
  verbosityMultiplier: number;
  estimatedCouncilOutputTokens: number;
  estimatedCouncilIndexCostUsd: number;
  mercuryPublishedOutputTokens: number;
  mercuryPublishedIndexCostUsd: number;
  synthesisLengthRatio: number;
  effectiveSynthesisTps: number;
  mercuryPublishedTps: number;
  categoryExtrapolations: Array<{
    category: AaCategory;
    estimatedCouncil: number;
  }>;
}

export interface AaRoutingStats {
  full: number;
  lite: number;
  single: number;
  councilTokensByMode: Record<CouncilMode, number>;
}

export interface FullCouncilLossEntry {
  fixtureId: string;
  aaEval: AaEvalId;
  councilScore: number;
  baselineScore: number;
  detail?: string;
}

export interface GdpvalLossEntry {
  fixtureId: string;
  councilScore: number;
  baselineScore: number;
  councilRubric?: number;
  baselineRubric?: number;
  detail?: string;
  /** Chair retry / regression hint for this fixture shape. */
  retryHint?: string;
}

/** Benchmark-only lite vs full routing comparison for `gdpval-ab` fixtures. */
export interface GdpvalAbEntry {
  fixtureId: string;
  productionMode: CouncilMode;
  productionScore: number;
  altMode: CouncilMode;
  altScore: number;
  /** altScore − productionScore (0–1 scale). */
  scoreDelta: number;
}

export interface ProductSlos {
  /** Share of completed fixtures where the council API path failed. */
  apiFailureRate: number;
  /** Share of agent-graded fixtures where council grading passed. */
  agentPassRate: number;
  /** Council wall-clock latency (routed product subset, excl. full-council-eval). */
  latencyMs: { p50: number; p95: number };
  /** Estimated Mercury API cost per council pass (report-only). */
  costPerPassUsd?: number;
  /** Open harness win rate when chained from a paired run (report-only). */
  openWinRate?: number;
}

export interface AaRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  fixtureCount: number;
  completedCount: number;
  totalTokens: number;
  totalCouncilTokens: number;
  totalBaselineTokens: number;
  /** Council API tokens / baseline API tokens (all AA fixtures). */
  aaTokenMultiplier?: number;
  /** Same ratio excluding `full-council-eval` lane (regression cost gate). */
  aaRoutedProductTokenMultiplier?: number;
  /** Same ratio for tagged full-council-eval fixtures only (reporting). */
  aaFullCouncilEvalTokenMultiplier?: number;
  tokenBudget: number;
  proxyIndex: AaProxyIndex;
  /** Proxy index using only fixtures that ran full or lite council (excludes routed single). */
  fullCouncilProxyIndex?: AaProxyIndex;
  /** Proxy index for fixtures tagged full-council-eval (multi-agent lane). */
  fullCouncilEvalProxyIndex?: AaProxyIndex;
  /** Proxy index for fixtures tagged hard-v8 (Wave 8 harder slice, report-only). */
  hardSliceProxyIndex?: AaProxyIndex;
  /** Full-council fixtures where council scored below baseline. */
  fullCouncilLossDigest?: FullCouncilLossEntry[];
  /** GDPval-AA fixtures where council scored below baseline. */
  gdpvalLossDigest?: GdpvalLossEntry[];
  /** Lite vs full council scores for tagged `gdpval-ab` fixtures (report only). */
  gdpvalAbReport?: GdpvalAbEntry[];
  productSlos?: ProductSlos;
  extrapolation: AaExtrapolation;
  routingStats?: AaRoutingStats;
}

export const AA_EVAL_WEIGHTS: Record<AaEvalId, { weight: number; category: AaCategory }> = {
  "gdpval-aa": { weight: 0.167, category: "agents" },
  "tau2-bench": { weight: 0.083, category: "agents" },
  "terminal-bench": { weight: 0.167, category: "coding" },
  scicode: { weight: 0.083, category: "coding" },
  "aa-lcr": { weight: 0.0625, category: "general" },
  "aa-omniscience": { weight: 0.125, category: "general" },
  ifbench: { weight: 0.0625, category: "general" },
  hle: { weight: 0.125, category: "scientific" },
  "gpqa-diamond": { weight: 0.0625, category: "scientific" },
  critpt: { weight: 0.0625, category: "scientific" },
};

export const MERCURY_PUBLISHED_INDEX = 33;
export const MERCURY_PUBLISHED_OUTPUT_TOKENS = 70_000_000;
export const MERCURY_PUBLISHED_INDEX_COST_USD = 80.68;
export const MERCURY_PUBLISHED_TPS = 746;
