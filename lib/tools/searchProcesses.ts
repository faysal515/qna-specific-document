import { listProcesses } from "@/lib/data/arisMock";

export type ProcessCandidate = {
  processId: string;
  title: string;
  shortSummary: string;
  whyMatched: string;
  score: number;
};

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function scoreText(haystack: string, tokens: string[]) {
  const text = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (text.includes(token)) score += 1;
  }
  return score;
}

export async function searchProcesses(userQuestion: string, limit = 5) {
  const processes = await listProcesses();
  const tokens = tokenize(userQuestion);

  const scored: ProcessCandidate[] = processes.map((p) => {
    const nameScore = scoreText(p.name, tokens) * 3;
    const descScore = scoreText(p.description ?? "", tokens) * 1;
    const kwScore = scoreText((p.keywords ?? []).join(" "), tokens) * 2;
    const score = nameScore + descScore + kwScore;

    const whyMatchedParts: string[] = [];
    if (nameScore > 0) whyMatchedParts.push("matches name");
    if (kwScore > 0) whyMatchedParts.push("matches keywords");
    if (descScore > 0) whyMatchedParts.push("matches description");

    return {
      processId: p.id,
      title: p.name,
      shortSummary: p.description ?? "",
      whyMatched:
        whyMatchedParts.length > 0 ? whyMatchedParts.join(", ") : "closest match",
      score,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.score > 0)
    .slice(0, limit);
}

