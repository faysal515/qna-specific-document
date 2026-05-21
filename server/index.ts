import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import dotenv from "dotenv";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  zodSchema,
} from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { getChatModel } from "@/lib/ai/model";
import { searchProcessesDb, getProcessGraphDb } from "@/server/db/aris";
import { collections } from "@/server/db/mongo";
import { seedArisIfEmpty } from "@/server/db/seedAris";

// Load the same env file you use for Next.js local dev.
dotenv.config({ path: ".env" });

type AnswerSources = {
  sources: Array<{ file: string; ids: string[]; note?: string }>;
};

type MyMessageMetadata = {
  answerSources?: AnswerSources;
};

type MyUIMessage = UIMessage<MyMessageMetadata>;

function isChatMessage(
  m: MyUIMessage,
): m is MyUIMessage & { role: "user" | "assistant" } {
  return m.role === "user" || m.role === "assistant";
}

const app = express();

app.use((req, _res, next) => {
  console.log(`[express] ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/conversations/:id", (req: Request, res: Response) => {
  void (async () => {
    const id = String(req.params.id);
    const { messages: msgCol, feedback } = await collections();

    const msgDocs = await msgCol
      .find({ conversationId: id })
      .sort({ createdAt: 1 })
      .toArray();

    const messages = msgDocs.map((d) => ({
      id: d.uiMessageId,
      role: d.role,
      parts: d.parts,
      metadata: d.metadata,
    })) as MyUIMessage[];

    const feedbackDocs = await feedback.find({ conversationId: id }).toArray();

    const feedbackByMessageId: Record<
      string,
      { rating: 1 | -1; comment?: string; createdAt: string }
    > = {};

    for (const f of feedbackDocs) {
      feedbackByMessageId[f.targetUiMessageId] = {
        rating: f.rating,
        comment: f.comment,
        createdAt: f.createdAt.toISOString(),
      };
    }

    res.json({ id, messages, feedbackByMessageId });
  })().catch((err) => {
    console.log("[history] error", err);
    res.status(500).json({ error: "history error" });
  });
});

app.post("/api/feedback", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      conversationId?: unknown;
      targetUiMessageId?: unknown;
      rating?: unknown;
      comment?: unknown;
    };

    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : null;
    const targetUiMessageId =
      typeof body.targetUiMessageId === "string"
        ? body.targetUiMessageId
        : null;
    const rating =
      body.rating === 1 || body.rating === -1 ? (body.rating as 1 | -1) : null;
    const comment =
      typeof body.comment === "string" && body.comment.trim().length > 0
        ? body.comment.trim()
        : undefined;

    if (!conversationId || !targetUiMessageId || !rating) {
      res.status(400).json({ error: "invalid feedback payload" });
      return;
    }

    const { feedback } = await collections();
    const now = new Date();

    await feedback.updateOne(
      { conversationId, targetUiMessageId },
      {
        $set: { rating, comment, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    res.json({ ok: true });
  } catch (err) {
    console.log("[feedback] error", err);
    res.status(500).json({ error: "feedback error" });
  }
});

app.post("/api/chat", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  console.log("[chat] request start");

  const conversationId = String(
    (req.query.conversationId as string | undefined) ?? "default",
  );

  const body = req.body as { messages?: unknown };
  const uiMessages = (Array.isArray(body.messages) ? body.messages : []) as
    | MyUIMessage[]
    | unknown[];

  console.log(`[chat] uiMessages=${uiMessages.length}`);

  const modelMessages = await convertToModelMessages(
    uiMessages as MyUIMessage[],
  );
  console.log(`[chat] modelMessages=${modelMessages.length}`);

  let latestAnswerSources: AnswerSources | undefined;

  const result = streamText({
    model: getChatModel(),
    system: [
      "You are a bank ARIS process assistant.",
      "",
      "Your job is to answer user questions about bank processes.",
      "If the user question is ambiguous, you MUST ask the user to choose the exact process using tool `searchProcesses` and show 3-4 candidates (no long answer yet).",
      "",
      "If the user selects a process, they will send a message like:",
      '{"type":"process_selection","processId":"..."}',
      "When you see that, call tool `getProcessGraph` with that processId, then answer grounded in the returned steps/connectors.",
      "",
      "Keep answers concise and structured. Reference the relevant steps by order/name when possible.",
    ].join("\n"),
    messages: modelMessages,
    stopWhen: stepCountIs(6),
    tools: {
      searchProcesses: tool({
        description:
          "Find the most likely ARIS processes that match the user's question.",
        inputSchema: zodSchema(
          z.object({
            userQuestion: z.string().min(1),
          }),
        ),
        execute: async ({ userQuestion }) => {
          console.log("[tool] searchProcesses", {
            userQuestion:
              userQuestion.length > 160
                ? `${userQuestion.slice(0, 160)}…`
                : userQuestion,
          });
          const candidates = await searchProcessesDb(userQuestion, 8);
          console.log("[tool] searchProcesses result", {
            candidates: candidates.slice(0, 4).map((c) => c.processId),
          });
          return {
            type: "process_candidates" as const,
            candidates: candidates.slice(0, 4).map((c) => ({
              processId: c.processId,
              title: c.title,
              shortSummary: c.shortSummary,
              whyMatched: c.whyMatched,
            })),
          };
        },
      }),
      getProcessGraph: tool({
        description:
          "Load the selected process graph (steps + connectors) by processId.",
        inputSchema: zodSchema(
          z.object({
            processId: z.string().min(1),
          }),
        ),
        execute: async ({ processId }) => {
          console.log("[tool] getProcessGraph", { processId });
          const graph = await getProcessGraphDb(processId);
          if (!graph) {
            console.log("[tool] getProcessGraph error", { processId });
            return {
              error: `Unknown processId: ${processId}`,
            };
          }

          console.log("[tool] getProcessGraph result", {
            steps: graph.steps.length,
            connectors: graph.connectors.length,
          });

          latestAnswerSources = {
            sources: [
              {
                file: "data/processes.json",
                ids: [graph.process.processId],
              },
              {
                file: "data/steps.json",
                ids: [
                  ...graph.steps.map((s) => s.elementId),
                  ...graph.connectors.map((c) => c.elementId),
                ],
              },
            ],
          };

          return graph;
        },
      }),
    },
  });

  result.pipeUIMessageStreamToResponse(res, {
    originalMessages: uiMessages as MyUIMessage[],
    onFinish: ({ messages }) => {
      void (async () => {
        const { conversations, messages: msgCol } = await collections();
        const now = new Date();

        await conversations.updateOne(
          { conversationId },
          { $set: { updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true },
        );

        await msgCol.deleteMany({ conversationId });
        await msgCol.insertMany(
          messages.filter(isChatMessage).map((m, idx) => ({
            conversationId,
            uiMessageId: m.id,
            role: m.role,
            parts: m.parts ?? [],
            metadata: m.metadata,
            createdAt: new Date(now.getTime() + idx),
          })),
        );
      })().catch((err) => console.log("[chat] persist error", err));
    },
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        console.log("[chat] request finished", {
          ms: Date.now() - startedAt,
          totalTokens: part.totalUsage.totalTokens,
          hasSources: Boolean(latestAnswerSources),
        });

        return {
          answerSources: latestAnswerSources,
        };
      }

      return undefined;
    },
    onError: (err) => {
      console.log("[chat] stream error", err);
      return "stream error";
    },
  });
});

const port = Number(process.env.PORT ?? 3001);

async function bootstrap() {
  const { seeded, total } = await seedArisIfEmpty();
  console.log("[db] aris seed", { seeded, totalProcesses: total });

  app.listen(port, () => {
    console.log(`Express server listening on http://localhost:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("[bootstrap] failed", err);
  process.exitCode = 1;
});
