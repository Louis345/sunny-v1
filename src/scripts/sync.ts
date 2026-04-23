import "dotenv/config";
import { runIngest } from "../agents/ingester/ingest";
import { runPsychologistSync } from "../agents/psychologist/sync";

function syncChildIdFromEnv(): "ila" | "reina" {
  const raw = (process.env.SUNNY_CHILD ?? "ila").toLowerCase().trim();
  return raw === "reina" ? "reina" : "ila";
}

function syncChildNameFromEnv(): "Ila" | "Reina" {
  return syncChildIdFromEnv() === "reina" ? "Reina" : "Ila";
}

async function sync(mode: "full" | "ingest-only"): Promise<void> {
  const childName = syncChildNameFromEnv();
  const childId = syncChildIdFromEnv();

  console.log(`\n  🔄 Sync — ${mode} for ${childName} (ingest scans all intake folders)\n`);

  await runIngest();
  console.log("\n  ✅ Ingest complete\n");

  if (mode === "ingest-only") return;

  await runPsychologistSync(childId);
}

const mode = process.argv.includes("--quick") ? "ingest-only" : "full";

sync(mode).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
