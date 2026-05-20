import {
  clearAllConversationsDb,
  conversationCount,
  createConversation,
  hasDatabase,
  listConversations,
} from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const DB_TIMEOUT_MS = 4_000;

async function withDbTimeout<T>(operation: Promise<T>): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Database timeout")), DB_TIMEOUT_MS);
    }),
  ]);
}

export async function GET(): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured", conversations: [] },
      { status: 503 },
    );
  }

  try {
    const conversations = await withDbTimeout(listConversations());
    return NextResponse.json({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    const title = parsed.success && parsed.data.title ? parsed.data.title : "New conversation";
    const conversation = await createConversation(title);
    return NextResponse.json({ conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  try {
    await clearAllConversationsDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function HEAD(): Promise<Response> {
  if (!hasDatabase()) {
    return new Response(null, { status: 503 });
  }
  try {
    await withDbTimeout(conversationCount());
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
