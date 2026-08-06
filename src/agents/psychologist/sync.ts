import { runPsychologist } from "./psychologist";
import { buildTodaysPlan, type TodaysPlanningMode } from "./today-plan";
import { childIdFromSessionName, sessionChildNameFromId } from "../../shared/childRegistry";

function childIdToName(childId: string): string {
  const normalized = childId.trim().toLowerCase();
  const sessionName = sessionChildNameFromId(normalized);
  if (!childIdFromSessionName(sessionName)) {
    throw new Error(
      `runPsychologistSync: unknown childId "${childId}"`,
    );
  }
  return sessionName;
}

/**
 * Post-ingest core of `sunny:sync` (full): Psychologist + today's plan.
 * Skips the ingester; used after domain-specific ingests (e.g. homework).
 */
export async function runPsychologistSync(
  childId: string,
  options: { planningMode?: TodaysPlanningMode } = {},
): Promise<void> {
  const normalizedChildId = childId.trim().toLowerCase();
  const childName = childIdToName(childId);
  const planningMode = options.planningMode ?? "review";

  if (planningMode === "homework" && normalizedChildId === "demo-pashley") {
    console.log(
      "\n  🎮 [psychologist-sync] demo-pashley homework — using ingest-written active session plan\n",
    );
    return;
  }

  if (planningMode === "homework") {
    console.log(
      "\n  🎮 [psychologist-sync] homework mode — skipping global curriculum report\n",
    );
  } else {
    await runPsychologist(childName as "Ila" | "Reina", false);
    console.log("\n  ✅ Psychologist complete\n");
  }

  const plan = await buildTodaysPlan(childName as "Ila" | "Reina", {
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
