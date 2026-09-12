import crypto from "crypto";
import { buildAdventureBoardFromActiveSessionPlan, getAdventureBoardSelectableRoutes } from "../shared/adventureBoardFromPlan";
import type { ActiveSessionPlan, EngagementTheory } from "../context/schemas/learningProfile";
import { getActivityCapabilityMode } from "./activityToolCatalog";
import { hashDiscoveryContract } from "./adaptiveMathDiscovery";
import { validateActivityEngineConfig, validateLetterRushConfig, type ActivityEngineConfig, type LetterRushConfig } from "./activityEngineConfig";
import {
  createLearningCycle,
  getLearningCycle,
  repairInvalidLearningCycleForReingestion,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningCycleSpellingItem,
  type SpellingDiagnosticSelection,
  type LearningCycleRepositoryOptions,
} from "./learningCycleRepository";

export type LearningCycleIngestInput = {
  childId: string;
  homeworkId: string;
  domain: string;
  title: string;
  contentFingerprint: string;
  capturedEvidenceIds: string[];
  targets: string[];
  plan: ActiveSessionPlan;
  engagementTheory: EngagementTheory | null;
};

/** Identity and coverage only. The Planner still owns intervention choices. */
export function buildSpellingRecallItems(input: {
  homeworkId: string;
  words: string[];
  evidenceIds: string[];
  measurementRole: LearningCycleSpellingItem["lineage"]["measurementRole"];
  exposure?: LearningCycleSpellingItem["lineage"]["exposure"];
  occasionId?: string;
}): LearningCycleSpellingItem[] {
  if (!input.homeworkId.trim()) throw new Error("spelling_assignment_identity_missing");
  if (!input.words.length || input.words.some(word => !word.trim())) throw new Error("spelling_targets_missing");
  if (!input.evidenceIds.length || input.evidenceIds.some(id => !id.trim())) throw new Error("spelling_source_evidence_missing");
  const normalized = input.words.map(word => word.normalize("NFC").trim().toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) throw new Error("spelling_target_duplicate");
  return input.words.map((raw, index) => {
    const word = raw.normalize("NFC").trim();
    const identity = crypto.createHash("sha256").update(normalized[index]!).digest("hex").slice(0, 16);
    const wordId = `spelling.word.${identity}`;
    return {
      domain: "spelling",
      id: `${input.homeworkId}:${input.occasionId ?? "discovery"}:${identity}`,
      wordId,
      word,
      constructId: wordId,
      lineage: {
        sourceEvidenceIds: [...input.evidenceIds],
        measurementRole: input.measurementRole,
        exposure: input.exposure ?? "unseen",
      },
      response: { mode: "spelling_letters", acceptedForms: [word], caseSensitive: false },
    };
  });
}

