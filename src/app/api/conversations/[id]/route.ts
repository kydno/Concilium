import {
  addTurnDb,
  deleteConversationDb,
  getConversation,
  hasDatabase,
} from "@/lib/db";
import type { CouncilResult } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  try {
    const conversation = await getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  try {
    await deleteConversationDb(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const turnSchema = z.object({
  query: z.string().min(1),
  contextFilename: z.string().optional(),
  contextExcerpt: z.string().optional(),
  result: z.custom<CouncilResult>(),
});

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const parsed = turnSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid turn payload" }, { status: 400 });
    }

    const turn = await addTurnDb(id, parsed.data);
    const conversation = await getConversation(id);
    return NextResponse.json({ turn, conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
