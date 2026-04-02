import "dotenv/config";
import { runIngest } from "../agents/ingester/ingest";
import { runPsychologist } from "../agents/psychologist/psychologist";
import { buildTodaysPlan } from "../agents/psychologist/today-plan";

function syncChildFromEnv(): "Ila" | "Reina" {
  const raw = (process.env.SUNNY_CHILD ?? "ila").toLowerCase().trim();
  return raw === "reina" ? "Reina" : "Ila";
}

async function sync(mode: "full" | "ingest-only"): Promise<void> {
  const childName = syncChildFromEnv();

  console.log(`\n  🔄 Sync — ${mode} for ${childName} (ingest scans all intake folders)\n`);

  await runIngest();
  console.log("\n  ✅ Ingest complete\n");

  if (mode === "ingest-only") return;

  await runPsychologist(childName, false);
  console.log("\n  ✅ Psychologist complete\n");

  const plan = await buildTodaysPlan(childName);
  console.log("\n  ✅ Today's plan written (todays_plan.json)\n");
  console.log(`  📋 ${plan.todaysPlan.length} activities planned`);
  for (const a of plan.todaysPlan) {
    console.log(
      `     ${a.priority}. ${a.activity} [${a.required ? "REQUIRED" : "optional"}]`,
    );
  }
  console.log("");
}

const mode = process.argv.includes("--quick") ? "ingest-only" : "full";

sync(mode).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
