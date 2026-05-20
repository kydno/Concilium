"use client";

import { ActivityFeed } from "@/components/ActivityFeed";
import { AnimatedTagline } from "@/components/AnimatedTagline";
import { ChatThread } from "@/components/ChatThread";
import { CouncilInput, type UploadState } from "@/components/CouncilInput";
import { Sidebar } from "@/components/Sidebar";
import { SubagentBar } from "@/components/SubagentBar";
import { APP_NAME, MODEL_NAME } from "@/lib/brand";
import {
  addTurnApi,
  clearAllConversationsApi,
  createConversationApi,
  deleteConversationApi,
  fetchConversation,
  fetchConversations,
  importLocalStorageConversations,
  isDatabaseAvailable,
} from "@/lib/conversations-api";
import {
  computeTurnInputTokens,
  DEFAULT_CONTEXT_LIMIT_TOKENS,
  estimateConversationTokens,
  estimateTokens,
  selectPriorTurns,
} from "@/lib/context";
import { resolveSubagentViews } from "@/lib/subagent-views";
import {
  addTurnToConversation,
  clearAllConversations,
  createConversation,
  deleteConversation,
  getActiveConversation,
  loadStorage,
  saveStorage,
  setActiveConversation,
  titleFromQuery,
  upsertConversation,
} from "@/lib/storage";
import type {
  CouncilEvent,
  CouncilPhase,
  CouncilResult as CouncilResultType,
  Conversation,
  MemberResult,
  OrchestratorPlan,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type { CouncilPhase };

const CONTEXT_LIMIT = DEFAULT_CONTEXT_LIMIT_TOKENS;
const CONTEXT_LIMIT_ERROR = `Context limit reached (${Math.round(CONTEXT_LIMIT / 1000)}k). Start a new chat.`;

function parseSseChunk(
  chunk: string,
  onEvent: (event: CouncilEvent) => void,
): void {
  const blocks = chunk.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split("\n");
    let eventType = "message";
    let dataLine = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.slice(5).trim();
      }
    }

    if (!dataLine) continue;

    try {
      const data = JSON.parse(dataLine) as CouncilEvent["data"];
      onEvent({ type: eventType, data } as CouncilEvent);
    } catch {
      // Ignore malformed events
    }
  }
}

async function consumeCouncilStream(
  response: Response,
  onEvent: (event: CouncilEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("No response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      parseSseChunk(`${part}\n\n`, onEvent);
    }
  }

  if (buffer.trim()) {
    parseSseChunk(buffer, onEvent);
  }
}

