import { z } from "zod";
import { usageTotal } from "../context";
import { chat } from "../mercury";
import type { RubricResult, RubricScores } from "./types";

export const USER_RUBRIC_DIMENSIONS = [
  "actionability",
  "correctness",
  "brevity",
] as const;

export type UserRubricDimension = (typeof USER_RUBRIC_DIMENSIONS)[number];

const rubricDimensionSchema = z.object({
  usefulness: z.number().min(1).max(10),
  structure: z.number().min(1).max(10),
  accuracy: z.number().min(1).max(10),
  voice: z.number().min(1).max(10),
  actionability: z.number().min(1).max(10),
  correctness: z.number().min(1).max(10),
  brevity: z.number().min(1).max(10),
});

const rubricSchema = z.object({
  council: rubricDimensionSchema,
  baseline: rubricDimensionSchema,
  judgeNotes: z.string(),
});

function scoreDelta(council: RubricScores, baseline: RubricScores): RubricScores {
  return {
    usefulness: council.usefulness - baseline.usefulness,
    structure: council.structure - baseline.structure,
    accuracy: council.accuracy - baseline.accuracy,
    voice: council.voice - baseline.voice,
    actionability: (council.actionability ?? 0) - (baseline.actionability ?? 0),
    correctness: (council.correctness ?? 0) - (baseline.correctness ?? 0),
    brevity: (council.brevity ?? 0) - (baseline.brevity ?? 0),
  };
}

export function councilWonRubric(council: RubricScores, baseline: RubricScores): boolean {
  return rubricWeightedTotal(council) > rubricWeightedTotal(baseline);
}

export function userRubricScores(scores: RubricScores): number[] {
  return USER_RUBRIC_DIMENSIONS.map((dimension) => scores[dimension]).filter(
    (value): value is number => value !== undefined,
  );
}

export function minUserRubricScore(scores: RubricScores): number | undefined {
  const values = userRubricScores(scores);
  if (values.length < USER_RUBRIC_DIMENSIONS.length) return undefined;
  return Math.min(...values);
}

function extractJsonBlock(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return raw.slice(braceStart, braceEnd + 1);
  }
  return null;
}

export function rubricWeightedTotal(scores: RubricScores): number {
  return (
    scores.usefulness * 0.35 +
    scores.structure * 0.2 +
    scores.accuracy * 0.3 +
    scores.voice * 0.15
  );
}

export async function runRubricJudge(options: {
  fixtureId: string;
  query: string;
  councilMarkdown: string;
  baselineMarkdown: string;
}): Promise<RubricResult> {
  const system = `You are an impartial evaluator scoring two answers to the same user question.

Score each answer on seven dimensions from 1 (poor) to 10 (excellent):
- usefulness: addresses the question and is actionable
- structure: clear organization and appropriate depth
- accuracy: factual plausibility; penalize obvious hallucinations
- voice: matches user tone; no therapy-speak, council jargon, or meta commentary
- actionability: concrete next steps the user can take without extra research
- correctness: answers match the question constraints; penalize wrong or missing requirements
- brevity: no unnecessary padding; appropriate length for the ask

Respond with ONLY valid JSON:
{
  "council": { "usefulness": 0, "structure": 0, "accuracy": 0, "voice": 0, "actionability": 0, "correctness": 0, "brevity": 0 },
  "baseline": { "usefulness": 0, "structure": 0, "accuracy": 0, "voice": 0, "actionability": 0, "correctness": 0, "brevity": 0 },
  "judgeNotes": "one short paragraph"
}`;

  const user = `Fixture: ${options.fixtureId}

--- User question ---
${options.query}

--- Answer A (council) ---
${options.councilMarkdown.slice(0, 6000)}

--- Answer B (baseline single-shot) ---
${options.baselineMarkdown.slice(0, 6000)}

Score Answer A as "council" and Answer B as "baseline".`;

  const result = await chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    reasoningEffort: "low",
    apiKey: "fallback-only",
  });

  const jsonText = extractJsonBlock(result.content) ?? result.content.trim();
  const parsed = rubricSchema.parse(JSON.parse(jsonText));

  return {
    council: parsed.council,
    baseline: parsed.baseline,
    delta: scoreDelta(parsed.council, parsed.baseline),
    judgeNotes: parsed.judgeNotes,
    usage: result.usage,
  };
}
