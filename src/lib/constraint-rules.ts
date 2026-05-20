/** Programmatic output constraints (IFBench-style). Shared by product and benchmark. */
export interface ConstraintRules {
  maxSentences?: number;
  minSentences?: number;
  bannedWords?: string[];
  mustInclude?: string[];
  mustNotInclude?: string[];
  mustStartWith?: string;
  answerMustBeOnly?: string;
}

const CONSTRAINT_QUERY_PATTERNS = [
  /\bexactly\s+\d+\s+sentences?\b/i,
  /\bonly\s+the\s+word\b/i,
  /\breply\s+with\s+only\b/i,
  /\bdo\s+not\s+use\b/i,
  /\bstart\s+your\s+answer\s+with\b/i,
  /\bno\s+bullet\s+points?\b/i,
  /\bnothing\s+else\b/i,
];

export function queryLooksConstrained(query: string): boolean {
  return CONSTRAINT_QUERY_PATTERNS.some((pattern) => pattern.test(query));
}

export function buildConstraintPromptLines(rules: ConstraintRules): string[] {
  const lines: string[] = [
    "Output constraints (follow exactly; violating any constraint fails the task):",
  ];

  if (rules.answerMustBeOnly) {
    lines.push(
      `- Your entire response must be exactly: ${rules.answerMustBeOnly} (nothing before or after).`,
    );
  }

  if (rules.maxSentences !== undefined && rules.minSentences !== undefined) {
    lines.push(
      `- Use exactly ${rules.minSentences} sentence${rules.minSentences === 1 ? "" : "s"}.`,
    );
  } else if (rules.maxSentences !== undefined) {
    lines.push(`- Use at most ${rules.maxSentences} sentence${rules.maxSentences === 1 ? "" : "s"}.`);
  } else if (rules.minSentences !== undefined) {
    lines.push(`- Use at least ${rules.minSentences} sentence${rules.minSentences === 1 ? "" : "s"}.`);
  }

  if (rules.mustStartWith) {
    lines.push(`- Start your answer with exactly: ${rules.mustStartWith}`);
  }

  for (const word of rules.bannedWords ?? []) {
    lines.push(`- Do not use the word "${word}" (any casing).`);
  }

  for (const phrase of rules.mustInclude ?? []) {
    lines.push(`- Include the word or phrase "${phrase}".`);
  }

  for (const phrase of rules.mustNotInclude ?? []) {
    lines.push(`- Do not include "${phrase}".`);
  }

  lines.push(
    "- Do not add an Answer: or Command: footer unless the user explicitly asked for one.",
    "- No headings, bullet lists, or JSON metadata unless the user asked for them.",
  );

  return lines;
}

/** Infer lightweight constraints from query text when no fixture rules exist. */
export function inferConstraintsFromQuery(query: string): ConstraintRules | undefined {
  const rules: ConstraintRules = {};
  let found = false;

  const exactSentences = query.match(/\bexactly\s+(\d+)\s+sentences?\b/i);
  if (exactSentences?.[1]) {
    const n = Number.parseInt(exactSentences[1], 10);
    rules.maxSentences = n;
    rules.minSentences = n;
    found = true;
  }

  const maxSentences = query.match(/\b(?:at most|no more than)\s+(\d+)\s+sentences?\b/i);
  if (maxSentences?.[1]) {
    rules.maxSentences = Number.parseInt(maxSentences[1], 10);
    found = true;
  }

  const onlyWord = query.match(/\b(?:reply with )?only\s+the\s+word\s+(\S+)/i);
  if (onlyWord?.[1]) {
    rules.answerMustBeOnly = onlyWord[1].replace(/[.]+$/, "").toUpperCase();
    found = true;
  }

  const startWith = query.match(/\bstart your answer with (?:the phrase )?['"]?([^'".\n]+)['"]?/i);
  if (startWith?.[1]) {
    rules.mustStartWith = startWith[1].trim();
    found = true;
  }

  if (/\bno bullet points?\b/i.test(query)) {
    rules.bannedWords = [...(rules.bannedWords ?? []), "bullet"];
    found = true;
  }

  return found ? rules : undefined;
}
