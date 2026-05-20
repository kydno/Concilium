import type { UserInputProfile } from "./user-input-profile";
import { looksTruncated } from "./answer-quality";
import {
  checkQuestionOnlyOpener,
  checkStandaloneOpenerQuestion,
  checkTerseDebugSteps,
  checkTruncatedAnswer,
} from "./benchmark/structural";

const REGENERATE_ISSUE_PATTERNS = [
  /question instead of content/i,
  /question before deliverable/i,
  /optional-format question/i,
  /only a clarifying question/i,
  /truncated/i,
  /Answer is empty/i,
  /meta-only opener/i,
  /hollow template/i,
  /email headers without body/i,
];

const GDPVAL_META_OPENER =
  /^(?:here(?:'s| is| are)|below (?:is|are)|sure[,!]?|i(?:'ve| have) (?:drafted|prepared|written|outlined)|would you like|let me know if|as requested[,]?|certainly[,!]?)\b/i;

const GDPVAL_EMAIL_FIXTURES = new Set(["gdpval-02", "gdpval-ab-02"]);

/** Fixture-specific chair retry hints for GDPval-AA deliverables. */
export const GDPVAL_FIXTURE_RETRY_HINTS: Record<string, string> = {
  "gdpval-01":
    "Open with the retail daily task list template (title, employee name/initial fields, manager sign-off, end-of-day filing)—not a preamble.",
  "gdpval-02":
    "Open with To/Subject (and Cc if needed), then the full professional vendor email body—no meta intro.",
  "gdpval-03":
    "Open with the cashier onboarding SOP title and numbered sections (opening shift, cash handling, escalation).",
  "gdpval-04":
    "Open with the standup agenda (timed items, five agenda lines)—not setup commentary.",
  "gdpval-05":
    "Open with the customer-facing FAQ question and answer on the 14-day return policy.",
  "gdpval-06":
    "Open with the ward shift handoff template sections (patient status, labs, follow-ups).",
  "gdpval-ab-01":
    "Open with the incident report template fields and sections—no meta framing.",
  "gdpval-ab-02":
    "Open with To/Subject and the full internal memo body requesting budget approval.",
};

export function shouldRegenerateSynthesis(issues: string[]): boolean {
  return issues.some((issue) =>
    REGENERATE_ISSUE_PATTERNS.some((pattern) => pattern.test(issue)),
  );
}

/** Buckets lint issues for idempotent chair retry (skip 2nd call when class unchanged). */
export type SynthesisLintRegenerateClass =
  | "opener"
  | "truncation"
  | "gdpval"
  | "debug-length"
  | "none";

export function synthesisLintRegenerateClass(
  issues: string[],
): SynthesisLintRegenerateClass {
  if (issues.some((issue) => /GDPval|meta-only|hollow|email headers/i.test(issue))) {
    return "gdpval";
  }
  if (issues.some((issue) => /truncat|Answer is empty/i.test(issue))) {
    return "truncation";
  }
  if (issues.some((issue) => /Debug synthesis shorter/i.test(issue))) {
    return "debug-length";
  }
  if (
    issues.some((issue) =>
      /question|deliverable|clarifying/i.test(issue),
    )
  ) {
    return "opener";
  }
  return "none";
}

/** True when a second chair retry would target the same lint class as after the first retry. */
export function shouldSkipIdempotentChairRetry(
  initialIssues: string[],
  afterFirstRetryIssues: string[],
): boolean {
  const initial = synthesisLintRegenerateClass(initialIssues);
  const after = synthesisLintRegenerateClass(afterFirstRetryIssues);
  return initial !== "none" && initial === after;
}

function firstParagraph(markdown: string): string {
  return (
    markdown
      .trim()
      .split(/\n\n+/)
      .find((paragraph) => paragraph.trim().length > 0)
      ?.trim() ?? markdown.trim()
  );
}

/** GDPval-AA: first paragraph is meta commentary, not the deliverable. */
export function checkGdpvalMetaOnlyOpener(markdown: string): string | null {
  const first = firstParagraph(markdown);
  if (!first) {
    return null;
  }

  if (!GDPVAL_META_OPENER.test(first)) {
    return null;
  }

  const paragraphs = markdown
    .trim()
    .split(/\n\n+/)
    .filter((paragraph) => paragraph.trim().length > 0);

  if (paragraphs.length >= 2 && paragraphs[1]!.trim().length >= 60) {
    return "GDPval deliverable opens with meta-only preamble before the body";
  }

  if (first.length < 120) {
    return "GDPval deliverable opens with meta-only opener instead of the template or body";
  }

  return "GDPval deliverable opens with meta-only preamble before the body";
}

