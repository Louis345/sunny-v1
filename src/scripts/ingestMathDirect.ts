import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import {
  askDirectMathPlanner,
  buildDirectActiveSessionPlan,
  generateDirectArtifacts,
  parseDirectLearningExperiencePlan,
  persistDirectExperience,
  repairDirectArtifactsOnce,
  runDirectAcceptanceRepairLoop,
  runDirectPlaywrightAcceptance,
} from "../engine/directMathExperience";
import {
  interpretPendingDirectExperienceOutcomes,
  readDirectFeedbackContext,
} from "../engine/directExperienceFeedback";
import { getChildChart } from "../profiles/childChart";

function arg(name: string): string {
  const value = process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`missing_argument:${name}`);
  return value;
}

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<void> {
  const childId = arg("child").trim().toLowerCase();
  const pdf = path.resolve(arg("pdf"));
  console.log("[1/4] Reading assignment");
  const extraction = await extractAssignmentSource(pdf);
  const homeworkId = `hw-math-${crypto.createHash("sha256").update(extraction.fileHash).digest("hex").slice(0, 8)}`;
  const draftDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-drafts", homeworkId);
  const draftFile = path.join(draftDir, "planner-plan.json");
  await interpretPendingDirectExperienceOutcomes(childId);
  const priorOutcomes = readDirectFeedbackContext(childId);
  console.log("[2/4] AI planning board and experiences");
  const plannerPlan = flag("resume") && fs.existsSync(draftFile)
    ? parseDirectLearningExperiencePlan(JSON.parse(fs.readFileSync(draftFile, "utf8")))
    : await askDirectMathPlanner({ childId, chart: getChildChart(childId), extraction, priorOutcomes });
  fs.mkdirSync(draftDir, { recursive: true });
  fs.writeFileSync(draftFile, `${JSON.stringify(plannerPlan, null, 2)}\n`, "utf8");
  console.log(`[3/4] Building ${plannerPlan.activities.length} planner-selected activities`);
  const generated = await generateDirectArtifacts({
    plan: plannerPlan,
    childId,
    homeworkId,
    plannerModel: process.env.SUNNY_INGEST_MODEL,
    model: process.env.SUNNY_GENERATION_MODEL,
  });
  console.log("[4/4] Running one Playwright acceptance suite");
  const playwrightOutputDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-playwright", homeworkId);
  const report = await runDirectAcceptanceRepairLoop({
    runAcceptance: () => runDirectPlaywrightAcceptance({ artifacts: generated.artifacts, outputDir: playwrightOutputDir }),
    repair: (failures) => repairDirectArtifactsOnce({ plan: plannerPlan, artifacts: generated.artifacts, failures }),
    maxRepairs: 5,
  });
  if (!report.passed) {
    console.log("Done — BLOCKED");
    console.log(report.failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  const activeSessionPlan = buildDirectActiveSessionPlan({ childId, homeworkId, plan: plannerPlan, artifacts: generated.artifacts, backgroundUrl: generated.backgroundUrl, questArtworkUrl: generated.questArtworkUrl, bossArtworkUrl: generated.bossArtworkUrl, report });
  const record = persistDirectExperience({ childId, homeworkId, extraction, plannerPlan, activeSessionPlan, artifacts: generated.artifacts, report });
  console.log("Done — FULL");
  console.log(`Activities: ${generated.artifacts.length} launchable (planner selected)`);
  console.log(`Plan: ${record}`);
  console.log("Next: npm run sunny:homework");
}

main().catch((error) => {
  console.error("Done — BLOCKED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
