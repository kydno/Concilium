import type { UploadState } from "@/components/CouncilInput";
import { selectPriorTurns } from "@/lib/context";
import { buildPriorContext, buildUserPacket } from "@/lib/prompts";
import type {
  ConversationTurn,
  CouncilResult,
  MemberResult,
  OrchestratorPlan,
  PriorTurn,
} from "@/lib/types";

export type SubagentStatus = "pending" | "ready" | "error";

export interface SubagentView {
  id: string;
  title: string;
  systemPrompt: string;
  userPrompt: string;
  response?: string;
  error?: string;
  status: SubagentStatus;
}

function formatMemberUserPrompt(
  userPacket: string,
  priorContext?: string,
): string {
  return priorContext
    ? `--- Prior conversation ---\n${priorContext}\n\n${userPacket}`
    : userPacket;
}

function mergePlanAndMembers(
  plan: OrchestratorPlan,
  members: MemberResult[],
  userPrompt: string,
): SubagentView[] {
  return plan.members.map((memberPlan) => {
    const memberResult = members.find((member) => member.id === memberPlan.id);
    const status: SubagentStatus = memberResult
      ? memberResult.error
        ? "error"
        : "ready"
      : "pending";

    return {
      id: memberPlan.id,
      title: memberPlan.title,
      systemPrompt: memberPlan.systemPrompt,
      userPrompt,
      response: memberResult?.content,
      error: memberResult?.error,
      status,
    };
  });
}

export function resolveSubagentViews(options: {
  liveQuery: string | null;
  liveContextFilename?: string;
  upload: UploadState | null;
  plan: OrchestratorPlan | null;
  members: MemberResult[];
  result: CouncilResult | null;
  priorTurns: PriorTurn[];
  latestTurn?: ConversationTurn;
  conversationTurns?: ConversationTurn[];
}): SubagentView[] | null {
  const priorContext =
    options.priorTurns.length > 0
      ? buildPriorContext(options.priorTurns)
      : undefined;

  if (options.liveQuery) {
    const councilPlan = options.result?.plan ?? options.plan;
    if (!councilPlan) return null;

    const councilMembers = options.result?.members ?? options.members;
    const userPacket = buildUserPacket(
      options.liveQuery,
      options.upload?.text,
      options.upload?.filename ?? options.liveContextFilename,
    );

    return mergePlanAndMembers(
      councilPlan,
      councilMembers,
      formatMemberUserPrompt(userPacket, priorContext),
    );
  }

  const turn = options.latestTurn;
  if (!turn) return null;

  const userPacket = buildUserPacket(
    turn.query,
    turn.contextExcerpt,
    turn.contextFilename,
  );

  const allTurns = options.conversationTurns ?? [];
  const turnIndex = allTurns.findIndex((entry) => entry.id === turn.id);
  const turnsBeforeLatest =
    turnIndex > 0 ? allTurns.slice(0, turnIndex) : allTurns.slice(0, -1);
  const turnPriorContext =
    turnsBeforeLatest.length > 0
      ? buildPriorContext(selectPriorTurns(turnsBeforeLatest))
      : undefined;

  return mergePlanAndMembers(
    turn.result.plan,
    turn.result.members,
    formatMemberUserPrompt(userPacket, turnPriorContext),
  );
}
