import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import {
  askDirectCreativeDirector,
  askDirectMathPlanner,
  buildDirectActiveSessionPlan,
  generateDirectArtifacts,
  parseDirectLearningExperiencePlan,
  persistDirectExperience,
  readDirectCanonicalLearningContext,
  runDirectPlaywrightAcceptance,
  type DirectCreativeRevision,
} from "../engine/directMathExperience";
import { readDirectFeedbackContext } from "../engine/directExperienceFeedback";
import { readPriorConceptIds, writeAssignmentLedgerEntry } from "../engine/assignmentLedger";
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
  console.log("[1/5] Reading assignment");
  const extraction = await extractAssignmentSource(pdf);
  const homeworkId = `hw-math-${crypto.createHash("sha256").update(extraction.fileHash).digest("hex").slice(0, 8)}`;
  const draftDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-drafts", homeworkId);
  const draftFile = path.join(draftDir, "planner-plan.json");
  const creativeRevisionFile = path.join(draftDir, "creative-revision.json");
  const finalPlanFile = path.join(draftDir, "final-plan.json");
  const previousTasteFile = path.join(draftDir, "taste-report.json");
  const chart = getChildChart(childId);
  const priorOutcomes = {
    directExperience: readDirectFeedbackContext(childId),
    canonicalCycle: readDirectCanonicalLearningContext(childId, homeworkId),
  };
  console.log("[2/5] AI planning board and experiences");
  const priorConceptIds = readPriorConceptIds(childId);
  const plannerPlan = flag("resume") && fs.existsSync(draftFile)
    ? parseDirectLearningExperiencePlan(JSON.parse(fs.readFileSync(draftFile, "utf8")))
    : await askDirectMathPlanner({ childId, chart, extraction, priorOutcomes, priorConceptIds });
  fs.mkdirSync(draftDir, { recursive: true });
  fs.writeFileSync(draftFile, `${JSON.stringify(plannerPlan, null, 2)}\n`, "utf8");

  // Record what we believed before any of it was built, so the retro has
  // something to check itself against. This path previously wrote no ledger.
  const ledgerPath = writeAssignmentLedgerEntry({
    childId,
    homeworkId,
    sourceFilename: path.basename(pdf),
    concept: plannerPlan.concept,
    boardSummary: {
      title: plannerPlan.boardWorld.title,
      routeLabels: plannerPlan.fork.routes.map((route) => route.label),
      activityCount: plannerPlan.activities.length,
    },
  });
  console.log(`  📋 Concept "${plannerPlan.concept.conceptId}" → ${path.relative(process.cwd(), ledgerPath)}`);
  let previousTasteReview: unknown = {};
  try {
    previousTasteReview = JSON.parse(fs.readFileSync(previousTasteFile, "utf8"));
  } catch {
    previousTasteReview = {};
  }
  console.log("[3/5] Creative Director enriching experience briefs");
  const directed: { plan: typeof plannerPlan; revision: DirectCreativeRevision } =
    flag("resume") && fs.existsSync(creativeRevisionFile) && fs.existsSync(finalPlanFile)
      ? {
          plan: parseDirectLearningExperiencePlan(JSON.parse(fs.readFileSync(finalPlanFile, "utf8"))),
          revision: JSON.parse(fs.readFileSync(creativeRevisionFile, "utf8")) as DirectCreativeRevision,
        }
      : await askDirectCreativeDirector({
          childId,
          plan: plannerPlan,
          childContext: {
            identity: chart.identity,
            engagementTheory: chart.engagementTheory,
            activityTraitModel: chart.learningProfile.activityTraitModel,
            rewardPreferences: chart.learningProfile.rewardPreferences,
          },
          priorOutcomes: priorOutcomes.directExperience,
          previousTasteReview,
        });
  fs.writeFileSync(creativeRevisionFile, `${JSON.stringify(directed.revision, null, 2)}\n`, "utf8");
  fs.writeFileSync(finalPlanFile, `${JSON.stringify(directed.plan, null, 2)}\n`, "utf8");
  console.log(`[4/5] Building ${directed.plan.activities.length} creatively directed activities`);
  const generated = await generateDirectArtifacts({
    plan: directed.plan,
    childId,
    homeworkId,
    plannerModel: process.env.SUNNY_INGEST_MODEL,
    model: process.env.SUNNY_GENERATION_MODEL,
  });
  console.log("[5/5] Running one Playwright acceptance suite");
  const report = await runDirectPlaywrightAcceptance({
    artifacts: generated.artifacts,
  });
  if (!report.passed) {
    console.log("Update not published.");
    console.log("Existing board was not changed.");
    console.log(report.failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  const activeSessionPlan = buildDirectActiveSessionPlan({ childId, homeworkId, plan: directed.plan, artifacts: generated.artifacts, backgroundUrl: generated.backgroundUrl, questArtworkUrl: generated.questArtworkUrl, bossArtworkUrl: generated.bossArtworkUrl, report });
  const record = persistDirectExperience({ childId, homeworkId, extraction, plannerPlan: directed.plan, activeSessionPlan, artifacts: generated.artifacts, report, creativeRevision: directed.revision });
  console.log("Done — FULL");
  console.log(`Activities: ${generated.artifacts.length} launchable (planner selected)`);
  console.log(`Creative direction: ${directed.revision.rationale}`);
  console.log(`Plan: ${record}`);
  console.log("Next: npm run sunny:homework");
}

main().catch((error) => {
  console.error("Update not published.");
  console.error("Existing board was not changed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