export function createSpellingDiscoveryCycle(input: {
  childId: string;
  homeworkId: string;
  title: string;
  contentFingerprint: string;
  items: LearningCycleSpellingItem[];
  diagnosticSelection?: SpellingDiagnosticSelection;
}, opts: LearningCycleRepositoryOptions = {}): LearningCycleRecordV2 {
  if (!input.items.length) throw new Error("spelling_targets_missing");
  const existing = getLearningCycle(input.childId, input.homeworkId, opts);
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(input.items)).digest("hex");
  if (existing) {
    const oldItems = Object.values(existing.nodes.find(node => node.role === "evaluation")?.evidenceContract.spellingItems ?? {});
    if (existing.domain !== "spelling" || existing.assignment.contentFingerprint !== input.contentFingerprint
      || crypto.createHash("sha256").update(JSON.stringify(oldItems)).digest("hex") !== fingerprint) {
      throw new Error("spelling_discovery_existing_contract_mismatch");
    }
    if (input.diagnosticSelection && hashDiscoveryContract(existing.nodes.find(node => node.role === "evaluation")?.evidenceContract.diagnosticSelection) !== hashDiscoveryContract(input.diagnosticSelection)) throw new Error("spelling_diagnostic_selection_changed");
    return existing;
  }
  const selection = input.diagnosticSelection;
  if (selection) {
    const { decision, instrument, snapshotHash } = selection;
    const mode = getActivityCapabilityMode(instrument.activityId, instrument.modeId);
    if (decision.activityId !== instrument.activityId || decision.modeId !== instrument.modeId
      || snapshotHash !== hashDiscoveryContract({ decision, instrument })
      || mode.independentDiscovery?.protocol !== instrument.protocol
      || hashDiscoveryContract(mode.config) !== hashDiscoveryContract(instrument.config)) throw new Error("spelling_diagnostic_selection_invalid");
  }
  const nodeId = `${input.homeworkId}:discovery`;
  const cycle = createLearningCycle({
    childId: input.childId, homeworkId: input.homeworkId, domain: "spelling",
    assignment: {
      title: input.title, contentFingerprint: input.contentFingerprint,
      capturedEvidenceIds: [...new Set(input.items.flatMap(item => item.lineage.sourceEvidenceIds))],
      targets: input.items.map(item => item.word),
    },
    academicTheory: { theoryId: `${nodeId}:opening`, revision: 1, hypothesis: "The independent starting point remains to be observed.", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
    engagementTheory: null, academicPredictions: [], assumptions: [], initialLifecycle: "evaluation_ready",
    nodes: [{
      nodeId, role: "evaluation", title: input.title, state: "ready", implementationType: "word-radar",
      academicTarget: { domain: "spelling", skill: "independent_recall", targets: input.items.map(item => item.word) },
      algorithmOwner: "independent-probe", theoryId: `${nodeId}:opening`, experimentId: nodeId,
      mechanic: "word-radar", theme: "existing-instrument",
      openingScreen: { title: input.title, purpose: "Show what you can spell before practicing." },
      generationPrompt: null, artifactBinding: null,
      artwork: { status: "pending", localPath: null, prompt: null },
      sfxContract: [], companionContract: { events: ["help_requested"] },
      evidenceContract: {
        academic: true, engagement: true, companionObservations: true,
        spellingItems: Object.fromEntries(input.items.map(item => [item.id, structuredClone(item)])),
        itemRoles: Object.fromEntries(input.items.map(item => [item.id, item.lineage.measurementRole])),
        ...(selection ? { diagnosticSelection: structuredClone(selection) } : {}),
      },
      evidenceIds: [],
    }],
  }, opts);
  console.log(` 🎮 [spelling-discovery] [contract] [saved] homework=${input.homeworkId} items=${input.items.length} hash=${fingerprint}`);
  return cycle;
}

