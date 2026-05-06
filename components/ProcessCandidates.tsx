type Candidate = {
  processId: string;
  title: string;
  shortSummary?: string;
  whyMatched?: string;
};

type CandidatesResult = {
  type: "process_candidates";
  candidates: Candidate[];
};

import { useMemo, useState } from "react";

export function ProcessCandidates({
  parts,
  onSelect,
  initialSelectedId,
}: {
  parts: unknown[];
  onSelect: (candidate: { processId: string; title: string }) => void;
  initialSelectedId?: string | null;
}) {
  const candidates = useMemo(() => {
    const out: Candidate[] = [];
    for (const part of parts) {
      const p = part as {
        type?: string;
        state?: string;
        output?: unknown;
      };

      if (p.type !== "tool-searchProcesses") continue;
      if (p.state !== "output-available") continue;

      const output = p.output as Partial<CandidatesResult> | undefined;
      if (output?.type !== "process_candidates") continue;
      if (!Array.isArray(output.candidates)) continue;

      for (const c of output.candidates) {
        if (!c?.processId || !c.title) continue;
        out.push(c);
      }
    }
    return out;
  }, [parts]);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  );
  const selected = selectedId
    ? candidates.find((c) => c.processId === selectedId) ?? null
    : null;

  if (candidates.length === 0) return null;

  const visible = selected ? [selected] : candidates;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {selected ? "Selected process" : "Choose a process"}
      </div>

      {selected ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700">
          <span className="font-medium">Selected:</span>
          <span>{selected.title}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((c) => (
          <div
            key={c.processId}
            className="rounded-lg border border-zinc-200 bg-white p-3"
          >
            <div className="text-sm font-semibold">{c.title}</div>
            {c.shortSummary ? (
              <div className="mt-1 text-xs leading-5 text-zinc-600">
                {c.shortSummary}
              </div>
            ) : null}
            {c.whyMatched ? (
              <div className="mt-2 text-[11px] text-zinc-500">
                {c.whyMatched}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSelectedId(c.processId);
                onSelect({ processId: c.processId, title: c.title });
              }}
              disabled={Boolean(selected)}
              className={[
                "mt-3 w-full rounded-md px-3 py-2 text-xs font-medium",
                selected
                  ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                  : "bg-zinc-900 text-white hover:bg-zinc-800",
              ].join(" ")}
            >
              {selected ? "Selected" : "Use this process"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

