"use client";

import { ProcessCandidates } from "@/components/ProcessCandidates";
import {
  MessageFeedback,
  type FeedbackValue,
} from "@/components/MessageFeedback";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";

type AnswerSources = {
  sources: Array<{ file: string; ids: string[]; note?: string }>;
};

type MyMessageMetadata = {
  answerSources?: AnswerSources;
};

type MyUIMessage = UIMessage<MyMessageMetadata>;

function getText(m: MyUIMessage) {
  return (m.parts ?? [])
    .filter(
      (p): p is { type: "text"; text: string } =>
        (p as { type?: string }).type === "text" &&
        typeof (p as { text?: unknown }).text === "string",
    )
    .map((p) => p.text)
    .join("");
}

function isProcessSelectionUserMessage(m: MyUIMessage) {
  if (m.role !== "user") return false;
  const text = getText(m).trim();
  if (!text.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(text) as { type?: string; processId?: string };
    return (
      parsed?.type === "process_selection" &&
      typeof parsed.processId === "string"
    );
  } catch {
    return false;
  }
}

function getSelectedProcessIdFromUserMessage(m?: MyUIMessage) {
  if (!m) return null;
  if (m.role !== "user") return null;
  const text = getText(m).trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as { type?: string; processId?: string };
    if (
      parsed?.type === "process_selection" &&
      typeof parsed.processId === "string"
    ) {
      return parsed.processId;
    }
    return null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [input, setInput] = useState("");
  const [conversationId] = useState(() => {
    if (typeof window === "undefined") return "default";
    const key = "aris_chat_conversation_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  });

  const baseApi =
    process.env.NEXT_PUBLIC_CHAT_API_URL ?? "http://localhost:3001/api/chat";
  const apiOrigin = baseApi.startsWith("http")
    ? new URL(baseApi).origin
    : "http://localhost:3001";
  const historyApiBase =
    process.env.NEXT_PUBLIC_CHAT_HISTORY_URL ??
    "http://localhost:3001/api/conversations";

  const api = `${baseApi}?conversationId=${encodeURIComponent(conversationId)}`;

  const { messages, setMessages, sendMessage, status } = useChat<MyUIMessage>({
    transport: new DefaultChatTransport({
      api,
    }),
  });

  const uiMessages = messages as MyUIMessage[];
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<
    Record<string, FeedbackValue>
  >({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const url = `${historyApiBase}/${encodeURIComponent(conversationId)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as {
        messages?: MyUIMessage[];
        feedbackByMessageId?: Record<string, FeedbackValue>;
      };
      if (
        !cancelled &&
        Array.isArray(json.messages) &&
        json.messages.length > 0
      ) {
        setMessages(json.messages);
      }
      if (!cancelled && json.feedbackByMessageId) {
        setFeedbackByMessageId(json.feedbackByMessageId);
      }
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, historyApiBase, setMessages]);

  const latestSources = useMemo(() => {
    for (let i = uiMessages.length - 1; i >= 0; i--) {
      const msg = uiMessages[i];
      if (msg.role !== "assistant") continue;
      if (msg.metadata?.answerSources) return msg.metadata.answerSources;
    }
    return null;
  }, [uiMessages]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex flex-col">
            <div className="text-sm font-semibold tracking-tight">
              Process Q&A Interactive Chat
            </div>
            <div className="text-xs text-zinc-600">
              Streaming chat + action buttons + sources
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex flex-1 flex-col gap-3">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
              Ask a question like: “How do I open an account?” or “I want to
              dispute a card transaction.”
            </div>
          ) : null}

          {uiMessages.map((m, idx) =>
            isProcessSelectionUserMessage(m) ? null : (
              <div
                key={m.id}
                className={[
                  "rounded-xl border p-4",
                  m.role === "user"
                    ? "ml-auto w-full max-w-[85%] border-zinc-200 bg-white"
                    : "mr-auto w-full max-w-[85%] border-zinc-200 bg-zinc-50",
                ].join(" ")}
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {m.role}
                </div>

                <div className="whitespace-pre-wrap text-sm leading-6">
                  {getText(m)}
                </div>

                {Array.isArray(m.parts) ? (
                  <div className="mt-3">
                    <ProcessCandidates
                      parts={m.parts}
                      initialSelectedId={getSelectedProcessIdFromUserMessage(
                        uiMessages[idx + 1],
                      )}
                      onSelect={({ processId }) =>
                        sendMessage({
                          text: JSON.stringify({
                            type: "process_selection",
                            processId,
                          }),
                        })
                      }
                    />
                  </div>
                ) : null}

                {m.role === "assistant" && m.metadata?.answerSources ? (
                  <MessageFeedback
                    conversationId={conversationId}
                    targetUiMessageId={m.id}
                    apiBase={apiOrigin}
                    initialFeedback={feedbackByMessageId[m.id] ?? null}
                    onSaved={(value) =>
                      setFeedbackByMessageId((prev) => ({
                        ...prev,
                        [m.id]: value,
                      }))
                    }
                  />
                ) : null}
              </div>
            ),
          )}
        </div>

        {latestSources ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Sources
            </div>
            <div className="mt-2 space-y-2 text-xs text-zinc-700">
              {latestSources.sources.map((s) => (
                <div key={`${s.file}:${s.ids.join(",")}`}>
                  <div className="font-medium">{s.file}</div>
                  <div className="text-zinc-600">
                    ids: {s.ids.slice(0, 20).join(", ")}
                    {s.ids.length > 20 ? " …" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text) return;
            sendMessage({ text });
            setInput("");
          }}
          className="sticky bottom-0 rounded-xl border border-zinc-200 bg-white p-3"
        >
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={status !== "ready"}
              placeholder="Ask about a bank process…"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <button
              type="submit"
              disabled={status !== "ready"}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
