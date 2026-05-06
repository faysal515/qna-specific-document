import { useMemo, useState } from "react";

export type FeedbackValue = {
  rating: 1 | -1;
  comment?: string;
  createdAt?: string;
};

export function MessageFeedback({
  conversationId,
  targetUiMessageId,
  initialFeedback,
  onSaved,
  apiBase,
}: {
  conversationId: string;
  targetUiMessageId: string;
  initialFeedback?: FeedbackValue | null;
  onSaved: (value: FeedbackValue) => void;
  apiBase: string; // e.g. http://localhost:3001
}) {
  const [rating, setRating] = useState<1 | -1 | null>(
    initialFeedback?.rating ?? null,
  );
  const [comment, setComment] = useState(initialFeedback?.comment ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasExisting = Boolean(initialFeedback);

  const label = useMemo(() => {
    if (rating === 1) return "Helpful";
    if (rating === -1) return "Not helpful";
    return "Feedback";
  }, [rating]);

  async function save(nextRating: 1 | -1) {
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          targetUiMessageId,
          rating: nextRating,
          comment: comment.trim().length ? comment.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error("feedback request failed");
      onSaved({
        rating: nextRating,
        comment: comment.trim().length ? comment.trim() : undefined,
        createdAt: new Date().toISOString(),
      });
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="text-xs font-medium text-zinc-700 hover:text-zinc-900"
        >
          {isOpen ? "Close" : hasExisting ? "Edit" : "Add"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRating(1);
            setIsOpen(true);
          }}
          className={[
            "rounded-md border px-3 py-1 text-xs font-medium",
            rating === 1
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
          ].join(" ")}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => {
            setRating(-1);
            setIsOpen(true);
          }}
          className={[
            "rounded-md border px-3 py-1 text-xs font-medium",
            rating === -1
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
          ].join(" ")}
        >
          👎
        </button>
        {initialFeedback?.createdAt ? (
          <div className="ml-auto text-[11px] text-zinc-500">
            saved {new Date(initialFeedback.createdAt).toLocaleString()}
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment (what was missing / wrong?)"
            className="w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            rows={3}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSaving || (rating !== 1 && rating !== -1)}
              onClick={() => {
                if (rating === 1 || rating === -1) void save(rating);
              }}
              className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save feedback"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

