import type { CouncilMode, PrecisionHint } from "./council-mode";
import type { UserInputProfile } from "./user-input-profile";

export interface CouncilMemberPlan {
  id: string;
  title: string;
  systemPrompt: string;
}

export interface OrchestratorPlan {
  members: CouncilMemberPlan[];
  synthesisFocus: string;
}

export interface MemberResult {
  id: string;
  title: string;
  content: string;
  error?: string;
}

export interface SynthesisResult {
  markdown: string;
  consensus: string[];
  conflicts: string[];
}

export interface CouncilResult {
  plan: OrchestratorPlan;
  members: MemberResult[];
  synthesis: SynthesisResult;
  meta: {
    durationMs: number;
    failedMembers: number;
    userProfile?: UserInputProfile;
    routingMode?: CouncilMode;
    routingReasons?: string[];
    precisionHint?: PrecisionHint;
    councilTokens?: number;
    /** Council path failed; response came from direct single-shot fallback. */
    routingFallback?: boolean;
    /** Deterministic + interactive tool transcript (agent grading). */
    agentTranscript?: string;
    /** Chair synthesis regeneration attempts after the initial call (0–2). */
    chairRetryCount?: number;
  };
}

export interface ConversationTurn {
  id: string;
  query: string;
  contextFilename?: string;
  contextExcerpt?: string;
  result: CouncilResult;
  createdAt: string;
}

/** Prior turns replayed into the council pipeline for follow-up coherence */
export interface PriorTurn {
  query: string;
  synthesisMarkdown: string;
  contextFilename?: string;
  contextExcerpt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  turns: ConversationTurn[];
  updatedAt: string;
  /** Populated on list views when full turns are not loaded */
  turnCount?: number;
}

export interface StorageState {
  activeId: string | null;
  conversations: Conversation[];
}

export type CouncilPhase =
  | "idle"
  | "planning"
  | "deliberating"
  | "synthesizing"
  | "done";

export interface TokenUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cumulative_total?: number;
}

export type CouncilEvent =
  | {
      type: "mode";
      data: {
        mode: CouncilMode;
        reasons: string[];
        precisionHint?: PrecisionHint;
      };
    }
  | { type: "plan"; data: OrchestratorPlan }
  | { type: "activity"; data: { headline: string; detail?: string } }
  | { type: "member_start"; data: { id: string; title: string } }
  | { type: "member_done"; data: MemberResult }
  | { type: "usage"; data: TokenUsagePayload }
  | { type: "synthesis_delta"; data: { delta: string } }
  | { type: "done"; data: CouncilResult }
  | { type: "error"; data: { message: string } };
