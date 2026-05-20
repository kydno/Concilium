"use client";

import type { Conversation } from "@/lib/types";

interface HistoryModalProps {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onClearAll: () => void;
}

export function HistoryModal({
  open,
  conversations,
  activeId,
  onClose,
  onSelect,
  onDelete,
  onClearAll,
}: HistoryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 id="history-title" className="text-lg font-medium text-neutral-100">
            Conversation history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200"
            aria-label="Close history"
          >
            ×
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-500">
              No saved conversations yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                    conversation.id === activeId ? "bg-neutral-900" : "hover:bg-neutral-900/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(conversation.id);
                      onClose();
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm text-neutral-200">
                      {conversation.title}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {conversation.turns.length} turn
                      {conversation.turns.length === 1 ? "" : "s"} ·{" "}
                      {new Date(conversation.updatedAt).toLocaleString()}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(conversation.id)}
                    className="shrink-0 text-xs text-neutral-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-4">
          <button
            type="button"
            onClick={onClearAll}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Clear all data
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
