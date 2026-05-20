const BASE_URL = "https://api.inceptionlabs.ai/v1/chat/completions";
const MODEL = "mercury-2";

export type ReasoningEffort = "instant" | "low" | "medium" | "high";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatResult {
  content: string;
  usage?: TokenUsage;
}

export type ApiKeySelector = "primary" | "fallback-only";

export interface ChatOptions {
  messages: ChatMessage[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  /** Default "primary". "fallback-only" uses INCEPTION_API_KEY_FALLBACK exclusively. */
  apiKey?: ApiKeySelector;
}

const FALLBACK_RETRY_STATUSES = new Set([401, 402, 429]);
const SERVER_RETRY_STATUSES = new Set([500, 502, 503]);
const MAX_SERVER_RETRIES_PER_KEY = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getPrimaryKey(): string | undefined {
  return trimKey(process.env.INCEPTION_API_KEY);
}

function getFallbackKey(): string | undefined {
  return trimKey(process.env.INCEPTION_API_KEY_FALLBACK);
}

function getApiKeys(): string[] {
  const keys = [getPrimaryKey(), getFallbackKey()].filter((key): key is string =>
    Boolean(key),
  );
  return [...new Set(keys)];
}

export function resolveApiKeys(selector: ApiKeySelector = "primary"): string[] {
  if (selector === "fallback-only") {
    const fallback = getFallbackKey();
    if (!fallback) {
      throw new Error(
        "INCEPTION_API_KEY_FALLBACK is not configured (required for fallback-only calls)",
      );
    }
    return [fallback];
  }

  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "INCEPTION_API_KEY (or INCEPTION_API_KEY_FALLBACK) is not configured",
    );
  }
  return keys;
}

async function fetchMercury(
  options: ChatOptions,
  stream: boolean,
): Promise<Response> {
  const keys = resolveApiKeys(options.apiKey ?? "primary");
  let lastResponse: Response | undefined;

  for (let index = 0; index < keys.length; index++) {
    for (let attempt = 0; attempt <= MAX_SERVER_RETRIES_PER_KEY; attempt++) {
      const response = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keys[index]}`,
          "Content-Type": "application/json",
        },
        body: buildBody(options, stream),
      });

      if (response.ok) {
        return response;
      }

      lastResponse = response;

      if (
        SERVER_RETRY_STATUSES.has(response.status) &&
        attempt < MAX_SERVER_RETRIES_PER_KEY
      ) {
        await sleep(400 * (attempt + 1));
        continue;
      }

      break;
    }

    const hasFallback = index < keys.length - 1;
    if (
      !hasFallback ||
      !lastResponse ||
      !FALLBACK_RETRY_STATUSES.has(lastResponse.status)
    ) {
      break;
    }
  }

  return lastResponse!;
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function parseUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as TokenUsage;
  if (
    u.total_tokens !== undefined ||
    u.prompt_tokens !== undefined ||
    u.completion_tokens !== undefined
  ) {
    return u;
  }
  return undefined;
}

function buildBody(options: ChatOptions, stream: boolean): string {
  return JSON.stringify({
    model: MODEL,
    messages: options.messages,
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
    ...(options.reasoningEffort
      ? { reasoning_effort: options.reasoningEffort }
      : {}),
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
  });
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const response = await fetchMercury(options, false);

  if (!response.ok) {
    throw new Error(`Mercury API error: ${await parseErrorResponse(response)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: TokenUsage;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Mercury API returned an empty response");
  }

  return { content, usage: parseUsage(data.usage) };
}

export async function* chatStream(
  options: ChatOptions,
): AsyncGenerator<{ delta: string; usage?: TokenUsage }, void, unknown> {
  const response = await fetchMercury(options, true);

  if (!response.ok) {
    throw new Error(`Mercury API error: ${await parseErrorResponse(response)}`);
  }

  if (!response.body) {
    throw new Error("Mercury API returned no stream body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: TokenUsage;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        const usage = parseUsage(parsed.usage);
        if (delta) {
          yield { delta, usage };
        } else if (usage) {
          yield { delta: "", usage };
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }
}

/** Back-compat: return content string only */
export async function chatContent(options: ChatOptions): Promise<string> {
  const result = await chat(options);
  return result.content;
}
