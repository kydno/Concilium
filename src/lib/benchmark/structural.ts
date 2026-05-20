import { stripPromptLeakPhrases } from "../synthesis-markdown";
import type { StructuralCheck } from "./types";

const MIN_LENGTH = 80;
const COUNCIL_LEAK_PATTERNS = [
  /\bcouncil\b/i,
  /\borchestrator\b/i,
  /\bthree agents\b/i,
  /\bmember[s]?\s+(?:said|agreed)\b/i,
];

const DELIVERABLE_FIRST_TAGS = new Set([
  "debug",
  "howto",
  "compare",
  "terse",
  "blunt",
]);
const DELIVERABLE_EVAL_TAGS = new Set(["gdpval-aa", "aa-index"]);

export function checkTerseDebugSteps(
  markdown: string,
  tags?: string[],
): string | null {
  if (!tags?.includes("debug")) {
    return null;
  }
  if (!tags.includes("terse") && !tags.includes("blunt")) {
    return null;
  }

  const numberedSteps = markdown.match(/^\s*\d+[.)]\s+/gm);
  if ((numberedSteps?.length ?? 0) >= 2) {
    return null;
  }

  return "Terse/blunt debug answer has fewer than two numbered steps";
}

export function checkQuestionOnlyOpener(
  markdown: string,
  tags?: string[],
): string | null {
  if (!tags?.some((tag) => DELIVERABLE_FIRST_TAGS.has(tag))) {
    return null;
  }

  const text = markdown.trim();
  const paragraphs = text
    .split(/\n\n+/)
    .filter((paragraph) => paragraph.trim().length > 0);
  const firstParagraph = (paragraphs[0] ?? text).trim();

  if (
    tags.some((tag) => tag === "howto" || tag === "compare") &&
    firstParagraph.endsWith("?")
  ) {
    return "Deliverable-first task opens with a question instead of content";
  }

  if (paragraphs.length >= 2) {
    return null;
  }

  if (firstParagraph.endsWith("?") && paragraphs.length < 2) {
    return "Answer is only a clarifying question for a deliverable-first task";
  }

  return null;
}

export function checkTruncatedAnswer(markdown: string): string | null {
  const text = markdown.trim();
  if (text.length === 0) {
    return "Answer is empty";
  }
  if (/[:;]\s*$/.test(text)) {
    return "Answer appears truncated (ends with colon/semicolon)";
  }
  if (text.length < 80) {
    return "Answer shorter than 80 characters";
  }
  return null;
}

export function checkStandaloneOpenerQuestion(
  markdown: string,
  tags?: string[],
): string | null {
  if (!tags?.some((tag) => DELIVERABLE_EVAL_TAGS.has(tag) || tag === "gdpval-aa")) {
    return null;
  }

  const paragraphs = markdown
    .trim()
    .split(/\n\n+/)
    .filter((paragraph) => paragraph.trim().length > 0);
  const first = paragraphs[0]?.trim() ?? "";
  if (first.endsWith("?")) {
    return "Deliverable task opens with question before deliverable body";
  }

  return null;
}

export function runStructuralChecks(
  markdown: string,
  tags?: string[],
): StructuralCheck {
  const issues: string[] = [];
  const text = markdown.trim();

  if (text.length < MIN_LENGTH) {
    issues.push(`Answer shorter than ${MIN_LENGTH} characters`);
  }

  if (!text.includes("\n\n") && text.length > 200) {
    issues.push("Long answer missing blank-line paragraph breaks");
  }

  const leakProbe = stripPromptLeakPhrases(text);
  if (leakProbe !== text) {
    issues.push("Contains prompt-leak phrasing");
  }

  for (const pattern of COUNCIL_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      issues.push(`Meta jargon detected: ${pattern.source}`);
      break;
    }
  }

  const terseDebugSteps = checkTerseDebugSteps(text, tags);
  if (terseDebugSteps) {
    issues.push(terseDebugSteps);
  }

  const questionOnly = checkQuestionOnlyOpener(text, tags);
  if (questionOnly) {
    issues.push(questionOnly);
  }

  const standaloneOpener = checkStandaloneOpenerQuestion(text, tags);
  if (standaloneOpener) {
    issues.push(standaloneOpener);
  }

  const truncated = checkTruncatedAnswer(text);
  if (truncated?.includes("truncated") || truncated?.includes("empty")) {
    issues.push(truncated);
  }

  return { pass: issues.length === 0, issues };
}
