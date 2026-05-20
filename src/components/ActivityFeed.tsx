"use client";

import { MODEL_NAME } from "@/lib/brand";
import type { CouncilPhase } from "./CouncilApp";
import { useEffect, useMemo, useState } from "react";

const DETAIL_POOLS: Record<Exclude<CouncilPhase, "idle" | "done">, string[]> = {
  planning: [
    "Assigning expert lenses",
    "Reading your question",
    "Mapping complementary angles",
    "Choosing analysis roles",
  ],
  deliberating: [
    "Planning next moves",
    "Weighing trade-offs",
    "Stress-testing assumptions",
    "Exploring implications",
  ],
  synthesizing: [
    "Merging agent answers",
    "Drafting final answer",
    "Resolving tensions",
    "Sharpening recommendations",
  ],
};

const ROTATE_MS = 5000;

interface ActivityFeedProps {
  phase: CouncilPhase;
  headline: string;
  serverDetail?: string;
}

export function ActivityFeed({
  phase,
  headline,
  serverDetail,
}: ActivityFeedProps) {
  const [poolIndex, setPoolIndex] = useState(0);

  const pool = useMemo(() => {
    if (phase === "idle" || phase === "done") return [];
    return DETAIL_POOLS[phase];
  }, [phase]);

  useEffect(() => {
    if (pool.length === 0) return;
    const timer = setInterval(() => {
      setPoolIndex((current) => (current + 1) % pool.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [pool]);

  useEffect(() => {
    setPoolIndex(0);
  }, [phase, headline]);

  if (phase === "idle" || phase === "done") return null;

  const detail =
    serverDetail ??
    (pool.length > 0 ? pool[poolIndex] : "Working…");

  return (
    <div className="mb-6 w-full max-w-2xl rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:300ms]" />
        </span>
        <p className="text-sm font-medium text-zinc-200">{headline}</p>
        <span className="ml-auto text-xs text-zinc-600">{MODEL_NAME}</span>
      </div>
      <p className="mt-1.5 pl-5 text-sm text-zinc-500 transition-opacity duration-300">
        {detail}
      </p>
    </div>
  );
}
