import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import {
  askDirectMathPlanner,
  askMathExperienceDesigner,
  buildDirectActiveSessionPlan,
  generateDirectArtifacts,
  generateDirectDesignMocks,
  parseMathLearningProgram,
  persistDirectExperience,
  readDirectCanonicalLearningContext,
  runDirectPlaywrightAcceptance,
  type DirectArtifact,
  type DirectLearningExperiencePlan,
  type MathDesignPacket,
} from "../engine/directMathExperience";
import { readDirectFeedbackContext } from "../engine/directExperienceFeedback";
import { readPriorConceptIds, writeAssignmentLedgerEntry } from "../engine/assignmentLedger";
import { getChildChart } from "../profiles/childChart";

function arg(name: string, required = true): string {
  const value = process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value && required) throw new Error(`missing_argument:${name}`);
  return value ?? "";
}

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const childId = arg("child").trim().toLowerCase();
  const pdf = path.resolve(arg("pdf"));
  console.log("[1/5] Reading assignment and evidence");
  const extraction = await extractAssignmentSource(pdf);
  const homeworkId = `hw-math-${crypto.createHash("sha256").update(extraction.fileHash).digest("hex").slice(0, 8)}`;
  const draftDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-drafts", homeworkId);
  if (flag("fresh")) fs.rmSync(draftDir, { recursive: true, force: true });
  const programFile = path.join(draftDir, "math-learning-program.json");
  const designFile = path.join(draftDir, "design-packet.json");
  const finalPlanFile = path.join(draftDir, "designed-plan.json");
  const buildFile = path.join(draftDir, "candidate-build.json");
  const revisionMarker = path.join(draftDir, "design-revision-used.json");
  const mockDir = path.join(process.cwd(), "outputs", "math-artifact-assembly-line", homeworkId, "mocks");
  const chart = getChildChart(childId);
  const priorOutcomes = {
    directExperience: readDirectFeedbackContext(childId),
    canonicalCycle: readDirectCanonicalLearningContext(childId, homeworkId),
  };

  console.log("[2/5] Planner writing academic prescription");
  const program = flag("resume") && fs.existsSync(programFile)
    ? parseMathLearningProgram(readJson(programFile))
    : await askDirectMathPlanner({
        childId,
        chart,
        extraction,
        priorOutcomes,
        priorConceptIds: readPriorConceptIds(childId),
      });
  writeJson(programFile, program);
  const ledgerPath = writeAssignmentLedgerEntry({
    childId,
    homeworkId,
    sourceFilename: path.basename(pdf),
    concept: { ...program.concept, assumptions: program.assumptions.map((item) => item.claim) },
    boardSummary: { title: program.concept.name, routeLabels: program.fork.routes.map((route) => route.academicRationale), activityCount: program.activities.length },
  });
  console.log(`  📋 ${program.assumptions.length} assumptions locked for launch → ${path.relative(process.cwd(), ledgerPath)}`);

  const revising = flag("revise-designs");
  if (revising && fs.existsSync(revisionMarker)) throw new Error("math_design_revision_budget_exhausted");
  const notesFile = arg("design-notes", false);
  if (revising && !notesFile) throw new Error("missing_argument:design-notes");
  const shouldDesign = revising || !flag("resume") || !fs.existsSync(designFile) || !fs.existsSync(finalPlanFile);
  console.log("[3/5] Creator designing coherent board and node artifacts");
  const designed = shouldDesign
    ? await askMathExperienceDesigner({
        childId,
        program,
        childContext: {
          identity: chart.identity,
          demographics: chart.demographics,
          engagementTheory: chart.engagementTheory,
          activityTraitModel: chart.learningProfile.activityTraitModel,
          rewardPreferences: chart.learningProfile.rewardPreferences,
        },
        priorOutcomes,
        ...(revising ? { designNotes: fs.readFileSync(path.resolve(notesFile), "utf8"), revision: 1 } : {}),
      })
    : {
        packet: readJson<MathDesignPacket>(designFile),
        plan: readJson<DirectLearningExperiencePlan>(finalPlanFile),
      };
  writeJson(designFile, designed.packet);
  writeJson(finalPlanFile, designed.plan);
  if (revising) writeJson(revisionMarker, { usedAt: new Date().toISOString(), notesFile: path.resolve(notesFile) });

  if (!flag("approve-designs")) {
    console.log(`[4/5] Building ${designed.plan.activities.length} lightweight design mocks`);
    fs.rmSync(mockDir, { recursive: true, force: true });
    const mocks = await generateDirectDesignMocks({ plan: designed.plan, packet: designed.packet, outputDir: mockDir });
    console.log("DESIGN_REVIEW_REQUIRED");
    console.log(`Comparison: file://${mocks.comparisonPath}`);
    console.log("Existing board unchanged.");
    console.log(`Approve: rerun with --resume --approve-designs`);
    console.log(`Revise once: rerun with --resume --revise-designs --design-notes=/absolute/path.txt`);
    return;
  }

  console.log(`[4/5] Building ${designed.plan.activities.length} approved activities with bounded concurrency`);
  const generated = flag("resume") && fs.existsSync(buildFile)
    ? readJson<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }>(buildFile)
    : await generateDirectArtifacts({
        plan: designed.plan,
        childId,
        homeworkId,
        plannerModel: process.env.SUNNY_INGEST_MODEL,
        model: process.env.SUNNY_GENERATION_MODEL,
      });
  writeJson(buildFile, generated);

  console.log("[5/5] Running the real-control Playwright journey");
  const report = await runDirectPlaywrightAcceptance({ artifacts: generated.artifacts });
  if (!report.passed) {
    console.log("Done — NEEDS_REVIEW");
    console.log(report.failures.join("\n"));
    console.log("Existing board unchanged.");
    process.exitCode = 1;
    return;
  }

  const activeSessionPlan = buildDirectActiveSessionPlan({
    childId,
    homeworkId,
    plan: designed.plan,
    artifacts: generated.artifacts,
    backgroundUrl: generated.backgroundUrl,
    questArtworkUrl: generated.questArtworkUrl,
    bossArtworkUrl: generated.bossArtworkUrl,
    report,
  });
  const record = persistDirectExperience({
    childId,
    homeworkId,
    extraction,
    plannerPlan: designed.plan,
    activeSessionPlan,
    artifacts: generated.artifacts,
    report,
    assumptions: program.assumptions,
  });
  console.log("Done — FULL");
  console.log(`Activities: ${generated.artifacts.length}`);
  console.log(`Design artifacts: ${designed.packet.artifacts.length} bound`);
  console.log("Playwright: passed");
  console.log("Quest: locked");
  console.log("Boss: locked");
  console.log(`Plan: ${record}`);
}

main().catch((error) => {
  console.error("Existing board was not changed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
