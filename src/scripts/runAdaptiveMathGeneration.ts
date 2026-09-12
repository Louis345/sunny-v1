import { loadSunnyRuntimeEnvironment } from "./sunnyMenu";
loadSunnyRuntimeEnvironment();
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getChildChart } from "../profiles/childChart";
import { readPriorConceptIds } from "../engine/assignmentLedger";
import {
  askDirectMathPlanner, askMathExperienceDesigner, buildDirectActiveSessionPlan,
  buildMathCreativeChildContext, generateDirectArtifacts, parseMathLearningProgram,
  repairDirectArtifact,
  persistDirectExperience, buildDirectLearningCycleInput, runDirectBrowserSmokeCheck, mathPlannerCandidateCards, MATH_BROWSER_VERIFIER_VERSION, type DirectPlaywrightReport, type DirectArtifact, type DirectLearningExperiencePlan,
  type MathDesignPacket, type MathLearningProgram,
} from "../engine/directMathExperience";
import { getLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { generateCanonicalProgressionArtifact } from "../engine/canonicalProgressionGenerator";
import { upsertProfileContentCatalog } from "../engine/learningDecisionContext";
import { writeWaterfallContentCatalog } from "../profiles/chartWaterfall";
import {
  acquireMathGenerationLease,
  buildTargetedNodesResumably, getMathGenerationStatus, hashDiscoveryContract,
  publishTargetedBoardProjection, releaseMathGenerationLease, resolveAdaptiveMathDraftDir,
  revealTargetedBoard, writeMathGenerationJob,
  queueTargetedMathGeneration, setMathGenerationPhase,
  updateMathGenerationNode,
} from "../engine/adaptiveMathDiscovery";
import { readAssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import { attachSpellingDiscoveryEvidence, buildAssignmentPlanningPacket, planAssignmentFromSourceWithTelemetry, type AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import { buildSpellingTargetedCycleInput } from "../engine/learningCycleIngest";
import { generateBoardNodeImages } from "../engine/boardNodeImageGenerator";
import { resolveChildContextDir } from "../utils/contextRoot";
import { verifyEngineeringRepairEvidence, DISCOVERY_VERIFIER_VERSION, DISCOVERY_RELEASE_VIEWPORTS } from "../engine/discoveryVisualReview";
import { thumbnailUrlForActivity } from "../shared/activityPresentation";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const write = (file: string, value: unknown): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temp, file); };

function arg(name: string): string {
  const value = process.argv.slice(2).find((part) => part.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`missing_argument:${name}`);
  return value.trim().toLowerCase();
}

export function nativeSpellingInstrumentContract(
  node: ActiveSessionPlan["nodePlan"][number],
  evidenceContract: unknown,
): { version: 1; node: Omit<typeof node, "thumbnailUrl" | "thumbnailPrompt">; evidenceContract: unknown } {
  const { thumbnailUrl: _thumbnailUrl, thumbnailPrompt: _thumbnailPrompt, ...contractNode } = node;
  return { version: 1, node: contractNode, evidenceContract };
}

function placeholderArtifacts(plan: DirectLearningExperiencePlan, childId: string, homeworkId: string, ready: DirectArtifact[]): DirectArtifact[] {
  const byId = new Map(ready.map((artifact) => [artifact.nodeId, artifact]));
  return plan.activities.map((activity) => byId.get(activity.id) ?? {
    childId, homeworkId, nodeId: activity.id, title: activity.title, htmlPath: "", artworkUrl: "",
    creatorPrompt: "pending frozen design implementation", promptHash: "pending", plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", creatorModel: "pending",
  });
}

export async function runAdaptiveMathGeneration(childId: string, homeworkId: string, rootDir = process.cwd()): Promise<void> {
  const draft = resolveAdaptiveMathDraftDir(childId, homeworkId, { rootDir });
  const programFile = path.join(draft, "math-learning-program.json");
  const designFile = path.join(draft, "design-packet.json");
  const planFile = path.join(draft, "designed-plan.json");
  const buildFile = path.join(draft, "candidate-build-v3.json");
  const cycle = getLearningCycle(childId, homeworkId, { rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${homeworkId}`);
  if (cycle.domain === "spelling") return runSpellingTargetedGeneration(childId, homeworkId, rootDir);
  const initialJob = getMathGenerationStatus(childId, homeworkId, { rootDir });
  if (initialJob?.phase === "needs_attention") {
    console.log(` 🎮 [adaptive-math] [worker] [no-work] child=${childId} homework=${homeworkId} phase=${initialJob.phase}`);
    return;
  }
  queueTargetedMathGeneration({rootDir,childId,homeworkId});
  try {
  const extraction = readAssignmentSourceExtraction(path.join(draft, "assignment-extraction.json"));
  const chart = getChildChart(childId, { rootDir });
  const summaryFile = path.join(draft, "discovery-evidence-summary.json");
  const discoveryEvidenceSummary = fs.existsSync(summaryFile)
    ? read<{ summary: unknown }>(summaryFile).summary
    : undefined;
  const program: MathLearningProgram = fs.existsSync(programFile)
    ? parseMathLearningProgram(read(programFile))
    : await askDirectMathPlanner({
      childId,
      chart,
      extraction,
      priorConceptIds: readPriorConceptIds(childId, { rootDir }),
      priorOutcomes: { discoveryCycle: cycle },
      discoveryEvidenceSummary,
      rawResponseFile: path.join(draft, "provider-diagnostics", "targeted-planner-response.json"),
    });
  write(programFile, program);
  if (!fs.existsSync(designFile) || !fs.existsSync(planFile)) setMathGenerationPhase({rootDir,childId,homeworkId,phase:"board_designing"});
  const designed = fs.existsSync(designFile) && fs.existsSync(planFile)
    ? { packet: read<MathDesignPacket>(designFile), plan: read<DirectLearningExperiencePlan>(planFile) }
    : await askMathExperienceDesigner({ childId, program, childContext: buildMathCreativeChildContext(chart), priorOutcomes: { discoveryCycle: cycle }, checkpointFile: path.join(draft, "design-checkpoint.json"), rawResponseDir: path.join(draft, "provider-diagnostics") });
  write(designFile, designed.packet); write(planFile, designed.plan);
  const programHash = hashDiscoveryContract(program);
  const designHash = hashDiscoveryContract(designed.packet);
  let build = fs.existsSync(buildFile) ? read<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }>(buildFile) : { artifacts: [], backgroundUrl: "/generated/adaptive-discovery-background.svg", questArtworkUrl: "", bossArtworkUrl: "" };
  const reportsFile = path.join(draft, "browser-verification.json");
  const reports = fs.existsSync(reportsFile) ? read<Record<string, DirectPlaywrightReport & { htmlHash: string; verifierVersion: number }>>(reportsFile) : {};
  const report = (): DirectPlaywrightReport => ({ passed: designed.plan.activities.every(a => reports[a.id]?.passed), failures: Object.values(reports).flatMap(r => r.failures), screenshots: Object.values(reports).flatMap(r => r.screenshots) });
  const active = () => buildDirectActiveSessionPlan({ childId, homeworkId, plan: designed.plan, artifacts: placeholderArtifacts(designed.plan, childId, homeworkId, build.artifacts), backgroundUrl: build.backgroundUrl, questArtworkUrl: build.questArtworkUrl, bossArtworkUrl: build.bossArtworkUrl, report: report(), companion: { id: chart.companion.presetId, name: chart.companion.displayName } });
  const canonical = () => buildDirectLearningCycleInput({ childId, homeworkId, extraction, plannerPlan: designed.plan, activeSessionPlan: active(), artifacts: placeholderArtifacts(designed.plan, childId, homeworkId, build.artifacts), assumptions: program.assumptions });
  const contract = canonical();
  if (!getLearningCycle(childId, homeworkId, { rootDir })?.adaptiveGeneration?.designHash) {
    revealTargetedBoard({ rootDir, childId, homeworkId, programHash, designHash, nodes: [], nodeContracts: contract.nodes, academicTheory: contract.academicTheory, academicPredictions: contract.academicPredictions, assumptions: contract.assumptions, agencyExperiment: contract.agencyExperiment });
  }
  if (!getMathGenerationStatus(childId, homeworkId, { rootDir })?.programHash) {
    writeMathGenerationJob({ rootDir, childId, homeworkId, programHash, designHash, nodeIds: designed.plan.activities.map(a => a.id) });
  }
  const project = (): void => {
    const status = getMathGenerationStatus(childId, homeworkId, { rootDir });
    publishTargetedBoardProjection({ rootDir, childId, activeSessionPlan: active(), nodeStatuses: Object.fromEntries(status?.nodes.map(n => [n.nodeId, n.status]) ?? []) });
  };
  const verifyAndBind = async (artifact: DirectArtifact): Promise<void> => {
    const htmlHash = crypto.createHash("sha256").update(fs.readFileSync(artifact.htmlPath)).digest("hex");
    if (artifact.htmlHash !== htmlHash) throw new Error(`targeted_artifact_hash_changed:${artifact.nodeId}`);
    artifact.itemIds = designed.plan.activities.find(a => a.id === artifact.nodeId)!.items.map(item => item.id);
    const saved = reports[artifact.nodeId];
    if (!saved?.passed || saved.htmlHash !== htmlHash || saved.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION) {
      reports[artifact.nodeId] = { ...await runDirectBrowserSmokeCheck({ artifacts: [artifact], rootDir }), htmlHash, verifierVersion: MATH_BROWSER_VERIFIER_VERSION };
      write(reportsFile, reports);
    }
    // This journey proves controls and completion, not frozen-answer grading.
    // Do not promote targeted repairs until that separate proof exists.
    verifyEngineeringRepairEvidence(path.join(draft, "provider-diagnostics", `${artifact.nodeId}.engineering-repair.json`), { artifactHash: htmlHash, academicHash: artifact.academicContractHash!, designHash: artifact.designArtifactHash!, verifierVersion: MATH_BROWSER_VERIFIER_VERSION * 1000 + DISCOVERY_VERIFIER_VERSION, runtime: reports[artifact.nodeId].passed, scoring: false, contracts: false, viewports: DISCOVERY_RELEASE_VIEWPORTS.map(viewport => `${viewport.width}x${viewport.height}`) });
    if (!reports[artifact.nodeId].passed) throw new Error(`targeted_browser_verification_failed:${artifact.nodeId}:${reports[artifact.nodeId].failures.join("|")}`);
    const current = getLearningCycle(childId, homeworkId, { rootDir })!;
    const prior = current.nodes.find(n => n.nodeId === artifact.nodeId)!;
    if (prior.artifactBinding?.creativeProvenance?.generatedHtmlHash !== htmlHash || prior.artifactBinding.validationProof?.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION) {
      if (prior.state === "completed" && prior.artifactBinding?.creativeProvenance?.generatedHtmlHash !== htmlHash) throw new Error(`completed_artifact_binding_missing:${artifact.nodeId}`);
      const binding = canonical().nodes.find(n => n.nodeId === artifact.nodeId)!.artifactBinding!;
      binding.validationProof = {engine:"playwright",passed:true,worldStateChanged:true,screenshotPaths:reports[artifact.nodeId].screenshots,htmlHash,verifierVersion:MATH_BROWSER_VERIFIER_VERSION};
      transitionLearningCycle(childId, homeworkId, current.revision, { type: "artifact_bound", nodeId: artifact.nodeId, artifact: binding }, { rootDir });
    }
    console.log(` 🎮 [adaptive-math] [artifact-publication] [verified-bound] node=${artifact.nodeId} hash=${htmlHash}`);
  };
  // Repair interrupted publication from saved artifacts, including old board_ready jobs.
  for (const artifact of build.artifacts) {
    if (getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === artifact.nodeId)?.status === "ready") await verifyAndBind(artifact);
  }
  project();
  await buildTargetedNodesResumably({ rootDir, childId, homeworkId, firstNodeId: designed.plan.activities[0]?.id ?? "", concurrency: 2, buildNode: async (nodeId) => {
    let artifact = build.artifacts.find(a => a.nodeId === nodeId);
    if (artifact && reports[nodeId]?.verifierVersion !== MATH_BROWSER_VERIFIER_VERSION) {
      try { await verifyAndBind(artifact); }
      catch (error) { if (!(error instanceof Error) || !error.message.startsWith("targeted_browser_verification_failed:")) throw error; }
    }
    const repair = Boolean(artifact && reports[nodeId]?.passed === false);
    if (repair && artifact) {
      artifact = await repairDirectArtifact({
        rootDir,
        artifact,
        activity: designed.plan.activities.find(activity => activity.id === nodeId)!,
        failures: reports[nodeId]!.failures,
        screenshotPaths: reports[nodeId]!.screenshots,
        outputDir: path.join(draft, "provider-diagnostics"),
      });
      const merged = new Map(build.artifacts.map(a => [a.nodeId, a]));
      merged.set(nodeId, artifact);
      build = { ...build, artifacts: [...merged.values()] };
      write(buildFile, build);
    } else if (!artifact) {
      const generated = await generateDirectArtifacts({ rootDir, plan: designed.plan, childId, homeworkId, plannerModel: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5", architectModel: process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5", assignmentFingerprint: extraction.fileHash, candidateCards: mathPlannerCandidateCards(chart), existingArtworkUrls: build.artifacts.length ? build : undefined, nodeIds: [nodeId] });
      const merged = new Map(build.artifacts.map(a => [a.nodeId, a]));
      generated.artifacts.forEach(a => merged.set(a.nodeId, a));
      build = { ...generated, artifacts: [...merged.values()] }; write(buildFile, build);
      artifact = merged.get(nodeId);
    }
    if (!artifact?.htmlHash) throw new Error(`targeted_artifact_missing:${nodeId}`);
    await verifyAndBind(artifact);
    return { artifactHash: artifact.htmlHash };
  }, onNodeReady: project });
  if (getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase === "board_ready") {
    persistDirectExperience({ rootDir, childId, homeworkId, extraction, plannerPlan: designed.plan, activeSessionPlan: active(), artifacts: build.artifacts, report: report(), assumptions: program.assumptions });
    project();
    console.log(` 🎮 [adaptive-math] [targeted-board] [ready] child=${childId} homework=${homeworkId}`);
  }
  } catch (error) {
    setMathGenerationPhase({rootDir,childId,homeworkId,phase:"needs_attention",error:error instanceof Error ? error.message : String(error)});
    throw error;
  }
}

/** Native spelling instruments use the same job, publication, and per-node resume machinery. */
async function runSpellingTargetedGeneration(childId: string, homeworkId: string, rootDir: string): Promise<void> {
  const scope = { rootDir, childId, homeworkId };
  const cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
  if (["evaluation_ready", "evaluation_active"].includes(cycle.lifecycle)) throw new Error("spelling_evidence_not_committed");
  const stoppedJob = getMathGenerationStatus(childId, homeworkId, { rootDir });
  if (stoppedJob?.phase === "needs_attention") {
    const publicationOnlyRetry = stoppedJob.nodes.length > 0 && stoppedJob.nodes.every((node) =>
      ["ready", "completed", "evidence_locked"].includes(node.status));
    if (!publicationOnlyRetry) return;
    console.log(` 🎮 [spelling] [targeted-generation] [resuming-publication] homework=${homeworkId}`);
  }
  queueTargetedMathGeneration(scope);
  const draft = resolveAdaptiveMathDraftDir(childId, homeworkId, { rootDir });
  try {
    const requestFile = path.join(draft, "spelling-targeted-request.json");
    const responseFile = path.join(draft, "spelling-targeted-response.json");
    const chart = getChildChart(childId, { rootDir });
    const packet = fs.existsSync(requestFile) ? read<AssignmentPlanningPacket>(requestFile)
      : attachSpellingDiscoveryEvidence(buildAssignmentPlanningPacket({ childId, childChart: chart, extraction: readAssignmentSourceExtraction(path.join(draft, "assignment-extraction.json")) }), chart);
    if (!fs.existsSync(requestFile)) write(requestFile, packet);
    const saved = fs.existsSync(responseFile) ? read<{ result: Awaited<ReturnType<typeof planAssignmentFromSourceWithTelemetry>>; requestHash: string; outputHash: string; createdAt: string }>(responseFile) : undefined;
    if (saved && (saved.requestHash !== hashDiscoveryContract(packet) || saved.outputHash !== hashDiscoveryContract(saved.result))) throw new Error("spelling_targeted_checkpoint_hash_mismatch");
    const result = saved?.result ?? await planAssignmentFromSourceWithTelemetry(packet, { providerReceipt: { draftDir: draft, stage: "spelling-targeted-planner" } });
    const createdAt = saved?.createdAt ?? result.receivedAt ?? new Date().toISOString();
    const normalizedNodePlan = result.output.activeSessionPlan.nodePlan.map((node) => ({
      ...node,
      thumbnailUrl: !node.thumbnailUrl || node.thumbnailUrl.startsWith("/thumbnails/activities/")
        ? thumbnailUrlForActivity(node.activityId ?? node.type)
        : node.thumbnailUrl,
    }));
    const activeBase = {
      ...result.output.activeSessionPlan,
      childId,
      domain: "spelling",
      activeHomeworkId: homeworkId,
      nodePlan: normalizedNodePlan,
      plannedMeasurements: result.output.plannedMeasurements,
      planTheory: result.output.planTheory,
    };
    const authoredBoard = result.output.activeSessionPlan.adventureBoard;
    const active = {
      ...activeBase,
      adventureBoard: authoredBoard
        ? buildAdventureBoardFromActiveSessionPlan({
            plan: activeBase as never,
            boardId: authoredBoard.boardId,
            title: authoredBoard.title,
            theme: authoredBoard.theme,
            layout: authoredBoard.layout,
            plannerRationale: authoredBoard.plannerRationale,
            companion: authoredBoard.companion,
          })
        : undefined,
    };
    const historicalEvidence = Object.entries(packet.discoveryEvidence?.history.constructs ?? {}).flatMap(([construct, entry]) => [...entry.observations.map(row => row.observationId), ...entry.evaluations.map(row => row.evaluationId)].map(id => ({ id, domain: construct.split(".")[0] })));
    const contract = buildSpellingTargetedCycleInput({ cycle, plan: active, now: createdAt, historicalEvidence });
    if (!saved) write(responseFile, { result, requestHash: hashDiscoveryContract(packet), outputHash: hashDiscoveryContract(result), createdAt });
    console.log(` 🎮 [spelling] [targeted-planner] [${saved ? "reused" : "saved"}] homework=${homeworkId}`);
    const programHash = hashDiscoveryContract(result.output), designHash = hashDiscoveryContract(active.adventureBoard);
    let presentation = (await generateBoardNodeImages({ ...scope, plan: active, generateMissing: false })).plan ?? active;
    if (!cycle.adaptiveGeneration?.designHash) revealTargetedBoard({ ...scope, programHash, designHash, nodes: [], nodeContracts: contract.nodes, academicTheory: contract.academicTheory, academicPredictions: contract.academicPredictions });
    if (!getMathGenerationStatus(childId, homeworkId, { rootDir })?.programHash) writeMathGenerationJob({ ...scope, programHash, designHash, nodeIds: active.nodePlan.map(node => node.id) });
    for (const node of contract.nodes.filter(node => node.role === "quest" || node.role === "boss")) {
      if (getMathGenerationStatus(childId, homeworkId, { rootDir })!.nodes.find(row => row.nodeId === node.nodeId)?.status === "preparing") updateMathGenerationNode({ ...scope, nodeId: node.nodeId, status: "evidence_locked" });
    }
    const project = (): void => {
      const currentChart = getChildChart(childId, { rootDir });
      const currentCycle = getLearningCycle(childId, homeworkId, { rootDir })!;
      const existing = new Set(currentChart.contentCatalog.items.map(item => item.contentId));
      const items = currentCycle.nodes.filter(node => node.role !== "evaluation" && node.artifactBinding && !existing.has(node.artifactBinding.contentId)).map(node => ({
        contentId: node.artifactBinding!.contentId, childId, homeworkId, domain: "spelling", type: "game" as const,
        source: node.implementationType === "generated-baseline" ? "generated" as const : "baseline" as const,
        theoryDecisionId: node.theoryId, title: node.title, activityId: node.mechanic, gameHtmlPath: node.artifactBinding!.localArtifactPath,
        algorithmTargets: ["retrieval-practice" as const], targetSkills: [node.academicTarget.skill], targetConcepts: [], targetWords: node.academicTarget.targets, engagementHooks: [],
        inputEvidence: { contentFingerprint: currentCycle.assignment.contentFingerprint, activityEvidenceIds: [...new Set(Object.values(node.evidenceContract.spellingItems ?? {}).flatMap(item => item.lineage.sourceEvidenceIds))] },
        reuseStatus: "candidate" as const, reuseReason: "Planner-selected instrument; subsequent outcomes are needed before reuse decisions.",
      }));
      if (items.length) writeWaterfallContentCatalog(childId, upsertProfileContentCatalog(currentChart.learningProfile, items), { rootDir });
      publishTargetedBoardProjection({ rootDir, childId, activeSessionPlan: presentation, nodeStatuses: Object.fromEntries(getMathGenerationStatus(childId, homeworkId, { rootDir })!.nodes.map(node => [node.nodeId, node.status])) });
    };
    const buildNode = async (nodeId: string) => {
      const node = active.nodePlan.find(node => node.id === nodeId)!;
      const canonical = contract.nodes.find(node => node.nodeId === nodeId)!;
      if (node.type === "generated-baseline") {
        const generated = await generateCanonicalProgressionArtifact({ childId, homeworkId, nodeId }, { rootDir });
        const artifact = generated.nodes.find(row => row.nodeId === nodeId)?.artifactBinding;
        if (!artifact || artifact.validationStatus !== "passed") throw new Error(`spelling_generated_instrument_requires_verified_artifact:${nodeId}`);
        return { artifactHash: artifact.contractFingerprint };
      }
      const configFile = path.join(draft, "native-instruments", `${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
      const configuration = nativeSpellingInstrumentContract(node, canonical.evidenceContract);
      const hash = hashDiscoveryContract(configuration);
      if (fs.existsSync(configFile) && hashDiscoveryContract(read(configFile)) !== hash) {
        const existing = read<{ node?: ActiveSessionPlan["nodePlan"][number]; evidenceContract?: unknown }>(configFile);
        const migrated = existing.node
          ? nativeSpellingInstrumentContract(existing.node, existing.evidenceContract)
          : existing;
        if (hashDiscoveryContract(migrated) !== hash) throw new Error(`spelling_native_contract_changed:${nodeId}`);
        write(configFile, configuration);
        console.log(` 🎮 [spelling] [native-contract] [presentation-metadata-migrated] node=${nodeId}`);
      }
      if (!fs.existsSync(configFile)) write(configFile, configuration);
      const localPath = `/${path.relative(resolveChildContextDir(childId, { rootDir }), configFile).split(path.sep).join("/")}`;
      let activityConfigPath: string | undefined;
      if (canonical.evidenceContract.nativeConfig) {
        const filename = `${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${hashDiscoveryContract(nodeId).slice(0, 8)}.json`;
        const file = path.join(resolveChildContextDir(childId, { rootDir }), "homework/games", homeworkId, filename);
        if (fs.existsSync(file) && hashDiscoveryContract(read(file)) !== hashDiscoveryContract(canonical.evidenceContract.nativeConfig)) throw new Error(`spelling_native_payload_changed:${nodeId}`);
        if (!fs.existsSync(file)) write(file, canonical.evidenceContract.nativeConfig);
        activityConfigPath = `/api/activity-config/${childId}/${homeworkId}/${filename}`;
      }
      const current = getLearningCycle(childId, homeworkId, { rootDir })!;
      const bound = current.nodes.find(row => row.nodeId === nodeId)?.artifactBinding;
      if (bound && bound.contractFingerprint !== hash) throw new Error(`spelling_native_binding_changed:${nodeId}`);
      if (!bound) transitionLearningCycle(childId, homeworkId, current.revision, { type: "artifact_bound", nodeId, artifact: { contentId: `${homeworkId}:${nodeId}`, artifactId: `${homeworkId}:${nodeId}:native`, localArtifactPath: localPath, localArtworkPath: node.thumbnailUrl ?? thumbnailUrlForActivity(node.activityId ?? node.type), ...(activityConfigPath ? { activityConfigPath } : {}), contractFingerprint: hash, validationStatus: "passed" } }, { rootDir });
      return { artifactHash: hash };
    };
    // Reconstitute missing native payload files from the frozen contract before
    // projecting Ready. Existing mismatched bytes fail; no provider is involved.
    for (const ready of getMathGenerationStatus(childId, homeworkId, { rootDir })!.nodes) {
      if (["ready", "completed"].includes(ready.status) && active.nodePlan.find(node => node.id === ready.nodeId)?.type !== "generated-baseline") await buildNode(ready.nodeId);
    }
    project();
    await buildTargetedNodesResumably({ ...scope, firstNodeId: active.nodePlan[0]?.id ?? "", concurrency: 2, buildNode, onNodeReady: project });
    project();
    // Reconnect the existing best-effort illustration stage after playable
    // content is published. Keep artwork outside frozen academic/provider data.
    process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN ||= "8";
    await generateBoardNodeImages({ ...scope, plan: presentation, onPlanUpdated: plan => { presentation = plan; project(); } });
  } catch (error) {
    setMathGenerationPhase({ ...scope, phase: "needs_attention", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

if (require.main === module) {
  const childId = arg("child");
  const homeworkId = arg("homework");
  const lease = acquireMathGenerationLease({ childId, homeworkId });
  if (!lease.acquired || !lease.token) {
    console.log(` 🎮 [adaptive-math] [worker] [duplicate-skipped] child=${childId} homework=${homeworkId}`);
  } else {
    void runAdaptiveMathGeneration(childId, homeworkId)
      .catch((error) => {
        console.error(` 🎮 [adaptive-math] [worker] [paused] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      })
      .finally(() => releaseMathGenerationLease({ childId, homeworkId, token: lease.token! }));
  }
}
