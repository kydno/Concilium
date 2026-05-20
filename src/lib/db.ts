import { neon } from "@neondatabase/serverless";
import type { Conversation, ConversationTurn, CouncilResult } from "./types";

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(url);
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS turns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          query TEXT NOT NULL,
          context_filename TEXT,
          context_excerpt TEXT,
          result_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_turns_conversation_id ON turns(conversation_id)
      `;
    })();
  }
  await schemaReady;
}

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface TurnRow {
  id: string;
  conversation_id: string;
  query: string;
  context_filename: string | null;
  context_excerpt: string | null;
  result_json: CouncilResult;
  created_at: string;
}

export async function listConversations(): Promise<Conversation[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT c.id, c.title, c.created_at, c.updated_at,
      COALESCE(
        (SELECT COUNT(*)::int FROM turns t WHERE t.conversation_id = c.id),
        0
      ) AS turn_count
    FROM conversations c
    ORDER BY c.updated_at DESC
    LIMIT 50
  `) as Array<ConversationRow & { turn_count: number }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    turns: [],
    turnCount: row.turn_count,
    updatedAt: row.updated_at,
  }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  await ensureSchema();
  const sql = getSql();
  const convRows = (await sql`
    SELECT id, title, created_at, updated_at
    FROM conversations WHERE id = ${id}::uuid
  `) as ConversationRow[];

  if (convRows.length === 0) return null;

  const conv = convRows[0];
  const turnRows = (await sql`
    SELECT id, conversation_id, query, context_filename, context_excerpt, result_json, created_at
    FROM turns WHERE conversation_id = ${id}::uuid
    ORDER BY created_at ASC
  `) as TurnRow[];

  const turns: ConversationTurn[] = turnRows.map((row) => ({
    id: row.id,
    query: row.query,
    contextFilename: row.context_filename ?? undefined,
    contextExcerpt: row.context_excerpt ?? undefined,
    result: row.result_json,
    createdAt: row.created_at,
  }));

  return {
    id: conv.id,
    title: conv.title,
    turns,
    updatedAt: conv.updated_at,
  };
}

export async function createConversation(title: string): Promise<Conversation> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO conversations (title) VALUES (${title})
    RETURNING id, title, created_at, updated_at
  `) as ConversationRow[];

  const row = rows[0];
  return {
    id: row.id,
    title: row.title,
    turns: [],
    updatedAt: row.updated_at,
  };
}

export async function deleteConversationDb(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM conversations WHERE id = ${id}::uuid`;
}

export async function clearAllConversationsDb(): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM turns`;
  await sql`DELETE FROM conversations`;
}

export async function addTurnDb(
  conversationId: string,
  turn: {
    query: string;
    contextFilename?: string;
    contextExcerpt?: string;
    result: CouncilResult;
  },
): Promise<ConversationTurn> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO turns (conversation_id, query, context_filename, context_excerpt, result_json)
    VALUES (
      ${conversationId}::uuid,
      ${turn.query},
      ${turn.contextFilename ?? null},
      ${turn.contextExcerpt ?? null},
      ${JSON.stringify(turn.result)}::jsonb
    )
    RETURNING id, conversation_id, query, context_filename, context_excerpt, result_json, created_at
  `) as TurnRow[];

  await sql`
    UPDATE conversations SET updated_at = now() WHERE id = ${conversationId}::uuid
  `;

  const row = rows[0];
  return {
    id: row.id,
    query: row.query,
    contextFilename: row.context_filename ?? undefined,
    contextExcerpt: row.context_excerpt ?? undefined,
    result: row.result_json,
    createdAt: row.created_at,
  };
}

export async function importConversations(
  conversations: Conversation[],
): Promise<number> {
  await ensureSchema();
  let imported = 0;
  for (const conv of conversations) {
    const created = await createConversation(conv.title || "Imported chat");
    for (const turn of conv.turns) {
      await addTurnDb(created.id, {
        query: turn.query,
        contextFilename: turn.contextFilename,
        contextExcerpt: turn.contextExcerpt,
        result: turn.result,
      });
    }
    imported += 1;
  }
  return imported;
}

export async function conversationCount(): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT COUNT(*)::int AS count FROM conversations`) as Array<{
    count: number;
  }>;
  return rows[0]?.count ?? 0;
}
