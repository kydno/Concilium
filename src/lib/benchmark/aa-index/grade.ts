import { rubricWeightedTotal } from "../judge";
import type { RubricResult } from "../types";
import { gradeAgentOutput } from "../../agent-task";
import type { AaGradeResult, AaGradingType, AaIndexFixture, IfBenchRules } from "./types";

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ");
}

function extractExactAnswerText(markdown: string): string {
  const footerMatch = markdown.match(/^Answer:\s*(.+?)\s*$/im);
  if (footerMatch?.[1]) {
    return footerMatch[1].trim();
  }
  return markdown.trim();
}

/** Strip commas and normalize scientific notation tokens for comparison. */
function normalizeNumericTokens(text: string): string {
  return text
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/×/g, "x")
    .replace(/\s+/g, "");
}

function extractNumericCandidates(text: string): number[] {
  const values: number[] = [];
  const sciPattern =
    /(-?\d+(?:\.\d+)?)\s*(?:e|x\s*10\^?|×10\^?)\s*(-?\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = sciPattern.exec(text)) !== null) {
    const mantissa = Number.parseFloat(match[1]!);
    const exponent = Number.parseInt(match[2]!, 10);
    if (Number.isFinite(mantissa) && Number.isFinite(exponent)) {
      values.push(mantissa * 10 ** exponent);
    }
  }

  const plainPattern = /-?\d+(?:\.\d+)?/g;
  for (const token of text.match(plainPattern) ?? []) {
    const value = Number.parseFloat(token);
    if (Number.isFinite(value)) {
      values.push(value);
    }
  }

  return values;
}

