import { getChildChart } from "../profiles/childChart";
import {
  buildExperiencePlannerInput,
  resolveExperiencePlannerModel,
} from "../engine/experiencePlanner";
import { buildPsychologistPacketAudit } from "../engine/psychologistChartPacket";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function childIdFromArgs(): string {
  const child = argValue("child")?.trim().toLowerCase();
  if (!child) return "ila";
  if (child !== "ila" && child !== "reina" && child !== "demo_adaptive") {
    throw new Error(`Unsupported child for psychologist audit: ${child}`);
  }
  return child;
}

export function runPsychologistPacketAudit(childId = childIdFromArgs()): void {
  const chart = getChildChart(childId);
  const input = buildExperiencePlannerInput(chart);
  const model = resolveExperiencePlannerModel({});
  const audit = buildPsychologistPacketAudit(input, {
    aiEnabled: process.env.SUNNY_AI_EXPERIENCE_PLANNER === "true",
    model,
  });

  console.log(`🎮 [psychologist-audit] [child] ${audit.childId}`);
  console.log(`🎮 [psychologist-audit] [provider] ${audit.provider}`);
  console.log(`🎮 [psychologist-audit] [ai-enabled] ${audit.aiEnabled}`);
  console.log(`🎮 [psychologist-audit] [model] ${audit.model}`);
  console.log(`🎮 [psychologist-audit] [packet-bytes] ${audit.packetBytes}`);
  console.log(`🎮 [psychologist-audit] [active-homework] ${audit.activeHomeworkId ?? "none"}`);
  console.log(`🎮 [psychologist-audit] [care-plan] ${audit.carePlanTheorySummary}`);
  console.log(`🎮 [psychologist-audit] [latest-evidence] ${audit.latestEvidenceSummary}`);
  console.log(`🎮 [psychologist-audit] [latest-trace] ${audit.latestDecisionTraceSummary}`);
  console.log("🎮 [psychologist-audit] [fields-sent]");
  for (const field of audit.fieldsSent) console.log(`  - ${field}`);
  console.log("🎮 [psychologist-audit] [fields-excluded]");
  for (const field of audit.fieldsExcluded) console.log(`  - ${field}`);
  console.log("🎮 [psychologist-audit] [files-read]");
  for (const file of audit.filesRead) console.log(`  - ${file}`);
}

if (require.main === module) {
  runPsychologistPacketAudit();
}
