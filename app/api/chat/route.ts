import { getChatModel } from "@/lib/ai/model";
import { getProcessGraph } from "@/lib/tools/getProcessGraph";
import { searchProcesses } from "@/lib/tools/searchProcesses";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  zodSchema,
} from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: unknown };
  const uiMessages = (Array.isArray(body.messages) ? body.messages : []) as
    | UIMessage[]
    | unknown[];
  const modelMessages = await convertToModelMessages(uiMessages as UIMessage[]);
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
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
              const candidates = await searchProcesses(userQuestion, 8);
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
              const graph = await getProcessGraph(processId);
              if (!graph) {
                return {
                  error: `Unknown processId: ${processId}`,
                };
              }

              writer.write({
                type: "data-answer_sources",
                data: {
                  sources: [
                    {
                      file: "data/processes.json",
                      ids: [graph.process.id],
                    },
                    {
                      file: "data/steps.json",
                      ids: [
                        ...graph.steps.map((s) => s.id),
                        ...graph.connectors.map((c) => c.id),
                      ],
                    },
                  ],
                },
              });

              return graph;
            },
          }),
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