export function buildSpellingDiscoveryPlan(input: { cycle: LearningCycleRecordV2; companion: { id: string; name: string } }): ActiveSessionPlan {
  const { cycle, companion } = input;
  const evaluation = cycle.nodes.find(node => node.role === "evaluation");
  if (cycle.domain !== "spelling" || !evaluation?.evidenceContract.spellingItems) throw new Error("spelling_discovery_contract_missing");
  const selection = evaluation.evidenceContract.diagnosticSelection;
  if (selection && (selection.snapshotHash !== hashDiscoveryContract({ decision: selection.decision, instrument: selection.instrument })
    || selection.instrument.protocol !== "spelling-recall-v1" || selection.instrument.activityId !== "word-radar")) throw new Error("spelling_diagnostic_selection_invalid");
  // Only this native adapter currently implements spelling-recall-v1. This is a
  // runtime binding, not permission to replace a Planner decision with another game.
  const activityId = selection?.instrument.activityId ?? "word-radar";
  const wordRadarConfig = selection ? structuredClone(selection.instrument.config) as unknown as ActiveSessionPlan["nodePlan"][number]["wordRadarConfig"]
    : { recallMode: "hidden_word_recall" as const, inputMode: "keyboard" as const, speakStyle: "option-b" as const, showTimer: false, hideWordDuringResponse: true, requiresCapturedResponse: true };
  const plan: ActiveSessionPlan = {
    planId: `discovery:${cycle.homeworkId}`, childId: cycle.childId, createdAt: cycle.createdAt, source: "ingest_human_loop",
    activeHomeworkId: cycle.homeworkId, domain: "spelling", testDate: null,
    nodePlan: [{ id: evaluation.nodeId, type: "word-radar", activityId, title: "Spelling Discovery", targets: Object.values(evaluation.evidenceContract.spellingItems).map(item => item.word), difficulty: 1, source: selection ? "chart_planner" : "pending_homework", locked: false, targetLane: "independent_discovery", contentId: evaluation.nodeId, wordRadarConfig }],
    learningRoutes: [], variationPolicy: { avoidExactPreviousNodeOrder: false, avoidExactPreviousWordOrder: false, seed: cycle.homeworkId, previousCompletedNodeCount: 0 },
    companionPolicy: { companionId: companion.id, displayName: companion.name, openingLinePolicy: "silent", verbosity: "low", maxMicroProbes: 0 },
    evidenceUsed: cycle.assignment.capturedEvidenceIds.map(id => ({ id, type: "assignment", summary: "Captured school spelling target." })), openQuestions: [], approvalStatus: "approved",
  };
  plan.adventureBoard = buildAdventureBoardFromActiveSessionPlan({ plan: { ...plan, nodePlan: plan.nodePlan.map(node => ({ ...node, wordRadarConfig: node.wordRadarConfig ? { ...node.wordRadarConfig } : undefined })) }, boardId: plan.planId, title: "Spelling Discovery", companion, theme: { background: { type: "solid", value: "#12002e" }, palette: { path: "#fff4c2", completed: "#34d399", available: "#7c3aed", locked: "#64748b", current: "#f59e0b", preview: "#94a3b8", text: "#ffffff", panel: "#12002e" } } });
  return plan;
}

function isLocalAssetPath(value: string | undefined): value is string {
  return Boolean(value?.trim()) && !/^https?:\/\//i.test(value!);
}

function roleForNode(node: ActiveSessionPlan["nodePlan"][number]): LearningCycleNodeContract["role"] {
  if (node.type === "quest" || node.activityId === "quest") return "quest";
  if (node.type === "boss" || node.activityId === "boss") return "boss";
  if (node.type === "mystery" || node.activityId === "mystery") return "mystery";
  return "baseline";
}

function staticTitle(role: LearningCycleNodeContract["role"], proposed: string | undefined): string {
  if (role === "quest") return "Quest";
  if (role === "boss") return "Boss";
  if (role === "mystery") return proposed?.trim() || "Mystery";
  return proposed?.trim() || "Learning Activity";
}

