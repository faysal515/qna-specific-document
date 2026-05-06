import { getProcessById, getProcessGraph as getGraph } from "@/lib/data/arisMock";

export async function getProcessGraph(processId: string) {
  const process = await getProcessById(processId);
  if (!process) return null;

  const { steps, connectors } = await getGraph(processId);

  return {
    process,
    steps,
    connectors,
  };
}

