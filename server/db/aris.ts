import { collections, type ArisElementDoc, type ArisProcessDoc } from "@/server/db/mongo";

export type ProcessCandidate = {
  processId: string;
  title: string;
  shortSummary: string;
  whyMatched: string;
  score: number;
};

export async function searchProcessesDb(userQuestion: string, limit = 5) {
  const { arisProcesses } = await collections();

  const total = await arisProcesses.estimatedDocumentCount();
  console.log("[db] searchProcessesDb", { userQuestion, limit, totalProcesses: total });

  const cursor = arisProcesses
    .find(
      { $text: { $search: userQuestion } },
      {
        projection: {
          processId: 1,
          name: 1,
          description: 1,
          keywords: 1,
          score: { $meta: "textScore" },
        },
      },
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit);

  const docs = (await cursor.toArray()) as Array<
    ArisProcessDoc & { score?: number }
  >;

  console.log("[db] searchProcessesDb textMatches", {
    count: docs.length,
    ids: docs.map((d) => d.processId),
  });

  if (docs.length === 0) {
    // fallback: partial match on name/description
    const fallback = await arisProcesses
      .find(
        {
          $or: [
            { name: { $regex: userQuestion, $options: "i" } },
            { description: { $regex: userQuestion, $options: "i" } },
          ],
        },
        { limit },
      )
      .toArray();

    console.log("[db] searchProcessesDb fallbackMatches", {
      count: fallback.length,
      ids: fallback.map((d) => d.processId),
    });

    return fallback.map((p, idx) => ({
      processId: p.processId,
      title: p.name,
      shortSummary: p.description ?? "",
      whyMatched: "partial match",
      score: Math.max(0, limit - idx),
    }));
  }

  return docs.map((p) => ({
    processId: p.processId,
    title: p.name,
    shortSummary: p.description ?? "",
    whyMatched: "text search match",
    score: p.score ?? 0,
  }));
}

export type ProcessGraph = {
  process: ArisProcessDoc;
  steps: Array<Extract<ArisElementDoc, { type: "step" }>>;
  connectors: Array<Extract<ArisElementDoc, { type: "connector" }>>;
};

export async function getProcessGraphDb(processId: string): Promise<ProcessGraph | null> {
  const { arisProcesses, arisElements } = await collections();

  const process = await arisProcesses.findOne({ processId });
  if (!process) return null;

  const steps = (await arisElements
    .find({ processId, type: "step" })
    .sort({ order: 1 })
    .toArray()) as Array<Extract<ArisElementDoc, { type: "step" }>>;

  const connectors = (await arisElements
    .find({ processId, type: "connector" })
    .toArray()) as Array<Extract<ArisElementDoc, { type: "connector" }>>;

  return { process, steps, connectors };
}

