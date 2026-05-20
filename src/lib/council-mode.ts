import { analyzeUserInput, type UserInputProfile } from "./user-input-profile";
import {
  inferConstraintsFromQuery,
  queryLooksConstrained,
  type ConstraintRules,
} from "./constraint-rules";

export type CouncilMode = "full" | "single" | "lite";

export type PrecisionHint =
  | "mcq"
  | "exact"
  | "terminal"
  | "numeric"
  | "command"
  | "constrained"
  | "code";

const CODE_QUERY_PATTERNS = [
  /\bdef\s+\w+/i,
  /\bfunction\s+\w+/i,
  /\bpython\b/i,
  /\bimplement\s+`/i,
  /\bwrite a python\b/i,
  /\binclude\s+`def\b/i,
  /\bone-liner\b/i,
];

const MCQ_PATTERNS = [
  /\bwhich of the following\b/i,
  /\bchoose the correct\b/i,
  /\bselect the (?:correct )?answer\b/i,
  /\b(?:^|\n)\s*[A-D][).:]\s/m,
  /\boptions?:\s*(?:\n)?\s*[A-D]/i,
];

const EXACT_FACT_PATTERNS = [
  /\bwhat is the capital of\b/i,
  /\bwhat year (?:was|did)\b/i,
  /\bwho (?:wrote|invented|discovered)\b/i,
  /\bhow many (?:protons|electrons|states)\b/i,
  /\bin what year\b/i,
  /\bwhat is the chemical symbol for\b/i,
  /\bwhat planet is known as\b/i,
  /\bwhat gas do plants absorb\b/i,
  /\bwho wrote the novel\b/i,
  /\bspeed of light in vacuum\b/i,
  /\bwhat is the (?:symbol|formula) for\b/i,
];

const TERMINAL_PATTERNS = [
  /\bwhat command\b/i,
  /\bwhich command\b/i,
  /\bnext command\b/i,
  /\brun (?:this|the following) command\b/i,
  /\bgiven (?:this|the following) (?:terminal|shell|bash) output\b/i,
  /\bterminal output\b/i,
  /\bgit (?:checkout|reset|revert|stash)\b/i,
];

const DELIVERABLE_PATTERNS = [
  /\bwrite (?:a |an )?(?:email|template|sop|checklist|agenda|outline)\b/i,
  /\bdraft (?:a |an )?(?:email|memo|policy)\b/i,
  /\bcreate (?:a |an )?(?:template|procedure|runbook)\b/i,
];

const INFRA_DEBUG_PATTERNS = [
  /\bnginx\b/i,
  /\bwebsocket\b/i,
  /\breverse[- ]?proxy\b/i,
  /\bproxy_read_timeout\b/i,
];

/** Open compare prompts at or above this length route to full council. */
export const LONG_COMPARE_CHAR_THRESHOLD = 400;

/** Objective graders that map to single-shot with a precision footer (not ifbench). */
const OBJECTIVE_GRADING = new Set([
  "mcq",
  "exact",
  "numeric",
  "regex",
  "checklist",
]);

