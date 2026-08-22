import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getChildChart } from "../profiles/childChart";
import { readPriorConceptIds } from "../engine/assignmentLedger";
import {
  askDirectMathPlanner, askMathExperienceDesigner, buildDirectActiveSessionPlan,
  buildMathCreativeChildContext, generateDirectArtifacts, parseMathLearningProgram,
  persistDirectExperience, type DirectArtifact, type DirectLearningExperiencePlan,
  type MathDesignPacket, type MathLearningProgram,
} from "../engine/directMathExperience";
import { getLearningCycle } from "../engine/learningCycleRepository";
import {
  buildTargetedNodesResumably, getMathGenerationStatus, hashDiscoveryContract,
  publishTargetedBoardProjection, revealTargetedBoard, writeMathGenerationJob,
  type TargetedMathNode,
} from "../engine/adaptiveMathDiscovery";
import type { AssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const write = (file: string, value: unknown): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

function arg(name: string): string {
  const value = process.argv.slice(2).find((part) => part.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`missing_argument:${name}`);
  return value.trim().toLowerCase();
}

function placeholderArtifacts(plan: DirectLearningExperiencePlan, childId: string, homeworkId: string, ready: DirectArtifact[]): DirectArtifact[] {
  const byId = new Map(ready.map((artifact) => [artifact.nodeId, artifact]));
  return plan.activities.map((activity) => byId.get(activity.id) ?? {
    childId, homeworkId, nodeId: activity.id, title: activity.title, htmlPath: "", artworkUrl: "",
    creatorPrompt: "pending frozen design implementation", promptHash: "pending", plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", creatorModel: "pending",
  });
}

function targetedNodes(plan: DirectLearningExperiencePlan): TargetedMathNode[] {
  return plan.activities.map((activity) => ({
    nodeId: activity.id, title: activity.title, academicTarget: activity.academicTarget,
    algorithmOwner: "ai_tutor", theoryId: `${plan.planId}:targeted-theory`,
    experimentId: `${plan.planId}:${activity.routeId}:${activity.engagementVariable}`,
    mechanic: activity.mechanic, theme: activity.visualMock.scene, routeId: activity.routeId,
  }));
}

export async function runAdaptiveMathGeneration(childId: string, homeworkId: string, rootDir = process.cwd()): Promise<void> {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const extraction = read<AssignmentSourceExtraction>(path.join(draft, "assignment-extraction.json"));
  const programFile = path.join(draft, "math-learning-program.json");
  const designFile = path.join(draft, "design-packet.json");
  const planFile = path.join(draft, "designed-plan.json");
  const buildFile = path.join(draft, "candidate-build-v3.json");
  const cycle = getLearningCycle(childId, homeworkId, { rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${homeworkId}`);
  const chart = getChildChart(childId, { rootDir });
  const program: MathLearningProgram = fs.existsSync(programFile)
    ? parseMathLearningProgram(read(programFile))
    : await askDirectMathPlanner({ childId, chart, extraction, priorConceptIds: readPriorConceptIds(childId, { rootDir }), priorOutcomes: { discoveryCycle: cycle } });
  write(programFile, program);
  const designed = fs.existsSync(designFile) && fs.existsSync(planFile)
    ? { packet: read<MathDesignPacket>(designFile), plan: read<DirectLearningExperiencePlan>(planFile) }
    : await askMathExperienceDesigner({ childId, program, childContext: buildMathCreativeChildContext(chart), priorOutcomes: { discoveryCycle: cycle }, checkpointFile: path.join(draft, "design-checkpoint.json"), rawResponseDir: path.join(draft, "provider-diagnostics") });
  write(designFile, designed.packet); write(planFile, designed.plan);
  const programHash = hashDiscoveryContract(program);
  const designHash = hashDiscoveryContract(designed.packet);
  const nodes = targetedNodes(designed.plan);
  let job = getMathGenerationStatus(childId, homeworkId, { rootDir });
  if (!job?.programHash) {
    revealTargetedBoard({ rootDir, childId, homeworkId, programHash, designHash, nodes, academicTheory: { theoryId: `${homeworkId}:targeted-theory`, revision: 1, hypothesis: program.academicTheory, supportCriteria: ["Fresh checkpoint evidence supports the intervention."], reviseCriteria: ["Evidence remains mixed or confounded."], falsifyCriteria: ["Fresh independent evidence contradicts the prediction."] }, assumptions: program.assumptions.map((assumption) => ({ ...assumption, createdAt: new Date().toISOString(), lockedAt: new Date().toISOString() })) });
    job = writeMathGenerationJob({ rootDir, childId, homeworkId, programHash, designHash, nodeIds: nodes.map((node) => node.nodeId) });
  }
  let build = fs.existsSync(buildFile) ? read<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }>(buildFile) : { artifacts: [], backgroundUrl: "/generated/adaptive-discovery-background.svg", questArtworkUrl: "", bossArtworkUrl: "" };
  const project = (): void => {
    const plan = buildDirectActiveSessionPlan({ childId, homeworkId, plan: designed.plan, artifacts: placeholderArtifacts(designed.plan, childId, homeworkId, build.artifacts), backgroundUrl: build.backgroundUrl, questArtworkUrl: build.questArtworkUrl, bossArtworkUrl: build.bossArtworkUrl, report: { passed: true, failures: [], screenshots: [] }, companion: { id: chart.companion.presetId, name: chart.companion.displayName } });
    const status = getMathGenerationStatus(childId, homeworkId, { rootDir });
    publishTargetedBoardProjection({ rootDir, childId, activeSessionPlan: plan, nodeStatuses: Object.fromEntries(status?.nodes.map((node) => [node.nodeId, node.status]) ?? []) });
  };
  project();
  await buildTargetedNodesResumably({ rootDir, childId, homeworkId, firstNodeId: nodes[0]?.nodeId ?? "", concurrency: 2, buildNode: async (nodeId) => {
    const generated = await generateDirectArtifacts({ plan: designed.plan, childId, homeworkId, plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5", assignmentFingerprint: extraction.fileHash, existingArtworkUrls: build.artifacts.length ? { backgroundUrl: build.backgroundUrl, questArtworkUrl: build.questArtworkUrl, bossArtworkUrl: build.bossArtworkUrl } : undefined, nodeIds: [nodeId] });
    const merged = new Map(build.artifacts.map((artifact) => [artifact.nodeId, artifact]));
    generated.artifacts.forEach((artifact) => merged.set(artifact.nodeId, artifact));
    build = { ...generated, artifacts: [...merged.values()] }; write(buildFile, build);
    const artifact = merged.get(nodeId); if (!artifact?.htmlHash) throw new Error(`targeted_artifact_missing:${nodeId}`);
    return { artifactHash: artifact.htmlHash };
  }, onNodeReady: async () => project() });
  const finalJob = getMathGenerationStatus(childId, homeworkId, { rootDir });
  if (finalJob?.phase === "board_ready") {
    const active = buildDirectActiveSessionPlan({ childId, homeworkId, plan: designed.plan, artifacts: placeholderArtifacts(designed.plan, childId, homeworkId, build.artifacts), backgroundUrl: build.backgroundUrl, questArtworkUrl: build.questArtworkUrl, bossArtworkUrl: build.bossArtworkUrl, report: { passed: true, failures: [], screenshots: [] }, companion: { id: chart.companion.presetId, name: chart.companion.displayName } });
    persistDirectExperience({ rootDir, childId, homeworkId, extraction, plannerPlan: designed.plan, activeSessionPlan: active, artifacts: build.artifacts, report: { passed: true, failures: [], screenshots: [] }, assumptions: program.assumptions });
    console.log(` 🎮 [adaptive-math] [targeted-board] [ready] child=${childId} homework=${homeworkId}`);
  }
}

if (require.main === module) void runAdaptiveMathGeneration(arg("child"), arg("homework")).catch((error) => { console.error(` 🎮 [adaptive-math] [worker] [paused] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
