export type UserTone = "formal" | "casual" | "blunt" | "emotional" | "neutral";
export type UserTask =
  | "debug"
  | "explain"
  | "howto"
  | "compare"
  | "brainstorm"
  | "review"
  | "general";
export type UserVerbosity = "terse" | "normal" | "verbose";

export interface UserInputProfile {
  tone: UserTone;
  task: UserTask;
  verbosity: UserVerbosity;
  technical: boolean;
  emotionalLoad: boolean;
  matchedSignals: string[];
}

type ToneScores = Record<UserTone, number>;
type TaskScores = Record<UserTask, number>;

const TONE_KEYWORDS: Record<Exclude<UserTone, "neutral">, string[]> = {
  formal: [
    "please",
    "kindly",
    "would appreciate",
    "dear",
    "sincerely",
    "respectfully",
    "could you",
    "would you",
    "thank you in advance",
  ],
  casual: [
    "lol",
    "lmao",
    "btw",
    "hey",
    "hi there",
    "gonna",
    "wanna",
    "kinda",
    "tbh",
    "imo",
    "ngl",
    "yeah",
    "nah",
  ],
  blunt: [
    "tldr",
    "tl;dr",
    "just tell me",
    "cut to the chase",
    "bottom line",
    "no fluff",
    "skip the",
    "get to the point",
    "short answer",
    "be brief",
  ],
  emotional: [
    "anxious",
    "anxiety",
    "stressed",
    "stress",
    "scared",
    "afraid",
    "worried",
    "overwhelmed",
    "frustrated",
    "frustrating",
    "upset",
    "depressed",
    "lonely",
    "panic",
    "can't cope",
    "help me",
    "i'm struggling",
    "im struggling",
  ],
};

const TASK_KEYWORDS: Record<Exclude<UserTask, "general">, string[]> = {
  debug: [
    "error",
    "exception",
    "stack trace",
    "stacktrace",
    "doesn't work",
    "doesnt work",
    "not working",
    "failed",
    "failure",
    "bug",
    "crash",
    "undefined",
    "null pointer",
    "typeerror",
    "syntaxerror",
    "500",
    "404",
    "fix this",
  ],
  explain: [
    "explain",
    "what is",
    "what are",
    "why does",
    "why do",
    "how does",
    "help me understand",
    "meaning of",
    "define",
  ],
  howto: [
    "how do i",
    "how to",
    "steps to",
    "walk me through",
    "guide me",
    "tutorial",
    "setup",
    "configure",
    "implement",
  ],
  compare: [
    " vs ",
    " versus ",
    "compare",
    "difference between",
    "better than",
    "pros and cons",
    "which one",
    "or should i",
  ],
  brainstorm: [
    "brainstorm",
    "ideas for",
    "suggest",
    "options for",
    "what should i",
    "possibilities",
    "creative",
    "alternatives",
  ],
  review: [
    "review",
    "critique",
    "feedback on",
    "look at my",
    "rate this",
    "improve this",
    "roast",
    "evaluate",
  ],
};

const TECHNICAL_PATTERNS = [
  /\bapi\b/i,
  /\bfunction\b/i,
  /\bclass\b/i,
  /\bimport\b/i,
  /\bconst\b/i,
  /\blet\b/i,
  /\bvar\b/i,
  /\basync\b/i,
  /\bawait\b/i,
  /\btypescript\b/i,
  /\bjavascript\b/i,
  /\bpython\b/i,
  /\bsql\b/i,
  /\bhttp\b/i,
  /\bjson\b/i,
  /\bnpm\b/i,
  /\bgit\b/i,
  /\bdocker\b/i,
  /\breact\b/i,
  /\bnext\.?js\b/i,
];

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      count += 1;
    }
  }
  return count;
}