export function CouncilApp() {
  const [query, setQuery] = useState("");
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [phase, setPhase] = useState<CouncilPhase>("idle");
  const [plan, setPlan] = useState<OrchestratorPlan | null>(null);
  const [members, setMembers] = useState<MemberResult[]>([]);
  const [result, setResult] = useState<CouncilResultType | null>(null);
  const [streamingMarkdown, setStreamingMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [dbEnabled, setDbEnabled] = useState(false);
  const [activeConversation, setActiveConversationState] =
    useState<Conversation | null>(null);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [activityHeadline, setActivityHeadline] = useState("Working");
  const [activityDetail, setActivityDetail] = useState<string | undefined>();
  const [routingLabel, setRoutingLabel] = useState<string | null>(null);
  const [usedTokens, setUsedTokens] = useState(0);
  const [contextBlocked, setContextBlocked] = useState(false);
  const [liveQuery, setLiveQuery] = useState<string | null>(null);
  const [liveContextFilename, setLiveContextFilename] = useState<
    string | undefined
  >();

  const abortRef = useRef<AbortController | null>(null);

  const turnCount = activeConversation?.turns.length ?? 0;
  const hasResults = phase !== "idle" || turnCount > 0 || liveQuery !== null;

  const pendingDocumentTokens = useMemo(
    () => (upload?.text ? estimateTokens(upload.text) : 0),
    [upload],
  );
  const displayUsedTokens = usedTokens + pendingDocumentTokens;
  const isOverLimit = displayUsedTokens >= CONTEXT_LIMIT || contextBlocked;

  const priorTurns = useMemo(
    () => selectPriorTurns(activeConversation?.turns ?? []),
    [activeConversation],
  );

  const latestTurn = activeConversation?.turns.at(-1);

  const subagentViews = useMemo(
    () =>
      resolveSubagentViews({
        liveQuery,
        liveContextFilename,
        upload,
        plan,
        members,
        result,
        priorTurns,
        latestTurn,
        conversationTurns: activeConversation?.turns,
      }),
    [
      liveQuery,
      liveContextFilename,
      upload,
      plan,
      members,
      result,
      priorTurns,
      latestTurn,
      activeConversation?.turns,
    ],
  );

  const refreshConversationList = useCallback(async () => {
    if (dbEnabled) {
      const list = await fetchConversations();
      setAllConversations(list);
      return;
    }
    const state = loadStorage();
    setAllConversations(state.conversations);
  }, [dbEnabled]);

  useEffect(() => {
    async function init() {
      try {
        const dbOk = await isDatabaseAvailable();
        setDbEnabled(dbOk);

        if (dbOk) {
          const localState = loadStorage();
          if (localState.conversations.length > 0) {
            await importLocalStorageConversations(localState.conversations);
          }
          const list = await fetchConversations();
          setAllConversations(list);
          if (list.length > 0) {
            const full = await fetchConversation(list[0].id);
            setActiveConversationState(full);
          }
        } else {
          const state = loadStorage();
          const active = getActiveConversation(state);
          setAllConversations(state.conversations);
          setActiveConversationState(active);
        }
      } catch {
        const state = loadStorage();
        setDbEnabled(false);
        const active = getActiveConversation(state);
        setAllConversations(state.conversations);
        setActiveConversationState(active);
      } finally {
        setStorageLoaded(true);
      }
    }

    void init();
  }, []);

  useEffect(() => {
    const base = estimateConversationTokens(activeConversation?.turns ?? []);
    setUsedTokens(base);
    if (base + pendingDocumentTokens < CONTEXT_LIMIT) {
      setContextBlocked(false);
    }
  }, [activeConversation, pendingDocumentTokens]);

  const persistTurn = useCallback(
    async (
      turnQuery: string,
      councilResult: CouncilResultType,
      filename?: string,
      excerpt?: string,
    ) => {
      if (dbEnabled) {
        let conversation = activeConversation;
        if (!conversation) {
          conversation = await createConversationApi(titleFromQuery(turnQuery));
        }
        const updated = await addTurnApi(conversation.id, {
          query: turnQuery,
          contextFilename: filename,
          contextExcerpt: excerpt,
          result: councilResult,
        });
        setActiveConversationState(updated);
        await refreshConversationList();
        const full = await fetchConversation(updated.id);
        setActiveConversationState(full);
        return;
      }

      let state = loadStorage();
      let conversation = getActiveConversation(state);
      if (!conversation) {
        conversation = createConversation(titleFromQuery(turnQuery));
        state = upsertConversation(state, conversation);
      }
      state = addTurnToConversation(state, conversation.id, {
        query: turnQuery,
        contextFilename: filename,
        contextExcerpt: excerpt,
        result: councilResult,
      });
      saveStorage(state);
      const active = getActiveConversation(state);
      setAllConversations(state.conversations);
      setActiveConversationState(active);
    },
    [activeConversation, dbEnabled, refreshConversationList],
  );

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (
      !trimmed ||
      phase === "planning" ||
      phase === "deliberating" ||
      phase === "synthesizing" ||
      isOverLimit
    ) {
      return;
    }

    const estimatedInput = computeTurnInputTokens({
      query: trimmed,
      contextText: upload?.text,
      priorTurns,
    });

    if (usedTokens + estimatedInput > CONTEXT_LIMIT) {
      setError(CONTEXT_LIMIT_ERROR);
      setContextBlocked(true);
      return;
    }

    setError(null);
    setResult(null);
    setPlan(null);
    setMembers([]);
    setStreamingMarkdown("");
    setPhase("planning");

    const submittedQuery = trimmed;
    const submittedUpload = upload;

    setLiveQuery(submittedQuery);
    setLiveContextFilename(submittedUpload?.filename);
    setRoutingLabel(null);
    setActivityHeadline("Assigning expert lenses");
    setActivityDetail("Reading your question");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: submittedQuery,
          contextText: submittedUpload?.text,
          contextFilename: submittedUpload?.filename,
          streamSynthesis: true,
          priorTurns,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Request failed");
      }

      let finalResult: CouncilResultType | null = null;
      let runningTokens = usedTokens;

      await consumeCouncilStream(response, (event) => {
        if (event.type === "mode") {
          const label =
            event.data.mode === "single"
              ? "Direct answer"
              : event.data.mode === "lite"
                ? "Lite council"
                : "Full council";
          setRoutingLabel(label);
        } else if (event.type === "activity") {
          setActivityHeadline(event.data.headline);
          if (event.data.detail) setActivityDetail(event.data.detail);
        } else if (event.type === "plan") {
          setPlan(event.data);
          setPhase("deliberating");
        } else if (event.type === "member_start") {
          setPhase("deliberating");
          setActivityHeadline(event.data.title);
        } else if (event.type === "member_done") {
          setMembers((current) => {
            const next = [
              ...current.filter((m) => m.id !== event.data.id),
              event.data,
            ];
            return next.sort((a, b) => a.id.localeCompare(b.id));
          });
        } else if (event.type === "usage") {
          const cumulative =
            event.data.cumulative_total ??
            runningTokens + (event.data.total_tokens ?? 0);
          runningTokens = cumulative;
          setUsedTokens(cumulative);
          if (cumulative >= CONTEXT_LIMIT) {
            controller.abort();
            setContextBlocked(true);
            setError(CONTEXT_LIMIT_ERROR);
          }
        } else if (event.type === "synthesis_delta") {
          setPhase("synthesizing");
          setActivityHeadline("Synthesizing answer");
          setStreamingMarkdown((current) => current + event.data.delta);
        } else if (event.type === "done") {
          finalResult = event.data;
          setResult(event.data);
          setPhase("done");
          setActivityHeadline("Complete");
        } else if (event.type === "error") {
          throw new Error(event.data.message);
        }
      });

      if (finalResult && !contextBlocked) {
        await persistTurn(
          submittedQuery,
          finalResult,
          submittedUpload?.filename,
          submittedUpload?.text.slice(0, 500),
        );
      }

      setLiveQuery(null);
      setLiveContextFilename(undefined);
      setQuery("");
      setUpload(null);
    } catch (submitError) {
      setQuery(submittedQuery);
      setLiveQuery(null);
      setLiveContextFilename(undefined);
      if (submitError instanceof Error && submitError.name === "AbortError") {
        if (!contextBlocked) {
          setError(CONTEXT_LIMIT_ERROR);
          setContextBlocked(true);
        }
      } else {
        const message =
          submitError instanceof Error
            ? submitError.message
            : "Something went wrong";
        setError(message);
        setPhase("idle");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const resetChatView = () => {
    setQuery("");
    setUpload(null);
    setResult(null);
    setPlan(null);
    setMembers([]);
    setStreamingMarkdown("");
    setPhase("idle");
    setError(null);
    setLiveQuery(null);
    setLiveContextFilename(undefined);
    setActivityHeadline("Working");
    setActivityDetail(undefined);
    if (!contextBlocked) {
      setUsedTokens(0);
    }
  };

  const handleNewChat = async () => {
    abortRef.current?.abort();
    if (dbEnabled) {
      const created = await createConversationApi("New conversation");
      setActiveConversationState(created);
      await refreshConversationList();
    } else {
      const state = loadStorage();
      const next = setActiveConversation(state, null);
      saveStorage(next);
      setAllConversations(next.conversations);
      setActiveConversationState(null);
    }
    resetChatView();
    setContextBlocked(false);
    setUsedTokens(0);
  };

  const handleSelectConversation = async (conversationId: string) => {
    abortRef.current?.abort();
    resetChatView();
    if (dbEnabled) {
      const full = await fetchConversation(conversationId);
      setActiveConversationState(full);
    } else {
      const state = loadStorage();
      const next = setActiveConversation(state, conversationId);
      saveStorage(next);
      const active = getActiveConversation(next);
      setActiveConversationState(active ?? null);
    }
    setContextBlocked(false);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (dbEnabled) {
      await deleteConversationApi(conversationId);
      await refreshConversationList();
      if (activeConversation?.id === conversationId) {
        setActiveConversationState(null);
        resetChatView();
      }
    } else {
      const state = loadStorage();
      const next = deleteConversation(state, conversationId);
      saveStorage(next);
      setAllConversations(next.conversations);
      const active = getActiveConversation(next);
      setActiveConversationState(active);
      if (!active) {
        resetChatView();
      }
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Delete all saved conversations? This cannot be undone.")) {
      return;
    }
    if (dbEnabled) {
      await clearAllConversationsApi();
      setAllConversations([]);
    } else {
      const next = clearAllConversations();
      saveStorage(next);
      setAllConversations([]);
    }
    setActiveConversationState(null);
    resetChatView();
    setContextBlocked(false);
    setUsedTokens(0);
  };

  if (!storageLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Loading…
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-black text-zinc-100">
      <Sidebar
        conversations={allConversations}
        activeId={activeConversation?.id ?? null}
        onNewChat={() => void handleNewChat()}
        onSelect={(id) => void handleSelectConversation(id)}
        onDelete={(id) => void handleDeleteConversation(id)}
        onClearAll={() => void handleClearAll()}
        dbEnabled={dbEnabled}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-zinc-800/80">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-base font-medium text-zinc-300">{APP_NAME}</p>
              <p className="text-xs text-zinc-600">{MODEL_NAME}</p>
            </div>
          </div>
          <SubagentBar agents={subagentViews} />
        </header>

        <div
          className={`mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col px-6 pb-8 pt-8 ${
            hasResults ? "justify-start" : "justify-center"
          }`}
        >
          {!hasResults && <AnimatedTagline visible={phase === "idle"} />}

          {error && (
            <div className="mb-4 w-full max-w-2xl shrink-0 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <ActivityFeed
            phase={phase}
            headline={activityHeadline}
            serverDetail={
              routingLabel
                ? [routingLabel, activityDetail].filter(Boolean).join(" · ")
                : activityDetail
            }
          />

          {hasResults && (
            <ChatThread
              turns={activeConversation?.turns ?? []}
              liveQuery={liveQuery}
              liveContextFilename={liveContextFilename}
              result={result}
              members={members}
              streamingMarkdown={streamingMarkdown}
              isStreaming={phase === "synthesizing"}
              phase={phase}
            />
          )}

          {plan && phase === "deliberating" && members.length === 0 && (
            <div className="mb-6 w-full max-w-2xl shrink-0 space-y-2">
              {plan.members.map((member) => (
                <div
                  key={member.id}
                  className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-500"
                >
                  Waiting for {member.title}…
                </div>
              ))}
            </div>
          )}

          <div className={hasResults ? "sticky bottom-6 mt-4 shrink-0" : ""}>
            <CouncilInput
              value={query}
              onChange={setQuery}
              onSubmit={() => void handleSubmit()}
              disabled={
                phase === "planning" ||
                phase === "deliberating" ||
                phase === "synthesizing"
              }
              upload={upload}
              onUpload={setUpload}
              compact={hasResults}
              usedTokens={displayUsedTokens}
              documentTokens={pendingDocumentTokens}
              limitTokens={CONTEXT_LIMIT}
              isOverLimit={isOverLimit}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
