"use client";

import { SynthesisMarkdown } from "@/components/SynthesisMarkdown";
import type {
  CouncilResult as CouncilResultType,
  MemberResult,
} from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";

const LINE_HEIGHT_CLASS = "leading-[1.5]";

interface CouncilResultProps {
  result: CouncilResultType | null;
  members: MemberResult[];
  streamingMarkdown: string;
  isStreaming: boolean;
}

function AgentCard({ member }: { member: MemberResult }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl bg-neutral-950/80">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between px-4 py-3 text-left ${LINE_HEIGHT_CLASS}`}
      >
        <div>
          <p className="text-sm font-medium text-neutral-200">{member.title}</p>
          {member.error ? (
            <p className="text-xs text-red-400">Failed: {member.error}</p>
          ) : (
            <p className="text-xs text-neutral-500">Agent reasoning</p>
          )}
        </div>
        <span className="text-neutral-500">{open ? "-" : "+"}</span>
      </button>
      {open && (
        <div className={`px-4 pb-3 pt-0 text-sm text-neutral-300 ${LINE_HEIGHT_CLASS}`}>
          {member.error ? (
            <p className="text-red-300">This agent did not respond.</p>
          ) : (
            <div
              className={`prose prose-invert prose-sm max-w-none ${LINE_HEIGHT_CLASS} prose-p:leading-[1.5] prose-li:leading-[1.5]`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {member.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CouncilResult({
  result,
  members,
  streamingMarkdown,
  isStreaming,
}: CouncilResultProps) {
  const markdown = isStreaming
    ? streamingMarkdown
    : (result?.synthesis.markdown ?? "");
  const agentCards = members.length > 0 ? members : (result?.members ?? []);
  const showAgents = agentCards.length > 0;

  if (!markdown && !showAgents) return null;

  return (
    <div className={`w-full max-w-2xl space-y-5 ${LINE_HEIGHT_CLASS}`}>
      {showAgents && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-500">
            Agents
          </h3>
          <div className="space-y-2">
            {agentCards.map((member) => (
              <AgentCard key={member.id} member={member} />
            ))}
          </div>
        </div>
      )}

      <div>
        <SynthesisMarkdown>{markdown}</SynthesisMarkdown>
        {isStreaming && (
          <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-neutral-400" />
        )}
      </div>
    </div>
  );
}