function scoreTone(text: string): { scores: ToneScores; signals: string[] } {
  const scores: ToneScores = {
    formal: 0,
    casual: 0,
    blunt: 0,
    emotional: 0,
    neutral: 0,
  };
  const signals: string[] = [];

  for (const [tone, keywords] of Object.entries(TONE_KEYWORDS) as Array<
    [Exclude<UserTone, "neutral">, string[]]
  >) {
    const hits = countKeywordHits(text, keywords);
    if (hits > 0) {
      scores[tone] = hits;
      signals.push(`tone:${tone}(${hits})`);
    }
  }

  if (text.includes("!") && scores.emotional === 0) {
    const exclamations = (text.match(/!/g) ?? []).length;
    if (exclamations >= 2) {
      scores.emotional += 1;
      signals.push("tone:emotional(!)");
    }
  }

  if (text.length < 80 && !text.includes("?")) {
    scores.blunt += 1;
    signals.push("tone:blunt(short)");
  }

  return { scores, signals };
}

function scoreTask(text: string): { scores: TaskScores; signals: string[] } {
  const scores: TaskScores = {
    debug: 0,
    explain: 0,
    howto: 0,
    compare: 0,
    brainstorm: 0,
    review: 0,
    general: 0,
  };
  const signals: string[] = [];

  if (/```[\s\S]*?```/.test(text)) {
    scores.debug += 2;
    signals.push("task:debug(code_fence)");
  }

  if (/\bat\s+\S+\.(ts|tsx|js|jsx|py|rs|go)\b/i.test(text)) {
    scores.debug += 1;
    signals.push("task:debug(file_ref)");
  }

  for (const [task, keywords] of Object.entries(TASK_KEYWORDS) as Array<
    [Exclude<UserTask, "general">, string[]]
  >) {
    const hits = countKeywordHits(text, keywords);
    if (hits > 0) {
      scores[task] = hits;
      signals.push(`task:${task}(${hits})`);
    }
  }

  return { scores, signals };
}

function pickMax<T extends string>(
  scores: Record<T, number>,
  fallback: T,
): T {
  let best = fallback;
  let bestScore = scores[fallback] ?? 0;

  for (const [key, score] of Object.entries(scores) as Array<[T, number]>) {
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : fallback;
}

function detectVerbosity(text: string): UserVerbosity {
  const trimmed = text.trim();
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (trimmed.length < 60 || sentences.length <= 1) {
    return "terse";
  }
  if (trimmed.length > 400 || sentences.length > 6) {
    return "verbose";
  }
  return "normal";
}

function detectTechnical(text: string): boolean {
  if (/```[\s\S]*?```/.test(text)) return true;

  let technicalHits = 0;
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(text)) {
      technicalHits += 1;
    }
  }
  return technicalHits >= 2;
}

export function analyzeUserInput(query: string): UserInputProfile {
  const text = query.trim();
  const { scores: toneScores, signals: toneSignals } = scoreTone(text);
  const { scores: taskScores, signals: taskSignals } = scoreTask(text);

  const tone = pickMax<UserTone>(toneScores, "neutral");
  const task = pickMax<UserTask>(taskScores, "general");
  const verbosity = detectVerbosity(text);
  const technical = detectTechnical(text);
  const emotionalLoad =
    tone === "emotional" || toneScores.emotional >= 2;

  const matchedSignals = [
    ...toneSignals,
    ...taskSignals,
    `verbosity:${verbosity}`,
    ...(technical ? ["technical:true"] : []),
    ...(emotionalLoad ? ["emotionalLoad:true"] : []),
  ];

  return {
    tone,
    task,
    verbosity,
    technical,
    emotionalLoad,
    matchedSignals,
  };
}

export function formatProfileSummary(profile: UserInputProfile): string {
  return [
    `tone=${profile.tone}`,
    `task=${profile.task}`,
    `verbosity=${profile.verbosity}`,
    `technical=${profile.technical}`,
    `emotionalLoad=${profile.emotionalLoad}`,
  ].join(", ");
}
