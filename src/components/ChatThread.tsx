"use client";

import { CouncilResult } from "@/components/CouncilResult";
import { SynthesisMarkdown } from "@/components/SynthesisMarkdown";
import type {
  ConversationTurn,
  CouncilPhase,
  CouncilResult as CouncilResultType,
  MemberResult,
} from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const SCROLL_THRESHOLD_PX = 96;

interface ChatThreadProps {
  turns: ConversationTurn[];
  liveQuery: string | null;
  liveContextFilename?: string;
  result: CouncilResultType | null;
  members: MemberResult[];
  streamingMarkdown: string;
  isStreaming: boolean;
  phase: CouncilPhase;
}

function UserMessage({
  query,
  contextFilename,
}: {
  query: string;
  contextFilename?: string;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-zinc-800 bg-zinc-900/80 px-4 py-3">
        {contextFilename && (
          <p className="mb-1 text-xs text-zinc-500">Attached: {contextFilename}</p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-[1.5] text-zinc-100">
          {query}
        </p>
      </div>
    </div>
  );
}

function AssistantMessage({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-2xl">
      <SynthesisMarkdown>{markdown}</SynthesisMarkdown>
    </div>
  );
}

function ScrollToLatestButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-xs text-zinc-300 shadow-lg backdrop-blur-sm transition hover:border-zinc-600 hover:text-zinc-100"
    >
      Scroll to latest
    </button>
  );
}

export function ChatThread({
  turns,
  liveQuery,
  liveContextFilename,
  result,
  members,
  streamingMarkdown,
  isStreaming,
  phase,
}: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const shouldAutoScrollRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= SCROLL_THRESHOLD_PX;
    shouldAutoScrollRef.current = atBottom;
    setShowScrollButton(!atBottom);
  }, []);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom(turns.length <= 1 ? "auto" : "smooth");
    }
  }, [turns.length, liveQuery, streamingMarkdown, result, phase, scrollToBottom]);

  const showLiveResponse =
    liveQuery !== null &&
    (phase !== "idle" || result !== null || streamingMarkdown.length > 0);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto pr-1"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-4">
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-4">
              <UserMessage
                query={turn.query}
                contextFilename={turn.contextFilename}
              />
              <AssistantMessage markdown={turn.result.synthesis.markdown} />
            </div>
          ))}

          {liveQuery && (
            <div className="space-y-4">
              <UserMessage
                query={liveQuery}
                contextFilename={liveContextFilename}
              />
              {showLiveResponse && (
                <CouncilResult
                  result={result}
                  members={members}
                  streamingMarkdown={streamingMarkdown}
                  isStreaming={isStreaming}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {showScrollButton && (
        <ScrollToLatestButton
          onClick={() => {
            shouldAutoScrollRef.current = true;
            scrollToBottom();
            setShowScrollButton(false);
          }}
        />
      )}
    </div>
  );
}
