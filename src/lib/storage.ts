import type { Conversation, ConversationTurn, StorageState } from "./types";

const LEGACY_STORAGE_KEY = "mercury-council:v1";
export const STORAGE_KEY = "concilium:v1";
export const MAX_CONVERSATIONS = 50;
export const MAX_TURNS_PER_CONVERSATION = 20;

function createId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultState(): StorageState {
  return { activeId: null, conversations: [] };
}

export function loadStorage(): StorageState {
  if (typeof window === "undefined") {
    return defaultState();
  }

  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        raw = legacy;
      }
    }
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as StorageState;
    return {
      activeId: parsed.activeId ?? null,
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations
        : [],
    };
  } catch {
    return defaultState();
  }
}

export function saveStorage(state: StorageState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createConversation(title: string): Conversation {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: title.slice(0, 80) || "New conversation",
    turns: [],
    updatedAt: now,
  };
}

export function getActiveConversation(state: StorageState): Conversation | null {
  if (!state.activeId) return null;
  return state.conversations.find((c) => c.id === state.activeId) ?? null;
}

export function setActiveConversation(
  state: StorageState,
  conversationId: string | null,
): StorageState {
  return { ...state, activeId: conversationId };
}

export function upsertConversation(
  state: StorageState,
  conversation: Conversation,
): StorageState {
  const existingIndex = state.conversations.findIndex(
    (c) => c.id === conversation.id,
  );

  let conversations: Conversation[];
  if (existingIndex >= 0) {
    conversations = [...state.conversations];
    conversations[existingIndex] = conversation;
  } else {
    conversations = [conversation, ...state.conversations];
  }

  conversations = conversations
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, MAX_CONVERSATIONS);

  return {
    activeId: conversation.id,
    conversations,
  };
}

export function addTurnToConversation(
  state: StorageState,
  conversationId: string,
  turn: Omit<ConversationTurn, "id" | "createdAt">,
): StorageState {
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) return state;

  const newTurn: ConversationTurn = {
    ...turn,
    id: createId(),
    createdAt: new Date().toISOString(),
  };

  const updated: Conversation = {
    ...conversation,
    turns: [...conversation.turns, newTurn].slice(-MAX_TURNS_PER_CONVERSATION),
    updatedAt: new Date().toISOString(),
  };

  return upsertConversation(state, updated);
}

export function deleteConversation(
  state: StorageState,
  conversationId: string,
): StorageState {
  const conversations = state.conversations.filter(
    (c) => c.id !== conversationId,
  );
  const activeId =
    state.activeId === conversationId
      ? (conversations[0]?.id ?? null)
      : state.activeId;

  return { activeId, conversations };
}

export function clearAllConversations(): StorageState {
  return defaultState();
}

export function titleFromQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "New conversation";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}
