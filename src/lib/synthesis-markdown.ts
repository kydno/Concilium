/** Strip HRs, json fences, and other artifacts from synthesis markdown */
export function cleanSynthesisMarkdown(raw: string): string {
  let text = raw.trim();

  const jsonFence = text.match(/```json\s*[\s\S]*?```\s*$/i);
  if (jsonFence?.index !== undefined) {
    text = text.slice(0, jsonFence.index).trim();
  }

  return text
    .replace(/^---+$/gm, "")
    .replace(/^\*\*\*+$/gm, "")
    .replace(/<hr\s*\/?>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CHAIN_OF_THOUGHT_SECTION =
  /(?:^|\n)(?:#{1,3}\s*|\*\*)(?:Direct answer|Where the (?:perspectives|agents) align|Where they diverge|Practical recommendations?|Greeting and Next Steps|Final Orchestrator Output)(?:\*\*)?[\s\S]*?(?=(?:\n#{1,3}\s|\n\*\*(?:Direct answer|Where the|Practical|Final))|$)/gi;

const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /\bI(?:'m| am) here for you\b[^.!?\n]*[.!?]?\s*/gi,
  /\bno pretense\b,?\s*/gi,
  /\bgenuine willingness to help\b\.?\s*/gi,
  /\blet me match your tone\b\.?\s*/gi,
  /\bI(?:'ll| will) be direct:?\s*/gi,
  /\bsincerity pivot\b[^.!?\n]*[.!?]?\s*/gi,
  /\bvulnerable human connection\b[^.!?\n]*[.!?]?\s*/gi,
  /\bas your (?:council|orchestrator)\b[^.!?\n]*[.!?]?\s*/gi,
  /\bthe council concluded\b[^.!?\n]*[.!?]?\s*/gi,
  /\bthe models agreed\b[^.!?\n]*[.!?]?\s*/gi,
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Ensure markdown paragraph breaks so React renders distinct blocks with spacing.
 * Fixes run-on answers like "What do you need? You could start...".
 */
export function normalizeSynthesisParagraphs(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  let result = trimmed.replace(
    /^(.{1,120}\?)\s+(?=[A-Z"'(])/u,
    "$1\n\n",
  );

  if (!result.includes("\n\n")) {
    const sentences = splitSentences(result);
    if (
      sentences.length >= 2 &&
      sentences[0].endsWith("?") &&
      sentences[0].length <= 120
    ) {
      result = `${sentences[0]}\n\n${sentences.slice(1).join(" ")}`;
    }
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove common system-prompt leak phrases from user-facing synthesis */
export function stripPromptLeakPhrases(text: string): string {
  let result = text;
  for (const pattern of PROMPT_LEAK_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/** Keep only the direct answer; strip alignment/divergence sections if the model adds them */
export function extractDirectAnswerMarkdown(raw: string): string {
  let text = cleanSynthesisMarkdown(raw);

  const boldDirect = text.match(
    /\*\*Direct answer\*\*\s*\n?([\s\S]*?)(?=\n\*\*(?:Where|Practical|Greeting)|\n##|$)/i,
  );
  if (boldDirect?.[1]?.trim()) {
    return boldDirect[1].trim();
  }

  const hashDirect = text.match(
    /##\s*Direct answer\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (hashDirect?.[1]?.trim()) {
    return hashDirect[1].trim();
  }

  text = text.replace(
    /(?:^|\n)#+\s+[^\n]+\n+(?=#+\s*(?:Direct answer|Where the|Practical)|\*\*)/i,
    "\n",
  );

  const stripPatterns = [
    /\*\*Where the (?:perspectives|agents) align\*\*[\s\S]*/i,
    /\*\*Where they diverge\*\*[\s\S]*/i,
    /\*\*Practical recommendations?\*\*[\s\S]*/i,
    /\*\*Final Orchestrator Output\*\*[\s\S]*/i,
    /##\s*Where the (?:perspectives|agents) align[\s\S]*/i,
    /##\s*Where they diverge[\s\S]*/i,
    /##\s*Practical recommendations?[\s\S]*/i,
    /^#+\s+Greeting and Next Steps\s*\n*/im,
    /^\*\*Greeting and Next Steps\*\*\s*\n*/im,
    /^#+\s+Final Orchestrator Output\s*\n*/im,
    /^\*\*Final Orchestrator Output\*\*\s*\n*/im,
  ];

  for (const pattern of stripPatterns) {
    text = text.replace(pattern, "");
  }

  text = text.replace(CHAIN_OF_THOUGHT_SECTION, "").trim();

  return text.trim();
}
