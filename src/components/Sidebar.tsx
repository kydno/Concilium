"use client";

import { APP_NAME } from "@/lib/brand";
import type { Conversation } from "@/lib/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  dbEnabled: boolean;
}

export function Sidebar({
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
  onClearAll,
  dbEnabled,
}: SidebarProps) {
  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-4">
        <p className="text-[1.05rem] font-medium text-zinc-500">
          {APP_NAME}
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-900"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-zinc-600">
            {dbEnabled ? "No conversations yet" : "Using browser storage"}
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <div
                  className={`group flex items-center gap-1 rounded-lg px-2 py-2 ${
                    conversation.id === activeId
                      ? "bg-zinc-900"
                      : "hover:bg-zinc-900/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm text-zinc-200">
                      {conversation.title}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {conversation.turnCount ?? conversation.turns.length} turn
                      {(conversation.turnCount ?? conversation.turns.length) === 1
                        ? ""
                        : "s"}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(conversation.id)}
                    className="shrink-0 px-1 text-xs text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    aria-label="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dbEnabled && conversations.length > 0 && (
        <div className="border-t border-zinc-800 p-3">
          <button
            type="button"
            onClick={onClearAll}
            className="w-full text-left text-xs text-red-400 hover:text-red-300"
          >
            Clear all data
          </button>
        </div>
      )}
    </aside>
  );
}
