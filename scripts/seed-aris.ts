import "dotenv/config";
import { collections, getDb } from "@/server/db/mongo";
import { seedArisFromFixtures } from "@/server/db/seedAris";

async function main() {
  await getDb();
  await seedArisFromFixtures();

  const { arisProcesses, arisElements } = await collections();
  const [pCount, eCount] = await Promise.all([
    arisProcesses.estimatedDocumentCount(),
    arisElements.estimatedDocumentCount(),
  ]);

  console.log("[seed] done", { processes: pCount, elements: eCount });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

