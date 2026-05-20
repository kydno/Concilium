import { usageTotal } from "./context";
import { chat } from "./mercury";
import {
  buildPriorContext,
  buildUserPacket,
  parseChairResponse,
  truncateContext,
} from "./prompts";
import { buildSynthesisVoicePrompt } from "./prompt-voice";
import type { PrecisionHint } from "./council-mode";
import {
  buildConstraintPromptLines,
  type ConstraintRules,
} from "./constraint-rules";
import { looksTruncated } from "./answer-quality";
import { analyzeUserInput } from "./user-input-profile";
import type { PriorTurn } from "./types";
import type { ReasoningEffort } from "./mercury";

export interface MercuryAnswerOptions {
  query: string;
  contextText?: string;
  contextFilename?: string;
  priorTurns?: PriorTurn[];
  apiKey?: "primary" | "fallback-only";
  reasoningEffort?: ReasoningEffort;
  precisionHint?: PrecisionHint;
  constraintRules?: ConstraintRules;
  checklistItems?: string[];
}

export interface MercuryAnswerResult {
  markdown: string;
  durationMs: number;
  tokens: number;
}

function buildDirectAnswerSystemPrompt(
  profile: ReturnType<typeof analyzeUserInput>,
  precisionHint?: PrecisionHint,
  constraintRules?: ConstraintRules,
  checklistItems?: string[],
): string {
  const precisionLines: string[] = [];

  if (precisionHint === "constrained" && constraintRules) {
    precisionLines.push(...buildConstraintPromptLines(constraintRules));
  } else if (precisionHint === "mcq") {
    precisionLines.push(
      "- End your answer with a final line exactly like: Answer: B (use the correct letter A-D).",
    );
  } else if (precisionHint === "terminal" || precisionHint === "command") {
    precisionLines.push(
      "- End with a final line exactly like: Command: `git checkout -- .` (backticks around the command).",
    );
    if (checklistItems && checklistItems.length > 0) {
      precisionLines.push(
        "- Cover each checklist theme explicitly in the body (use short labeled bullets or numbered steps):",
        ...checklistItems.map((item) => `  - ${item}`),
      );
    }
  } else if (precisionHint === "code") {
    precisionLines.push(
      "- You MUST include a fenced code block (```python ... ```) with the full implementation.",
      "- Put the requested function signature and body in that block (e.g. `def is_palindrome(s: str) -> bool:`).",
      "- At most one short sentence before the code block; no prose-only answers.",
      "- Do not use Command: or Answer: footers.",
    );
  } else if (precisionHint === "exact" || precisionHint === "numeric") {
    precisionLines.push(
      "- End with a final line exactly like: Answer: <short exact value> with no extra prose on that line.",
    );
  }

  const voiceBlock =
    precisionHint === "constrained"
      ? "Match the user's request literally. Be concise. No preamble."
      : precisionHint === "code"
        ? "You are a coding assistant. Output working code in a fenced block. Do not describe the code without showing it."
        : buildSynthesisVoicePrompt(profile, precisionHint);

  return `You are a knowledgeable analyst answering the user's question directly in one pass.

Do NOT mention a council, chair, members, sub-agents, or multiple models.

${voiceBlock}
${precisionLines.length > 0 ? `\nPrecision output:\n${precisionLines.join("\n")}` : ""}

Respond with user-facing markdown only: plain paragraphs with blank lines between them. No headings unless essential.${
    precisionHint === "constrained"
      ? " Do not append JSON metadata."
      : " After your answer you may include an optional fenced JSON block with consensus/conflicts metadata, but the markdown above the fence must stand alone as the complete answer."
  }`;
}

export async function runMercuryAnswer(
  options: MercuryAnswerOptions,
): Promise<MercuryAnswerResult> {
  const startedAt = Date.now();
  const profile = analyzeUserInput(options.query);

  const { text: contextText } = options.contextText
    ? truncateContext(options.contextText)
    : { text: undefined };

  const userPacket = buildUserPacket(
    options.query,
    contextText,
    options.contextFilename,
  );

  const priorContext = options.priorTurns
    ? buildPriorContext(options.priorTurns)
    : undefined;

  const userContent = [
    priorContext ? `--- Prior conversation ---\n${priorContext}` : "",
    userPacket,
  ]
    .filter(Boolean)
    .join("\n\n");

  const baseEffort =
    options.reasoningEffort ??
    (options.precisionHint === "code" ? "high" : "medium");

  const runOnce = async (reasoningEffort: ReasoningEffort) => {
    const result = await chat({
      messages: [
        {
          role: "system",
          content: buildDirectAnswerSystemPrompt(
            profile,
            options.precisionHint,
            options.constraintRules,
            options.checklistItems,
          ),
        },
        { role: "user", content: userContent },
      ],
      reasoningEffort,
      apiKey: options.apiKey,
    });
    return {
      synthesis: parseChairResponse(result.content),
      tokens: usageTotal(result.usage),
    };
  };

  let { synthesis, tokens } = await runOnce(baseEffort);

  if (looksTruncated(synthesis.markdown)) {
    const retry = await runOnce("high");
    synthesis = retry.synthesis;
    tokens += retry.tokens;
  }

  return {
    markdown: synthesis.markdown,
    durationMs: Date.now() - startedAt,
    tokens,
  };
}
