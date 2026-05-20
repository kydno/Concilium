import { z } from "zod";
import type { PrecisionHint } from "./council-mode";
import { buildChairSystemPrompt } from "./prompt-voice";
import {
  extractDirectAnswerMarkdown,
  normalizeSynthesisParagraphs,
  stripPromptLeakPhrases,
} from "./synthesis-markdown";
import type { UserInputProfile } from "./user-input-profile";
import { formatProfileSummary } from "./user-input-profile";
import type { CouncilMemberPlan, OrchestratorPlan, SynthesisResult } from "./types";

export const UPLOAD_TRUNCATE_CHARS = 16_000;

export const DEFAULT_MEMBERS: CouncilMemberPlan[] = [
  {
    id: "a",
    title: "Evidence Analyst",
    systemPrompt:
      "You are an evidence-focused analyst. Ground your answer in facts, cite reasoning clearly, and flag uncertainty. Be concise but thorough.",
  },
  {
    id: "b",
    title: "Devil's Advocate",
    systemPrompt:
      "You are a contrarian analyst. Challenge assumptions, surface risks, and present counterarguments constructively.",
  },
  {
    id: "c",
    title: "Pragmatic Planner",
    systemPrompt:
      "You are a pragmatic strategist. Focus on actionable steps, trade-offs, and what to do next in the real world.",
  },
];

export const DEFAULT_SYNTHESIS_FOCUS =
  "Balance evidence, dissent, and practical next steps into one coherent answer.";

const orchestratorSchema = z.object({
  members: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        systemPrompt: z.string(),
      }),
    )
    .length(3),
  synthesisFocus: z.string(),
});

export function buildUserPacket(
  query: string,
  contextText?: string,
  contextFilename?: string,
): string {
  let packet = `--- User question ---\n${query.trim()}`;

  if (contextText?.trim()) {
    const label = contextFilename ?? "attachment.txt";
    packet += `\n\n--- Attached document (${label}) ---\n${contextText.trim()}`;
  }

  return packet;
}

export function buildOrchestratorUserMessage(
  userPacket: string,
  profile: UserInputProfile,
  priorContext?: string,
): string {
  const profileBlock = `--- User communication profile ---
${formatProfileSummary(profile)}
Signals: ${profile.matchedSignals.join(", ") || "none"}`;

  const parts = [
    priorContext ? `--- Prior conversation ---\n${priorContext}` : "",
    profileBlock,
    userPacket,
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function truncateContext(text: string, maxChars = UPLOAD_TRUNCATE_CHARS): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, maxChars) + "\n\n[Document truncated for token budget]",
    truncated: true,
  };
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

export function parseOrchestratorResponse(raw: string): OrchestratorPlan {
  try {
    const jsonText = extractJsonBlock(raw) ?? raw.trim();
    const parsed = orchestratorSchema.safeParse(JSON.parse(jsonText));

    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Fall through to defaults
  }

  return {
    members: DEFAULT_MEMBERS,
    synthesisFocus: DEFAULT_SYNTHESIS_FOCUS,
  };
}

const synthesisMetaSchema = z.object({
  consensus: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
});

export function parseChairResponse(raw: string): SynthesisResult {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```\s*$/i);
  let markdown = raw.trim();
  let consensus: string[] = [];
  let conflicts: string[] = [];

  if (jsonMatch && jsonMatch.index !== undefined) {
    markdown = raw.slice(0, jsonMatch.index).trim();
    try {
      const meta = synthesisMetaSchema.parse(JSON.parse(jsonMatch[1].trim()));
      consensus = meta.consensus;
      conflicts = meta.conflicts;
    } catch {
      // Keep markdown-only result
    }
  }

  markdown = extractDirectAnswerMarkdown(markdown);
  markdown = stripPromptLeakPhrases(markdown);
  markdown = normalizeSynthesisParagraphs(markdown);

  return { markdown, consensus, conflicts };
}

export function buildChairMessages(
  userPacket: string,
  plan: OrchestratorPlan,
  members: Array<{ title: string; content: string; error?: string }>,
  profile: UserInputProfile,
  priorContext?: string,
  precisionHint?: PrecisionHint,
  userQuery?: string,
  tags?: string[],
): Array<{ role: "system" | "user"; content: string }> {
  const orderedMembers =
    precisionHint &&
    precisionHint !== "constrained" &&
    precisionHint !== "code"
      ? [
          ...members.filter((member) => !/precision/i.test(member.title)),
          ...members.filter((member) => /precision/i.test(member.title)),
        ]
      : members;

  const memberBlock = orderedMembers
    .map((member, index) => {
      const body = member.error
        ? `[Member failed: ${member.error}]`
        : member.content;
      return `### Agent ${index + 1}: ${member.title}\n${body}`;
    })
    .join("\n\n");

  const userContent = [
    priorContext ? `--- Prior conversation ---\n${priorContext}\n` : "",
    `--- User communication profile ---\n${formatProfileSummary(profile)}`,
    `--- User packet ---\n${userPacket}`,
    `\n--- Synthesis focus ---\n${plan.synthesisFocus}`,
    `\n--- Agent analyses (internal; do not repeat in user-facing answer) ---\n${memberBlock}`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    {
      role: "system",
      content: buildChairSystemPrompt(profile, precisionHint, userQuery, tags),
    },
    { role: "user", content: userContent },
  ];
}

export function buildMemberMessages(
  systemPrompt: string,
  userPacket: string,
  priorContext?: string,
): Array<{ role: "system" | "user"; content: string }> {
  const userContent = priorContext
    ? `--- Prior conversation ---\n${priorContext}\n\n${userPacket}`
    : userPacket;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

export function buildPriorContext(
  turns: Array<{
    query: string;
    synthesisMarkdown: string;
    contextFilename?: string;
    contextExcerpt?: string;
  }>,
): string | undefined {
  if (turns.length === 0) return undefined;

  const blocks = turns.map((turn, index) => {
    const attachment =
      turn.contextFilename && turn.contextExcerpt
        ? `\n[Attached ${turn.contextFilename}: ${turn.contextExcerpt.slice(0, 300)}]`
        : turn.contextFilename
          ? `\n[Attached ${turn.contextFilename}]`
          : "";

    return [
      `Turn ${index + 1}`,
      `User: ${turn.query}${attachment}`,
      `Assistant: ${turn.synthesisMarkdown}`,
    ].join("\n");
  });

  return [
    "Continue this conversation coherently. Treat the exchange below as established context; do not re-introduce yourself or repeat prior answers unless the user asks.",
    "",
    ...blocks,
  ].join("\n");
}
