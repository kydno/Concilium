import { conversationCount, hasDatabase, importConversations } from "@/lib/db";
import type { Conversation } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const importSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      turns: z.array(z.any()),
      updatedAt: z.string(),
    }),
  ),
});

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    const existing = await conversationCount();
    if (existing > 0) {
      return NextResponse.json({ imported: 0, skipped: true });
    }

    const body = await request.json();
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
    }

    const imported = await importConversations(
      parsed.data.conversations as Conversation[],
    );
    return NextResponse.json({ imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