export interface CouncilModeDetection {
  mode: CouncilMode;
  precisionHint?: PrecisionHint;
  constraintRules?: ConstraintRules;
  reasons: string[];
  agentTask?: boolean;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function queryLooksLikeCodeTask(query: string, tags?: string[]): boolean {
  if (tags?.includes("scicode") || tags?.includes("coding")) {
    return true;
  }
  return matchesAny(query, CODE_QUERY_PATTERNS);
}

function detectPrecisionHint(
  query: string,
  grading?: string,
  tags?: string[],
): PrecisionHint | undefined {
  if (grading === "mcq") return "mcq";
  if (grading === "exact") return "exact";
  if (grading === "numeric") return "numeric";
  if (grading === "checklist") return "terminal";
  if (grading === "regex") {
    if (matchesAny(query, TERMINAL_PATTERNS)) {
      return "terminal";
    }
    if (queryLooksLikeCodeTask(query, tags)) {
      return "code";
    }
    return "terminal";
  }

  if (matchesAny(query, MCQ_PATTERNS)) return "mcq";
  if (matchesAny(query, TERMINAL_PATTERNS)) return "terminal";
  if (matchesAny(query, EXACT_FACT_PATTERNS)) return "exact";

  return undefined;
}

function isActionableDebugQuery(query: string): boolean {
  return /\b(tldr|tl;dr|fix|steps|how\s+to\s+fix)\b/i.test(query);
}

const COMPARE_INTENT_PATTERNS = [
  /\bcompare\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\bdifference between\b/i,
  /\bpros and cons\b/i,
  /\bwhich one\b/i,
  /\bwhich would you pick\b/i,
  /\bor should i\b/i,
];

function queryLooksLikeCompare(query: string): boolean {
  return matchesAny(query, COMPARE_INTENT_PATTERNS);
}

function isShortFactualAsk(
  query: string,
  profile: UserInputProfile,
): boolean {
  if (profile.task === "howto" || profile.task === "debug") {
    return false;
  }
  const trimmed = query.trim();
  const wordCount = trimmed.split(/\s+/).length;
  return wordCount <= 18 && trimmed.endsWith("?");
}

export function detectCouncilMode(
  query: string,
  options?: {
    tags?: string[];
    grading?: string;
    priorTurnCount?: number;
    forceMode?: CouncilMode;
    constraintRules?: ConstraintRules;
  },
): CouncilModeDetection {
  if (options?.forceMode) {
    return { mode: options.forceMode, reasons: ["forced"] };
  }

  const tags = options?.tags ?? [];
  if (tags.includes("full-council-eval")) {
    return { mode: "full", reasons: ["tag:full-council-eval"] };
  }

  const profile = analyzeUserInput(query);
  const reasons: string[] = [];

  if (options?.grading === "agent") {
    reasons.push("grading:agent");
    return { mode: "lite", reasons, agentTask: true };
  }

  if (options?.grading === "ifbench" || options?.constraintRules) {
    const rules =
      options.constraintRules ??
      inferConstraintsFromQuery(query) ??
      {};
    reasons.push("grading:ifbench");
    return {
      mode: "single",
      precisionHint: "constrained",
      constraintRules: rules,
      reasons,
    };
  }

  if (queryLooksConstrained(query)) {
    const inferred = inferConstraintsFromQuery(query);
    if (inferred) {
      reasons.push("query:constrained");
      return {
        mode: "single",
        precisionHint: "constrained",
        constraintRules: inferred,
        reasons,
      };
    }
  }

  const precisionHint = detectPrecisionHint(query, options?.grading, tags);

  if (precisionHint) {
    reasons.push(`precision:${precisionHint}`);
    return { mode: "single", precisionHint, reasons };
  }

  if (options?.grading && OBJECTIVE_GRADING.has(options.grading)) {
    reasons.push(`grading:${options.grading}`);
    const gradingHint =
      options.grading === "numeric"
        ? "numeric"
        : options.grading === "regex" && queryLooksLikeCodeTask(query, tags)
          ? "code"
          : options.grading === "regex"
            ? "terminal"
            : "exact";
    return {
      mode: "single",
      precisionHint: gradingHint,
      reasons,
    };
  }

  const fullTasks: UserInputProfile["task"][] = ["brainstorm", "review"];

  if (queryLooksLikeCompare(query)) {
    if (query.length >= LONG_COMPARE_CHAR_THRESHOLD) {
      reasons.push("compare:long-full");
      return { mode: "full", reasons };
    }
    reasons.push("compare:lite");
    return { mode: "lite", reasons };
  }

  if (
    profile.task === "howto" &&
    profile.verbosity === "terse" &&
    /\bsteps\b/i.test(query) &&
    query.length < 250 &&
    !matchesAny(query, DELIVERABLE_PATTERNS)
  ) {
    reasons.push("howto:terse-procedural");
    return { mode: "single", reasons };
  }

  if (fullTasks.includes(profile.task)) {
    reasons.push(`task:${profile.task}`);
    return { mode: "full", reasons };
  }

  if ((options?.priorTurnCount ?? 0) > 0) {
    reasons.push("multiturn");
    return { mode: "full", reasons };
  }

  if (tags.includes("gdpval-aa") && query.length < 400) {
    reasons.push("gdpval:short-lite");
    return { mode: "lite", reasons };
  }

  if (
    matchesAny(query, DELIVERABLE_PATTERNS) ||
    (tags.includes("gdpval-aa") && query.length >= 400)
  ) {
    reasons.push("deliverable");
    return { mode: "full", reasons };
  }

  if (
    matchesAny(query, INFRA_DEBUG_PATTERNS) &&
    (profile.task === "debug" ||
      profile.tone === "casual" ||
      /\b(any ideas|keeps disconnecting|not working)\b/i.test(query))
  ) {
    reasons.push("debug:casual-infra");
    return { mode: "lite", reasons };
  }

  if (
    profile.task === "debug" &&
    (profile.tone === "blunt" || profile.verbosity === "terse") &&
    isActionableDebugQuery(query)
  ) {
    reasons.push("debug:terse-actionable");
    return { mode: "lite", reasons };
  }

  if (query.length > 1200 || tags.includes("aa-lcr")) {
    reasons.push("long-context");
    return { mode: "full", reasons };
  }

  if (
    (profile.task === "debug" || profile.task === "howto") &&
    profile.tone !== "blunt" &&
    !isShortFactualAsk(query, profile)
  ) {
    reasons.push(`lite:${profile.task}`);
    return { mode: "lite", reasons };
  }

  if (
    profile.verbosity === "terse" &&
    isShortFactualAsk(query, profile) &&
    !matchesAny(query, INFRA_DEBUG_PATTERNS)
  ) {
    reasons.push("terse-short-factual");
    return { mode: "single", precisionHint: "exact", reasons };
  }

  if (profile.task === "explain" && query.length > 400) {
    reasons.push("explain-deep");
    return { mode: "full", reasons };
  }

  if (
    /\b(outline|procedure|migrate|migrating|how do i|how to)\b/i.test(query) &&
    query.length < 800
  ) {
    reasons.push("procedural:lite");
    return { mode: "lite", reasons };
  }

  reasons.push("default-full");
  return { mode: "full", reasons };
}

export function isScientificOrPrecisionQuery(
  query: string,
  precisionHint?: PrecisionHint,
): boolean {
  if (
    precisionHint &&
    precisionHint !== "constrained" &&
    precisionHint !== "code"
  ) {
    return true;
  }
  return /\b(gpqa|quantum|thermodynamic|molar|wavelength|isotope|oxidation)\b/i.test(
    query,
  );
}
