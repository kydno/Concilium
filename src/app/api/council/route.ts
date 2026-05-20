import { z } from "zod";
import type { CouncilMode } from "@/lib/council-mode";
import { runRoutedQuery } from "@/lib/run-routed-query";
import type { CouncilEvent } from "@/lib/types";

const councilModeSchema = z.enum(["full", "lite", "single"]);

export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().min(1).max(8000),
  contextText: z.string().max(20000).optional(),
  contextFilename: z.string().max(255).optional(),
  streamSynthesis: z.boolean().optional(),
  priorTurns: z
    .array(
      z.object({
        query: z.string(),
        synthesisMarkdown: z.string(),
        contextFilename: z.string().optional(),
        contextExcerpt: z.string().optional(),
      }),
    )
    .max(5)
    .optional(),
  forceMode: councilModeSchema.optional(),
  /** Dev/benchmark flag: run lite council agent tool loop before chair. */
  agentTask: z.boolean().optional(),
  agentSteps: z.array(z.string().max(200)).max(8).optional(),
});

function formatSse(event: CouncilEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      query,
      contextText,
      contextFilename,
      streamSynthesis,
      priorTurns,
      forceMode,
      agentTask,
      agentSteps,
    } = parsed.data;

    if (streamSynthesis) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: CouncilEvent) => {
            controller.enqueue(encoder.encode(formatSse(event)));
          };

          try {
            await runRoutedQuery({
              query,
              contextText,
              contextFilename,
              priorTurns,
              streamSynthesis: true,
              forceMode: forceMode as CouncilMode | undefined,
              agentTask,
              agentSteps,
              onEvent: send,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Council run failed";
            send({ type: "error", data: { message } });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await runRoutedQuery({
      query,
      contextText,
      contextFilename,
      priorTurns,
      streamSynthesis: false,
      forceMode: forceMode as CouncilMode | undefined,
      agentTask,
      agentSteps,
    });

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
