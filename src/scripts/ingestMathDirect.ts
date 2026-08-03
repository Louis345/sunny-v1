import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import {
  askDirectMathPlanner,
  askMathExperienceDesigner,
  buildDirectActiveSessionPlan,
  buildMathCreativeChildContext,
  generateDirectArtifacts,
  parseMathLearningProgram,
  persistDirectExperience,
  readDirectCanonicalLearningContext,
  runDirectBrowserSmokeCheck,
  type DirectArtifact,
  type DirectLearningExperiencePlan,
  type MathDesignCheckpoint,
  mathDesignHasRoutePresentationBindings,
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

function plannerProgramFromDiagnostic(file: string): unknown {
  const diagnostic = readJson<{ content?: Array<{ type?: string; name?: string; input?: unknown }> }>(file);
  return diagnostic.content?.find((block) =>
    block.type === "tool_use" && block.name === "create_math_learning_program")?.input;
}

let currentPhase = "reading-assignment";
let currentCheckpoint = "";

async function main(): Promise<void> {
  const startedAt = Date.now();
  const childId = arg("child").trim().toLowerCase();
  const pdf = path.resolve(arg("pdf"));
  const rebuildNodeIds = arg("rebuild-node", false).split(",").map((value) => value.trim()).filter(Boolean);
  console.log("[1/5] Reading assignment and evidence");
  const extraction = await extractAssignmentSource(pdf);
  const homeworkId = `hw-math-${crypto.createHash("sha256").update(extraction.fileHash).digest("hex").slice(0, 8)}`;
  const draftDir = path.join(process.cwd(), "src", "context", childId, "homework", "direct-drafts", homeworkId);
  if (flag("fresh")) fs.rmSync(draftDir, { recursive: true, force: true });
  const programFile = path.join(draftDir, "math-learning-program.json");
  const plannerDiagnosticFile = path.join(draftDir, "provider-diagnostics", "planner-response.json");
  const designCheckpointFile = path.join(draftDir, "design-checkpoint.json");
  const designFile = path.join(draftDir, "design-packet.json");
  const finalPlanFile = path.join(draftDir, "designed-plan.json");
  const buildFile = path.join(draftDir, "candidate-build-v3.json");
  const chart = getChildChart(childId);
  const priorOutcomes = {
    directExperience: readDirectFeedbackContext(childId),
    canonicalCycle: readDirectCanonicalLearningContext(childId, homeworkId),
  };

  currentCheckpoint = draftDir;
  currentPhase = "academic-planning";
  console.log("[2/5] Planner writing academic prescription");
  const program = fs.existsSync(programFile)
    ? parseMathLearningProgram(readJson(programFile))
    : fs.existsSync(plannerDiagnosticFile)
      ? parseMathLearningProgram(plannerProgramFromDiagnostic(plannerDiagnosticFile))
      : await askDirectMathPlanner({
        childId,
        chart,
        extraction,
        priorOutcomes,
        priorConceptIds: readPriorConceptIds(childId),
        rawResponseFile: plannerDiagnosticFile,
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

  currentPhase = "experience-design";
  const existingDesignPacket = fs.existsSync(designFile) ? readJson<MathDesignPacket>(designFile) : undefined;
  const shouldDesign = !existingDesignPacket || !fs.existsSync(finalPlanFile)
    || !mathDesignHasRoutePresentationBindings(existingDesignPacket);
  console.log("[3/5] Creator designing coherent board and node artifacts");
  const designed = shouldDesign
      ? await askMathExperienceDesigner({
        childId,
        program,
        childContext: buildMathCreativeChildContext(chart),
        priorOutcomes,
        checkpoint: fs.existsSync(designCheckpointFile)
          ? readJson<MathDesignCheckpoint>(designCheckpointFile)
          : undefined,
        checkpointFile: designCheckpointFile,
        rawResponseDir: path.join(draftDir, "provider-diagnostics"),
      })
    : {
        packet: readJson<MathDesignPacket>(designFile),
        plan: readJson<DirectLearningExperiencePlan>(finalPlanFile),
      };
  writeJson(designFile, designed.packet);
  writeJson(finalPlanFile, designed.plan);

  currentPhase = "activity-building";
  console.log(`[4/5] Building ${designed.plan.activities.length} artifact-designed activities with bounded concurrency`);
  const existingBuild = fs.existsSync(buildFile)
    ? readJson<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }>(buildFile)
    : undefined;
  const existingArtworkUrls = existingBuild
    ? {
        backgroundUrl: existingBuild.backgroundUrl,
        questArtworkUrl: existingBuild.questArtworkUrl,
        bossArtworkUrl: existingBuild.bossArtworkUrl,
      }
    : undefined;
  const generated = await generateDirectArtifacts({
    plan: designed.plan,
    childId,
    homeworkId,
    plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
    architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5",
    assignmentFingerprint: extraction.fileHash,
    existingArtworkUrls,
    ...(rebuildNodeIds.length > 0 ? { forceNodeIds: rebuildNodeIds } : {}),
  });
  writeJson(buildFile, generated);

  currentPhase = "runtime-verification";
  console.log("[5/5] Running the opening browser smoke check");
  const report = await runDirectBrowserSmokeCheck({ artifacts: generated.artifacts });
  if (!report.passed) {
    console.warn(`  🎮 [direct-ingest] [runtime-diagnostics] warnings=${report.failures.length}`);
    report.failures.forEach((failure) => console.warn(`    ${failure}`));
  }

  currentPhase = "atomic-publication";
  const activeSessionPlan = buildDirectActiveSessionPlan({
    childId,
    homeworkId,
    plan: designed.plan,
    artifacts: generated.artifacts,
    backgroundUrl: generated.backgroundUrl,
    questArtworkUrl: generated.questArtworkUrl,
    bossArtworkUrl: generated.bossArtworkUrl,
    report,
    companion: {
      id: chart.companion.presetId,
      name: chart.companion.displayName,
    },
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
  console.log(`Browser smoke check: ${report.passed ? "passed" : "diagnostic warnings recorded"}`);
  console.log("Quest: locked");
  console.log("Boss: locked");
  const designCheckpoint = fs.existsSync(designCheckpointFile)
    ? readJson<MathDesignCheckpoint>(designCheckpointFile)
    : undefined;
  const designTokens = designCheckpoint?.attempts.reduce((sum, attempt) => sum + attempt.inputTokens + attempt.outputTokens, 0) ?? 0;
  const buildTokens = generated.artifacts.reduce((sum, artifact) => sum + (artifact.inputTokens ?? 0) + (artifact.outputTokens ?? 0), 0);
  console.log(`Generation: ${Math.round((Date.now() - startedAt) / 1000)}s, ${designTokens + buildTokens} recorded tokens`);
  console.log(`Plan: ${record}`);
}

main().catch((error) => {
  console.error("Provider unavailable — saved progress, automatic resume available");
  console.error("Existing board was not changed.");
  console.error(`Phase: ${currentPhase}`);
  if (currentCheckpoint) console.error(`Checkpoint: ${currentCheckpoint}`);
  console.error(`Reason: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