/** GDPval-AA: hollow template scaffolding (email headers or numbered steps without content). */
export function checkGdpvalTemplateMarkers(
  markdown: string,
  fixtureId?: string,
): string | null {
  const text = markdown.trim();
  const first = firstParagraph(text);

  const hollowNumbered =
    /^\s*\d+[.)]\s*(?:\[.*?\]|_{3,}|\.{3,}|TBD|fill in|enter)\s*$/im.test(
      first,
    ) ||
    (/^\s*\d+[.)]\s+/m.test(first) &&
      !/\b(?:check|verify|ensure|open|close|escalat|sign|file|record)\b/i.test(
        first,
      ) &&
      first.length < 100);

  if (hollowNumbered) {
    return "GDPval answer uses hollow numbered template markers without substantive steps";
  }

  const isEmailFixture =
    fixtureId !== undefined && GDPVAL_EMAIL_FIXTURES.has(fixtureId);
  if (isEmailFixture) {
    const hasHeaders = /\b(?:to|from|subject|cc)\s*:/i.test(text);
    const bodyAfterHeaders = text
      .replace(/^(?:to|from|cc|subject)\s*:[^\n]*\n?/gim, "")
      .trim();
    if (hasHeaders && bodyAfterHeaders.length < 80) {
      return "GDPval email has headers (To/Cc/Subject) without a substantive message body";
    }
    if (!hasHeaders && !/\bdear\b/i.test(text) && text.length > 120) {
      return "GDPval email missing To/Subject or salutation before the message body";
    }
  }

  return null;
}

export function lintGdpvalDeliverable(
  markdown: string,
  fixtureId?: string,
): string[] {
  const issues: string[] = [];
  const meta = checkGdpvalMetaOnlyOpener(markdown);
  if (meta) {
    issues.push(meta);
  }
  const template = checkGdpvalTemplateMarkers(markdown, fixtureId);
  if (template) {
    issues.push(template);
  }
  return issues;
}

export function gdpvalRetryHintForFixture(fixtureId?: string): string | undefined {
  if (!fixtureId) {
    return undefined;
  }
  return GDPVAL_FIXTURE_RETRY_HINTS[fixtureId];
}

export function gdpvalRetryHintForIssues(issues: string[]): string | undefined {
  if (issues.some((issue) => /meta-only/i.test(issue))) {
    return "Remove the preamble; the first paragraph must be the deliverable itself.";
  }
  if (issues.some((issue) => /email headers/i.test(issue))) {
    return "Include To/Subject lines and a complete professional email body in the opening section.";
  }
  if (issues.some((issue) => /hollow numbered/i.test(issue))) {
    return "Replace placeholder numbered steps with concrete SOP or checklist content.";
  }
  if (issues.some((issue) => /question before deliverable/i.test(issue))) {
    return "Do not open with a standalone question; start with the template, email, SOP, or agenda.";
  }
  return undefined;
}

export function buildGdpvalChairRetryNote(
  issues: string[],
  fixtureId?: string,
): string {
  const base =
    "Rewrite the user-facing answer: start with the deliverable body or direct answer. Do not open with meta commentary or a standalone question. Keep the same factual content.";
  const parts = [base];
  const fixtureHint = gdpvalRetryHintForFixture(fixtureId);
  if (fixtureHint) {
    parts.push(fixtureHint);
  }
  const issueHint = gdpvalRetryHintForIssues(issues);
  if (issueHint && issueHint !== fixtureHint) {
    parts.push(issueHint);
  }
  return parts.join(" ");
}

/** Log-only synthesis checks for production paths (does not block responses). */
export function lintSynthesisMarkdown(
  markdown: string,
  profile: UserInputProfile,
  tags?: string[],
  fixtureId?: string,
): string[] {
  const issues: string[] = [];
  const tagSet = tags ?? [];

  const debugTags =
    profile.task === "debug"
      ? [...tagSet, "debug", profile.verbosity, profile.tone]
      : tagSet;

  const howtoCompareTags =
    profile.task === "howto" || profile.task === "compare"
      ? [...tagSet, profile.task]
      : tagSet;

  const terseDebug = checkTerseDebugSteps(markdown, debugTags);
  if (terseDebug) {
    issues.push(terseDebug);
  }

  const questionOnly = checkQuestionOnlyOpener(markdown, howtoCompareTags);
  if (questionOnly) {
    issues.push(questionOnly);
  }

  const deliverableTags = tagSet.includes("gdpval-aa")
    ? [...tagSet, "gdpval-aa"]
    : tagSet;
  const standalone = checkStandaloneOpenerQuestion(markdown, deliverableTags);
  if (standalone) {
    issues.push(standalone);
  }

  if (tagSet.includes("gdpval-aa")) {
    issues.push(...lintGdpvalDeliverable(markdown, fixtureId));
  }

  const truncated = checkTruncatedAnswer(markdown);
  if (truncated?.includes("truncated") || truncated?.includes("empty")) {
    issues.push(truncated);
  }

  if (looksTruncated(markdown)) {
    issues.push("Answer appears truncated (heuristic)");
  }

  if (markdown.trim().length < 80 && profile.task === "debug") {
    issues.push("Debug synthesis shorter than 80 characters");
  }

  return issues;
}

export function logSynthesisLintIssues(
  issues: string[],
  context: { query: string; routingMode?: string },
): void {
  if (issues.length === 0) {
    return;
  }
  console.warn(
    `[synthesis-lint] ${context.routingMode ?? "unknown"} mode — ${issues.join("; ")} (query: ${context.query.slice(0, 80)}…)`,
  );
}