function contractFingerprint(input: {
  node: ActiveSessionPlan["nodePlan"][number];
  role: LearningCycleNodeContract["role"];
  title: string;
  purpose: string;
}): string {
  const value = JSON.stringify({
    role: input.role,
    title: input.title,
    purpose: input.purpose,
    domain: input.node.targetLane,
    targets: input.node.targets,
    mechanic: input.node.mechanic,
    theme: input.node.theme,
    sfxProfile: input.node.sfxProfile,
    companionPolicy: input.node.companionPolicy,
  });
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function sfxContract(profile: string | undefined): string[] {
  const values = profile?.split(/[-,]/g).map((value) => value.trim()).filter(Boolean) ?? [];
  return values.length ? values : ["tap", "correct", "incorrect", "progress", "complete"];
}

function generationPromptForBaseline(
  input: LearningCycleIngestInput,
  node: ActiveSessionPlan["nodePlan"][number],
  title: string,
): LearningCycleNodeContract["generationPrompt"] {
  return {
    promptId: `${input.homeworkId}:${node.id}:ingest-prompt`,
    createdFromEvidenceIds: [...input.capturedEvidenceIds],
    text: [
      `Build ${title} for ${input.title}.`,
      `Domain: ${input.domain}.`,
      `Targets: ${node.targets.join(", ")}.`,
      `Mechanic: ${node.mechanic ?? "planner-selected practice"}.`,
      `Theme: ${node.theme ?? "child-centered learning"}.`,
      "The opening screen, artwork, instructions, interaction, and evidence must all express this same contract.",
    ].join(" "),
  };
}

function nodeContract(
  input: LearningCycleIngestInput,
  node: ActiveSessionPlan["nodePlan"][number],
): LearningCycleNodeContract {
  const role = roleForNode(node);
  const title = staticTitle(role, node.title);
  const skill = node.targetLane?.trim() || (role === "quest" ? `${input.domain}_transfer` : role === "boss" ? `${input.domain}_mastery` : `${input.domain}_practice`);
  const mechanic = node.mechanic?.trim() || (role === "quest" ? "generated-after-baseline" : role === "boss" ? "generated-after-quest" : "configured-practice");
  const purpose = role === "quest"
    ? "Locked until baseline evidence is ready."
    : role === "boss"
      ? "Locked until Quest evidence is ready."
      : role === "mystery"
        ? `Choose a ${input.domain} challenge and record real preference evidence.`
        : `Practice ${skill} through ${mechanic}.`;
  const localArtifact = isLocalAssetPath(node.gameHtmlPath) ? node.gameHtmlPath : undefined;
  const localArtwork = isLocalAssetPath(node.thumbnailUrl) ? node.thumbnailUrl : undefined;
  const canBind = role === "baseline" && Boolean(localArtifact && localArtwork && node.contentId);
  const fingerprint = contractFingerprint({ node, role, title, purpose });
  const artifactBinding = canBind
    ? {
        contentId: node.contentId!,
        artifactId: `${node.contentId}:artifact`,
        localArtifactPath: localArtifact!,
        localArtworkPath: localArtwork!,
        ...(node.activityConfigPath ? { activityConfigPath: node.activityConfigPath } : {}),
        contractFingerprint: fingerprint,
        validationStatus: "passed" as const,
      }
    : null;
  const state: LearningCycleNodeContract["state"] = role === "quest" || role === "boss"
    ? "locked"
    : role === "mystery"
      ? "ready"
      : artifactBinding
        ? "ready"
        : "blocked";
  return {
    nodeId: node.id,
    role,
    title,
    state,
    academicTarget: {
      domain: input.domain,
      skill,
      targets: [...node.targets],
    },
    algorithmOwner: role === "quest" || role === "boss" ? "mastery-gating" : role === "mystery" ? "activity-affinity" : "retrieval-practice",
    theoryId: node.theoryId ?? input.plan.planTheory?.hypothesis ?? `${input.homeworkId}:academic-theory`,
    experimentId: node.experimentId ?? `${input.homeworkId}:experiment:${node.id}`,
    mechanic,
    theme: node.theme?.trim() || (role === "quest" || role === "boss" ? "pending" : "learning adventure"),
    openingScreen: { title, purpose },
    generationPrompt: role === "baseline" ? generationPromptForBaseline(input, node, title) : null,
    artifactBinding,
    artwork: localArtwork
      ? { status: "ready", localPath: localArtwork, prompt: node.thumbnailPrompt ?? null }
      : role === "quest" || role === "boss"
        ? {
            status: "placeholder",
            localPath: role === "quest" ? "/generated/adventure-board-demo/quest.jpeg" : "/generated/adventure-board-demo/boss.jpeg",
            prompt: null,
          }
        : { status: "failed", localPath: null, prompt: node.thumbnailPrompt ?? null },
    sfxContract: sfxContract(node.sfxProfile),
    companionContract: { events: ["correct_answer", "wrong_answer", "session_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

export function buildLearningCycleInputFromPlan(input: LearningCycleIngestInput): CreateLearningCycleInput {
  const planTheory = input.plan.planTheory;
  return {
    childId: input.childId.trim().toLowerCase(),
    homeworkId: input.homeworkId,
    domain: input.domain,
    assignment: {
      title: input.title,
      contentFingerprint: input.contentFingerprint,
      capturedEvidenceIds: [...input.capturedEvidenceIds],
      targets: [...input.targets],
    },
    academicTheory: {
      theoryId: input.plan.nodePlan.find((node) => node.theoryId)?.theoryId ?? `${input.homeworkId}:academic-theory`,
      revision: 1,
      hypothesis: planTheory?.hypothesis ?? "Measure the captured assignment before claiming learning.",
      supportCriteria: planTheory?.supportCriteria ?? ["required evidence supports the hypothesis"],
      reviseCriteria: planTheory?.reviseCriteria ?? ["evidence is mixed or support is insufficient"],
      falsifyCriteria: planTheory?.falsifyCriteria ?? ["observed outcomes contradict the hypothesis"],
    },
    engagementTheory: input.engagementTheory,
    nodes: input.plan.nodePlan.map((node) => nodeContract(input, node)),
  };
}

/** Validate the Planner's decisions; never select teaching from score thresholds. */
export function buildSpellingTargetedCycleInput(input: {
  cycle: LearningCycleRecordV2; plan: ActiveSessionPlan; now: string; historicalEvidence?: Array<{ id: string; domain: string }>;
}): CreateLearningCycleInput {
  const { cycle, plan } = input;
  if (cycle.domain !== "spelling" || plan.domain !== "spelling" || plan.activeHomeworkId !== cycle.homeworkId) throw new Error("spelling_plan_identity_mismatch");
  const captured = Object.values(cycle.nodes.find(node => node.role === "evaluation")?.evidenceContract.spellingItems ?? {});
  const words = new Map(captured.map(item => [item.word.toLocaleLowerCase("en-US"), item]));
  const evidence = new Set([...cycle.assignment.capturedEvidenceIds, ...cycle.observations.map(row => row.observationId), ...(input.historicalEvidence ?? []).filter(row => row.domain === "spelling").map(row => row.id)]);
  const cleanIndependentMisses = captured.filter((item) => {
    const independent = cycle.observations.filter((observation) =>
      observation.itemId === item.id &&
      observation.provenance === "independent_probe" &&
      observation.assistance.status === "unassisted" &&
      !observation.result.observedErrorType);
    return independent.some((observation) => observation.result.correct === false)
      && !independent.some((observation) => observation.result.correct === true);
  });
  if (cleanIndependentMisses.length > 0) {
    const missedWords = new Set(cleanIndependentMisses.map((item) => item.word.toLocaleLowerCase("en-US")));
    const practiceNodes = plan.nodePlan.filter((node) => {
      const role = plan.plannedMeasurements?.find((measurement) => measurement.id === `measure-${node.id}`)?.spelling?.role;
      return role === "instruction" || role === "practice";
    });
    const selectableRoutes = getAdventureBoardSelectableRoutes(plan);
    if (selectableRoutes.length >= 2) {
      const selectedNodeIds = new Set(selectableRoutes.flatMap((route) => route.nodeIds));
      const sharedPracticeNodes = practiceNodes.filter((node) => !selectedNodeIds.has(node.id));
      const planNodeById = new Map(plan.nodePlan.map((node) => [node.id, node]));
      for (const route of selectableRoutes) {
        const routeNodes = route.nodeIds.map((nodeId) => planNodeById.get(nodeId)).filter((node) => node != null);
        const routeWords = new Set([...sharedPracticeNodes, ...routeNodes]
          .flatMap((node) => node.targets.map((word) => word.toLocaleLowerCase("en-US"))));
        for (const missed of cleanIndependentMisses) {
          if (!routeWords.has(missed.word.toLocaleLowerCase("en-US"))) {
            throw new Error(`spelling_plan_route_missed_word_unaddressed:${route.id}:${missed.word}`);
          }
        }
      }
    }
    const practicedWords = new Set(practiceNodes.flatMap((node) => node.targets.map((word) => word.toLocaleLowerCase("en-US"))));
    for (const missed of cleanIndependentMisses) {
      if (!practicedWords.has(missed.word.toLocaleLowerCase("en-US"))) {
        throw new Error(`spelling_plan_missed_word_unaddressed:${missed.word}`);
      }
    }
    if (cleanIndependentMisses.length < captured.length && !practiceNodes.some((node) => {
      const targets = new Set(node.targets.map((word) => word.toLocaleLowerCase("en-US")));
      return targets.size < captured.length && [...targets].some((word) => missedWords.has(word));
    })) {
      throw new Error("spelling_plan_not_focused_on_independent_misses");
    }
  }
  const contract = buildLearningCycleInputFromPlan({ childId: cycle.childId, homeworkId: cycle.homeworkId, domain: "spelling", title: cycle.assignment.title, contentFingerprint: cycle.assignment.contentFingerprint, capturedEvidenceIds: cycle.assignment.capturedEvidenceIds, targets: cycle.assignment.targets, plan, engagementTheory: null });
  contract.academicPredictions = [];
  const prior = new Set<string>();
  const pendingInterventions = new Map<string, Set<string>>();
  const finalWords = new Set<string>();
  for (const [index, node] of plan.nodePlan.entries()) {
    if (contract.nodes[index].role === "quest" || contract.nodes[index].role === "boss") continue;
    const measurement = plan.plannedMeasurements?.find(row => row.id === `measure-${node.id}`);
    const decision = measurement?.spelling;
    if (!decision || !decision.evidenceIds.length || decision.evidenceIds.some(id => !evidence.has(id))) throw new Error(`spelling_plan_evidence_invalid:${node.id}`);
    if (decision.interventionNodeIds.some(id => !prior.has(id))) throw new Error(`spelling_checkpoint_intervention_not_prior:${node.id}`);
    if (decision.role === "fresh_checkpoint" && (node.type !== "word-radar" || node.wordRadarConfig?.recallMode !== "hidden_word_recall")) throw new Error(`spelling_checkpoint_instrument_unsupported:${node.id}`);
    const resolved = node.targets.map(word => words.get(word.toLocaleLowerCase("en-US")));
    if (resolved.some(item => !item)) throw new Error(`spelling_plan_unknown_word:${node.id}`);
    const items = resolved.map(source => {
      const item = buildSpellingRecallItems({ homeworkId: cycle.homeworkId, words: [source!.word], evidenceIds: decision.evidenceIds, measurementRole: decision.role, exposure: "practiced", occasionId: node.id })[0];
      const pending = pendingInterventions.get(item.wordId) ?? new Set<string>();
      if (decision.role === "fresh_checkpoint") {
        if ([...pending].some(id => !decision.interventionNodeIds.includes(id))) throw new Error(`spelling_checkpoint_lineage_missing:${node.id}`);
        pending.clear();
        if (decision.finalCheck) finalWords.add(item.wordId);
        contract.academicPredictions!.push({ predictionId: `${node.id}:${item.wordId}:prediction`, theoryId: contract.academicTheory.theoryId, constructId: item.constructId, context: decision.reason, horizon: "Immediate unassisted recall after the named intervention; not retention or causation.", eligibility: { sources: ["practice"], maxDelayDays: decision.maxDelayDays, checkpointItemIds: [item.id] }, expectedMetric: { key: "unassisted_recall_accuracy", ...decision.expectedAccuracy }, predictedErrorPatterns: [measurement!.falsifyCriteria], confidence: decision.confidence, evidenceIds: decision.evidenceIds, intervention: decision.interventionNodeIds.join(", ") || "Check previously observed spelling", evidenceLimit: "practice_only", createdAt: input.now, lockedAt: input.now });
      } else {
        pending.add(node.id);
      }
      pendingInterventions.set(item.wordId, pending);
      return item;
    });
    let nativeConfig: Record<string, unknown> | undefined;
    if (node.type === "letter-rush" || node.type === "concept-check") {
      const parsed = node.type === "letter-rush" ? validateLetterRushConfig(node.activityConfig) : validateActivityEngineConfig(node.activityConfig);
      if (!parsed.ok || !parsed.normalized || parsed.normalized.domain !== "spelling" || parsed.normalized.activityId !== node.type
        || parsed.normalized.evidencePolicy.writesMasteryEvidence) throw new Error(`spelling_engine_config_invalid:${node.id}`);
      const config = structuredClone(parsed.normalized);
      const match = (word: string) => items.find(item => item.word.normalize("NFC").toLowerCase() === word.normalize("NFC").toLowerCase());
      if (node.type === "letter-rush") {
        const letter = config as LetterRushConfig;
        if (letter.words.length !== items.length || new Set(letter.words.map(word => word.text.toLowerCase())).size !== items.length) throw new Error(`spelling_engine_coverage_invalid:${node.id}`);
        letter.words = letter.words.map(word => { const item = match(word.text); if (!item) throw new Error(`spelling_engine_unknown_word:${node.id}`); return { ...word, id: item.id }; });
      } else {
        const concept = config as ActivityEngineConfig;
        const ids = new Map(concept.targets.map(target => [target.id, match(target.label)]));
        if (concept.targets.length !== items.length || [...ids.values()].some(item => !item)
          || concept.rounds.length !== items.length || new Set(concept.rounds.map(round => round.targetId)).size !== items.length) throw new Error(`spelling_engine_coverage_invalid:${node.id}`);
        concept.targets = concept.targets.map(target => ({ ...target, id: ids.get(target.id)!.id }));
        concept.rounds = concept.rounds.map(round => {
          const item = ids.get(round.targetId); if (!item) throw new Error(`spelling_engine_unknown_word:${node.id}`);
          const accepted = (round.options ?? []).filter(option => option.correct).map(option => option.label);
          if (!accepted.length) throw new Error(`spelling_engine_answer_missing:${node.id}`);
          item.response = { mode: "tap_selection", acceptedForms: accepted, caseSensitive: false };
          return { ...round, targetId: item.id };
        });
      }
      nativeConfig = config as unknown as Record<string, unknown>;
    }
    contract.nodes[index] = { ...contract.nodes[index], implementationType: node.type, mechanic: node.activityId, state: "generating", artifactBinding: null, evidenceContract: { ...contract.nodes[index].evidenceContract, academic: items.length > 0, ...(nativeConfig ? { nativeConfig } : {}), ...(items.length ? { spellingItems: Object.fromEntries(items.map(item => [item.id, item])), itemRoles: Object.fromEntries(items.map(item => [item.id, decision.role])) } : {}) } };
    prior.add(node.id);
  }
  if (captured.some(item => !finalWords.has(item.wordId)) || [...pendingInterventions.values()].some(ids => ids.size)) throw new Error("spelling_final_checkpoint_coverage_incomplete");
  return contract;
}

export function persistIngestedLearningCycle(
  input: LearningCycleIngestInput,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const nextInput = buildLearningCycleInputFromPlan(input);
  let current: LearningCycleRecordV2 | null;
  try {
    current = getLearningCycle(input.childId, input.homeworkId, opts);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "learning_cycle_boss_progress_requires_quest_evidence") {
      throw error;
    }
    current = repairInvalidLearningCycleForReingestion(nextInput, opts);
  }
  if (!current) return createLearningCycle(nextInput, opts);
  return transitionLearningCycle(input.childId, input.homeworkId, current.revision, {
    type: "plan_reconciled",
    assignment: nextInput.assignment,
    academicTheory: {
      ...nextInput.academicTheory,
      revision: current.academicTheory.revision + 1,
    },
    engagementTheory: nextInput.engagementTheory,
    nodes: nextInput.nodes,
    reason: "Re-ingestion reconciled the canonical cycle without discarding recorded evidence.",
  }, opts);
}
