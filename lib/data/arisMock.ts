import { readFile } from "node:fs/promises";
import path from "node:path";

export type ArisProcess = {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
  domain?: string;
  version?: string;
};

export type ArisStep = {
  id: string;
  processId: string;
  type: "step";
  name: string;
  description?: string;
  order?: number;
  lane?: string;
};

export type ArisConnector = {
  id: string;
  processId: string;
  type: "connector";
  fromStepId: string;
  toStepId: string;
  label?: string;
  condition?: string;
};

export type ArisElement = ArisStep | ArisConnector;

function dataPath(fileName: string) {
  return path.join(process.cwd(), "data", fileName);
}

let cache:
  | {
      processes: ArisProcess[];
      elements: ArisElement[];
    }
  | undefined;

async function loadAll() {
  if (cache) return cache;

  const [processesRaw, elementsRaw] = await Promise.all([
    readFile(dataPath("processes.json"), "utf8"),
    readFile(dataPath("steps.json"), "utf8"),
  ]);

  const processes = JSON.parse(processesRaw) as ArisProcess[];
  const elements = JSON.parse(elementsRaw) as ArisElement[];

  cache = { processes, elements };
  return cache;
}

export async function listProcesses() {
  const { processes } = await loadAll();
  return processes;
}

export async function getProcessById(processId: string) {
  const { processes } = await loadAll();
  return processes.find((p) => p.id === processId) ?? null;
}

export async function getProcessGraph(processId: string) {
  const { elements } = await loadAll();
  const steps = elements
    .filter((e): e is ArisStep => e.processId === processId && e.type === "step")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const connectors = elements.filter(
    (e): e is ArisConnector =>
      e.processId === processId && e.type === "connector",
  );

  return { steps, connectors };
}