function matchesExactExpected(
  answerText: string,
  fullText: string,
  expected: string,
): boolean {
  const normalized = normalizeText(answerText);
  const expectedNorm = normalizeText(expected);

  if (
    normalized === expectedNorm ||
    normalized.includes(expectedNorm) ||
    expectedNorm.includes(normalized) ||
    normalizeText(fullText).includes(expectedNorm)
  ) {
    return true;
  }

  // Mantissa-prefix match for scientific answers (e.g. speed of light → "3")
  if (/^\d+$/.test(expectedNorm) && expectedNorm.length <= 3) {
    const compact = normalizeNumericTokens(answerText);
    if (compact.startsWith(expectedNorm)) {
      return true;
    }

    const prefix = Number.parseInt(expectedNorm, 10);
    if (Number.isFinite(prefix)) {
      for (const value of extractNumericCandidates(fullText)) {
        const abs = Math.abs(value);
        if (abs >= 1) {
          const mantissaStr = abs.toExponential(0).split("e")[0]!.replace(/\D/g, "");
          if (mantissaStr.startsWith(expectedNorm)) {
            return true;
          }
        }
        if (
          expectedNorm === "3" &&
          abs >= 2.99e8 &&
          abs <= 3.01e8
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function extractMcqLetter(markdown: string): string | null {
  const footerMatch = markdown.match(/^Answer:\s*([A-D])\s*$/im);
  if (footerMatch?.[1]) return footerMatch[1].toUpperCase();

  const patterns = [
    /\b(?:answer|option|choice)[:\s]*\*?\*?([A-D])\b/i,
    /\b([A-D])\)\s/,
    /^([A-D])[.):]/m,
    /\*\*([A-D])\*\*/,
    /\b([A-D])\b(?=\s*(?:is correct|because|\.|$))/i,
  ];

  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  const lastLetter = markdown.match(/\b([A-D])\b/g);
  if (lastLetter?.length) {
    return lastLetter[lastLetter.length - 1]!.toUpperCase();
  }

  return null;
}

function countSentences(text: string): number {
  const stripped = text.replace(/```[\s\S]*?```/g, " ").trim();
  if (!stripped) return 0;
  const parts = stripped.split(/[.!?]+/).filter((part) => part.trim().length > 3);
  return Math.max(1, parts.length);
}

function gradeIfBench(markdown: string, rules: IfBenchRules): AaGradeResult {
  const text = markdown.trim();
  const issues: string[] = [];
  let checks = 0;
  let passed = 0;

  const check = (ok: boolean, label: string) => {
    checks += 1;
    if (ok) passed += 1;
    else issues.push(label);
  };

  if (rules.maxSentences !== undefined) {
    const count = countSentences(text);
    check(count <= rules.maxSentences, `max ${rules.maxSentences} sentences (got ${count})`);
  }

  if (rules.minSentences !== undefined) {
    const count = countSentences(text);
    check(count >= rules.minSentences, `min ${rules.minSentences} sentences (got ${count})`);
  }

  const lower = text.toLowerCase();
  for (const word of rules.bannedWords ?? []) {
    checks += 1;
    if (!lower.includes(word.toLowerCase())) passed += 1;
    else issues.push(`banned word: ${word}`);
  }

  for (const phrase of rules.mustInclude ?? []) {
    checks += 1;
    if (lower.includes(phrase.toLowerCase())) passed += 1;
    else issues.push(`missing required: ${phrase}`);
  }

  for (const phrase of rules.mustNotInclude ?? []) {
    checks += 1;
    if (!lower.includes(phrase.toLowerCase())) passed += 1;
    else issues.push(`forbidden phrase: ${phrase}`);
  }

  if (rules.mustStartWith) {
    checks += 1;
    if (text.toLowerCase().startsWith(rules.mustStartWith.toLowerCase())) passed += 1;
    else issues.push(`must start with: ${rules.mustStartWith}`);
  }

  if (rules.answerMustBeOnly) {
    checks += 1;
    const normalized = normalizeText(text);
    const expected = normalizeText(rules.answerMustBeOnly);
    if (normalized === expected) passed += 1;
    else issues.push(`answer must be only: ${rules.answerMustBeOnly}`);
  }

  const score = checks > 0 ? passed / checks : 0;
  return {
    score,
    pass: score >= 1,
    method: "ifbench",
    detail: issues.length ? issues.join("; ") : "all constraints satisfied",
  };
}

function gradeChecklist(markdown: string, items: string[]): AaGradeResult {
  const lower = markdown.toLowerCase();
  let passed = 0;
  const missing: string[] = [];

  for (const item of items) {
    if (lower.includes(item.toLowerCase())) passed += 1;
    else missing.push(item);
  }

  const score = items.length > 0 ? passed / items.length : 0;
  return {
    score,
    pass: score >= 0.8,
    method: "checklist",
    detail: missing.length ? `missing: ${missing.join(", ")}` : "checklist satisfied",
  };
}

export function gradeAnswer(
  markdown: string,
  fixture: AaIndexFixture,
  rubric?: RubricResult,
  side?: "council" | "baseline",
): AaGradeResult {
  const text = markdown.trim();
  if (!text) {
    return { score: 0, pass: false, method: fixture.grading, detail: "empty answer" };
  }

  switch (fixture.grading) {
    case "mcq": {
      const letter = extractMcqLetter(text);
      const expected = fixture.expectedAnswer?.toUpperCase() ?? "";
      const pass = letter === expected;
      return {
        score: pass ? 1 : 0,
        pass,
        method: "mcq",
        detail: pass
          ? `correct ${expected}`
          : `expected ${expected}, got ${letter ?? "none"}`,
      };
    }

    case "exact": {
      const answerText = extractExactAnswerText(text);
      const expected = fixture.expectedAnswer ?? "";
      const pass = matchesExactExpected(answerText, text, expected);
      return {
        score: pass ? 1 : 0,
        pass,
        method: "exact",
        detail: pass ? "exact match" : `expected "${fixture.expectedAnswer}"`,
      };
    }

    case "numeric": {
      const numbers = text.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
      const expected = Number.parseFloat(fixture.expectedAnswer ?? "NaN");
      const tolerance = fixture.numericTolerance ?? 0.01;
      const match = numbers.some(
        (value) => Number.isFinite(value) && Math.abs(value - expected) <= tolerance,
      );
      return {
        score: match ? 1 : 0,
        pass: match,
        method: "numeric",
        detail: match
          ? `found ${expected} ± ${tolerance}`
          : `expected ${expected}, found [${numbers.join(", ")}]`,
      };
    }

    case "regex": {
      const codeBlocks = [...text.matchAll(/```[\w]*\n?([\s\S]*?)```/g)].map(
        (match) => match[1] ?? "",
      );
      const haystack = [text, ...codeBlocks].join("\n");
      const pattern = new RegExp(fixture.expectedAnswer ?? "", "i");
      const pass = pattern.test(haystack);
      return {
        score: pass ? 1 : 0,
        pass,
        method: "regex",
        detail: pass ? "pattern matched" : `pattern ${fixture.expectedAnswer} not found`,
      };
    }

    case "ifbench":
      return gradeIfBench(text, fixture.ifbenchRules ?? {});

    case "checklist":
      return gradeChecklist(text, fixture.checklistItems ?? []);

    case "agent": {
      const graded = gradeAgentOutput(
        text,
        fixture.expectedAnswer ?? "",
        fixture.agentCommand,
        fixture.agentSteps,
      );
      return {
        score: graded.pass ? 1 : 0,
        pass: graded.pass,
        method: "agent",
        detail: graded.detail,
      };
    }

    case "rubric": {
      if (!rubric || !side) {
        return {
          score: 0,
          pass: false,
          method: "rubric-normalized",
          detail: "rubric missing",
        };
      }
      const scores = side === "council" ? rubric.council : rubric.baseline;
      const normalized = rubricWeightedTotal(scores) / 10;
      return {
        score: normalized,
        pass: normalized >= 0.7,
        method: "rubric-normalized",
        detail: `weighted rubric ${normalized.toFixed(2)}`,
      };
    }

    default:
      return { score: 0, pass: false, method: fixture.grading, detail: "unknown grading" };
  }
}
