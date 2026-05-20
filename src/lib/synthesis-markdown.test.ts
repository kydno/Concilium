import { describe, expect, it } from "vitest";
import { parseChairResponse } from "./prompts";
import {
  normalizeSynthesisParagraphs,
  stripPromptLeakPhrases,
} from "./synthesis-markdown";

describe("normalizeSynthesisParagraphs", () => {
  it("splits a short question opener from the following body", () => {
    const input =
      "What do you need? You could start a quick AI demo, get a random writing prompt, generate a QR-code landing page, launch a music remix, or begin a slang-aware chatbot.";
    const result = normalizeSynthesisParagraphs(input);
    expect(result).toBe(
      "What do you need?\n\nYou could start a quick AI demo, get a random writing prompt, generate a QR-code landing page, launch a music remix, or begin a slang-aware chatbot.",
    );
  });

  it("preserves existing paragraph breaks", () => {
    const input = "First paragraph.\n\nSecond paragraph.";
    expect(normalizeSynthesisParagraphs(input)).toBe(input);
  });
});

describe("parseChairResponse", () => {
  it("preserves python code blocks and strips trailing json metadata", () => {
    const raw = `Here is the function:

\`\`\`python
def is_palindrome(s: str) -> bool:
    return True
\`\`\`

\`\`\`json
{"consensus": [], "conflicts": []}
\`\`\``;

    const result = parseChairResponse(raw);
    expect(result.markdown).toContain("def is_palindrome");
    expect(result.markdown).not.toContain('"consensus"');
  });
});

describe("stripPromptLeakPhrases", () => {
  it("removes therapy-bot opener sentences", () => {
    const input =
      "I'm here for you, no pretense, just genuine willingness to help.\n\nThe fix is to restart the service.";
    const result = stripPromptLeakPhrases(input);
    expect(result).not.toMatch(/here for you/i);
    expect(result).toContain("restart the service");
  });

  it("removes meta voice commentary", () => {
    const input = "I'll be direct: use a connection pool.\n\nThat should resolve timeouts.";
    const result = stripPromptLeakPhrases(input);
    expect(result).not.toMatch(/I'll be direct/i);
    expect(result).toContain("connection pool");
  });

  it("preserves legitimate technical content", () => {
    const input =
      "The API returns 500 when the database connection fails. Check your DATABASE_URL and retry.";
    expect(stripPromptLeakPhrases(input)).toBe(input);
  });
});
