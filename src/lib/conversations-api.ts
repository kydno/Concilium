import type { Conversation, CouncilResult } from "./types";

const DB_PROBE_TIMEOUT_MS = 4_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DB_PROBE_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations");
  if (res.status === 503) return [];
  if (!res.ok) throw new Error("Failed to load conversations");
  const data = (await res.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export async function fetchConversation(id: string): Promise<Conversation> {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) throw new Error("Failed to load conversation");
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
}

export async function createConversationApi(
  title?: string,
): Promise<Conversation> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to create conversation");
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
}

export async function deleteConversationApi(id: string): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete conversation");
}

export async function clearAllConversationsApi(): Promise<void> {
  const res = await fetch("/api/conversations", { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear conversations");
}

export async function addTurnApi(
  conversationId: string,
  turn: {
    query: string;
    contextFilename?: string;
    contextExcerpt?: string;
    result: CouncilResult;
  },
): Promise<Conversation> {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(turn),
  });
  if (!res.ok) throw new Error("Failed to save turn");
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
}

export async function importLocalStorageConversations(
  conversations: Conversation[],
): Promise<number> {
  const res = await fetch("/api/conversations/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversations }),
  });
  if (res.status === 503) return 0;
  if (!res.ok) return 0;
  const data = (await res.json()) as { imported: number };
  return data.imported;
}

export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout("/api/conversations", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
