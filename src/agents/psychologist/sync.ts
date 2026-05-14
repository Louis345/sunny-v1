import { runPsychologist } from "./psychologist";
import { buildTodaysPlan, type TodaysPlanningMode } from "./today-plan";

function childIdToName(childId: string): "Ila" | "Reina" {
  const s = childId.trim().toLowerCase();
  if (s === "reina") return "Reina";
  if (s === "ila") return "Ila";
  throw new Error(
    `runPsychologistSync: expected childId "ila" or "reina", got "${childId}"`,
  );
}

/**
 * Post-ingest core of `sunny:sync` (full): Psychologist + today's plan.
 * Skips the ingester; used after domain-specific ingests (e.g. homework).
 */
export async function runPsychologistSync(
  childId: string,
  options: { planningMode?: TodaysPlanningMode } = {},
): Promise<void> {
  const childName = childIdToName(childId);
  const planningMode = options.planningMode ?? "review";

  if (planningMode === "homework") {
    console.log(
      "\n  🎮 [psychologist-sync] homework mode — skipping global curriculum report\n",
    );
  } else {
    await runPsychologist(childName, false);
    console.log("\n  ✅ Psychologist complete\n");
  }

  const plan = await buildTodaysPlan(childName, {
    planningMode,
  });
  console.log("\n  ✅ Today's plan written (todays_plan.json)\n");
  console.log(`  📋 ${plan.todaysPlan.length} activities planned`);
  for (const a of plan.todaysPlan) {
    console.log(
      `     ${a.priority}. ${a.activity} [${a.required ? "REQUIRED" : "optional"}]`,
    );
  }
  console.log("");
}
