import { readFile } from "node:fs/promises";
import path from "node:path";
import { collections } from "@/server/db/mongo";

type ProcessJson = {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
};

type StepJson =
  | {
      id: string;
      processId: string;
      type: "step";
      name: string;
      description?: string;
      order?: number;
      lane?: string;
    }
  | {
      id: string;
      processId: string;
      type: "connector";
      fromStepId: string;
      toStepId: string;
      label?: string;
      condition?: string;
    };

export async function seedArisFromFixtures() {
  const { arisProcesses, arisElements } = await collections();

  const processesPath = path.join(process.cwd(), "data", "processes.json");
  const stepsPath = path.join(process.cwd(), "data", "steps.json");

  const [processesRaw, stepsRaw] = await Promise.all([
    readFile(processesPath, "utf8"),
    readFile(stepsPath, "utf8"),
  ]);

  const processes = JSON.parse(processesRaw) as ProcessJson[];
  const elements = JSON.parse(stepsRaw) as StepJson[];

  const now = new Date();

  for (const p of processes) {
    await arisProcesses.updateOne(
      { processId: p.id },
      {
        $set: {
          processId: p.id,
          name: p.name,
          description: p.description,
          keywords: p.keywords ?? [],
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  for (const e of elements) {
    const base = {
      elementId: e.id,
      processId: e.processId,
      type: e.type,
      updatedAt: now,
    } as const;

    const doc =
      e.type === "step"
        ? {
            ...base,
            type: "step" as const,
            name: e.name,
            description: e.description,
            order: e.order,
            lane: e.lane,
          }
        : {
            ...base,
            type: "connector" as const,
            fromStepId: e.fromStepId,
            toStepId: e.toStepId,
            label: e.label,
            condition: e.condition,
          };

    await arisElements.updateOne(
      { elementId: e.id },
      { $set: doc, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }
}

export async function seedArisIfEmpty() {
  const { arisProcesses } = await collections();
  const total = await arisProcesses.estimatedDocumentCount();
  if (total > 0) return { seeded: false, total };

  await seedArisFromFixtures();
  const after = await arisProcesses.estimatedDocumentCount();
  return { seeded: true, total: after };
}

