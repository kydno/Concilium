"use client";

import type { SubagentView } from "@/lib/subagent-views";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SubagentBarProps {
  agents: SubagentView[] | null;
}

function SubagentModal({
  agent,
  onClose,
}: {
  agent: SubagentView;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subagent-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="subagent-modal-title"
            className="text-lg font-medium text-zinc-100"
          >
            {agent.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              System prompt
            </h3>
            <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-300">
              {agent.systemPrompt}
            </pre>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              User prompt
            </h3>
            <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-300">
              {agent.userPrompt}
            </pre>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Response
            </h3>
            {agent.status === "pending" && (
              <p className="text-sm text-zinc-500">Waiting for response…</p>
            )}
            {agent.status === "error" && (
              <p className="text-sm text-red-400">
                {agent.error ?? "This agent did not respond."}
              </p>
            )}
            {agent.status === "ready" && agent.response && (
              <div className="prose prose-invert prose-sm max-w-none rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 prose-p:leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {agent.response}
                </ReactMarkdown>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function statusDotClass(status: SubagentView["status"]): string {
  switch (status) {
    case "ready":
      return "bg-emerald-500";
    case "error":
      return "bg-red-400";
    default:
      return "bg-zinc-500 animate-pulse";
  }
}

export function SubagentBar({ agents }: SubagentBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!agents || agents.length === 0) return null;

  const openAgent = agents.find((agent) => agent.id === openId) ?? null;

  return (
    <>
      <div className="flex flex-wrap gap-2 border-t border-zinc-800/80 px-6 py-3">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setOpenId(agent.id)}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(agent.status)}`}
              aria-hidden="true"
            />
            {agent.title}
          </button>
        ))}
      </div>

      {openAgent && (
        <SubagentModal agent={openAgent} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
