"use client";

import { MODEL_NAME } from "@/lib/brand";
import type { CouncilPhase } from "./CouncilApp";

interface StatusStripProps {
  phase: CouncilPhase;
  completedMembers: number;
  totalMembers: number;
}

export function StatusStrip({
  phase,
  completedMembers,
  totalMembers,
}: StatusStripProps) {
  if (phase === "idle") return null;

  let label = `Starting ${MODEL_NAME} council…`;
  if (phase === "planning") label = "Assigning roles…";
  if (phase === "deliberating") {
    label = `${MODEL_NAME} deliberating (${completedMembers}/${totalMembers})…`;
  }
  if (phase === "synthesizing") label = "Synthesizing…";
  if (phase === "done") label = "Council complete";

  const progress =
    phase === "planning"
      ? 15
      : phase === "deliberating"
        ? 15 + (completedMembers / Math.max(totalMembers, 1)) * 55
        : phase === "synthesizing"
          ? 85
          : phase === "done"
            ? 100
            : 5;

  return (
    <div className="mb-6 w-full max-w-2xl">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-neutral-900">
        <div
          className="h-full rounded-full bg-neutral-300 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
