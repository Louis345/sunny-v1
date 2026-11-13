import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdventureChoiceSet } from "../shared/adventureBoardJson";
import type { AdaptiveQuestArtifactStage } from "./adaptiveQuestArtifact";
import type { CandidateValidationReport, ValidateCandidateRuntimeFn } from "./generatedExperienceCandidates";
import {
  prepareGeneratedExperienceCandidates,
  selectGeneratedExperienceCandidate,
} from "./generatedExperienceCandidates";
import {
  buildDesignBriefV1,
  conceptToQuestSpecV1,
  validateConceptCandidateV1,
  type ConceptCandidateV1,
  type DesignBriefV1,
} from "./questBossDesignLoop";
import { resolveChildContextDir } from "../utils/contextRoot";
import { hydrateLearningProfileFromWaterfall } from "../profiles/chartWaterfall";

export type GeneratedExperienceConceptStatus =
  | "concept_candidate"
  | "concept_invalid"
  | "concept_selected"
  | "concept_not_selected"
  | "concept_revised";

export interface GeneratedExperienceConceptRecord {
  schemaVersion: 1;
  conceptId: string;
  optionId: string;
  childId: string;
  homeworkId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  status: GeneratedExperienceConceptStatus;
  concept?: ConceptCandidateV1;
  reason?: string;
  microQuestionAnswer?: string;
  createdAt: string;
  updatedAt: string;
  lifecycle: Array<{
    status: GeneratedExperienceConceptStatus;
    at: string;
    reason?: string;
  }>;
}

export interface GeneratedExperienceConceptCard {
  conceptId: string;
  optionId: string;
  status: "concept_candidate";
  label: string;
  description: string;
  tags: string[];
  artDirection: string;
  thumbnailUrl?: string;
  companionMicroQuestion?: ConceptCandidateV1["companionMicroQuestion"];
}

export type PrepareGeneratedExperienceConceptsResult =
  | {
      ok: true;
      childId: string;
      kind: AdaptiveQuestArtifactStage;
      nodeId: string;
      choiceSetId: string;
      brief: DesignBriefV1;
      concepts: GeneratedExperienceConceptCard[];
      rejectedConcepts: Array<{ conceptId: string; optionId: string; status: "concept_invalid"; reason: string }>;
    }
  | {
      ok: false;
      childId: string;
      kind?: AdaptiveQuestArtifactStage;
      nodeId?: string;
      choiceSetId?: string;
      reason: string;
    };

export type SelectGeneratedExperienceConceptResult =
  | {
      ok: true;
      childId: string;
      kind: AdaptiveQuestArtifactStage;
      nodeId: string;
      choiceSetId: string;
      selectedConceptId: string;
      selectedCandidateId: string;
      notSelectedConceptIds: string[];
      notSelectedCandidateIds: string[];
      newFile: string;
      date: string;
      contentId: string;
      validationReport: CandidateValidationReport;
    }
  | {
      ok: false;
      childId: string;
      kind?: AdaptiveQuestArtifactStage;
      nodeId?: string;
      choiceSetId?: string;
      selectedConceptId?: string;
      reason: string;
    };

export type GenerateConceptsFn = (args: {
  brief: DesignBriefV1;
  choiceSet: AdventureChoiceSet;
}) => Promise<ConceptCandidateV1[]> | ConceptCandidateV1[];

export interface PrepareGeneratedExperienceConceptsInput {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  optionIds: string[];
  rootDir?: string;
  now?: Date;
  generateConcepts?: GenerateConceptsFn;
}

export interface SelectGeneratedExperienceConceptInput {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  selectedConceptId: string;
  choiceEventId?: string;
  microQuestionAnswer?: string;
  rootDir?: string;
  now?: Date;
  validateRuntime?: ValidateCandidateRuntimeFn;
}

type ConceptSetFile = {
  schemaVersion: 1;
  childId: string;
  homeworkId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  updatedAt: string;
  brief: DesignBriefV1;
  concepts: GeneratedExperienceConceptRecord[];
};

const CONCEPT_MODEL = "claude-sonnet-4-20250514";

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "concept";
}

function contextDir(rootDir: string, childId: string): string {
  return resolveChildContextDir(childId, { rootDir });
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readProfile(rootDir: string, childId: string): LearningProfile | null {
  const file = path.join(contextDir(rootDir, childId), "learning_profile.json");
  const profile = readJson<LearningProfile>(file);
  return profile ? hydrateLearningProfileFromWaterfall(childId, profile, { rootDir }) : null;
}

function readHomeworkCycle(rootDir: string, childId: string, homeworkId: string): HomeworkCycle | null {
  return readJson<HomeworkCycle>(
    path.join(contextDir(rootDir, childId), "homework", "cycles", `${homeworkId}.json`),
  );
}

function gameDate(profile: LearningProfile, now: Date): string {
  return profile.pendingHomework?.weekOf || now.toISOString().slice(0, 10);
}

function conceptsDir(rootDir: string, childId: string, date: string, choiceSetId: string): string {
  return path.join(
    contextDir(rootDir, childId),
    "homework",
    "games",
    date,
    ".concepts",
    safeSlug(choiceSetId),
  );
}

function conceptsFile(rootDir: string, childId: string, date: string, choiceSetId: string): string {
  return path.join(conceptsDir(rootDir, childId, date, choiceSetId), "concepts.json");
}

function findChoiceSet(profile: LearningProfile, choiceSetId: string): AdventureChoiceSet | null {
  return profile.activeSessionPlan?.adventureBoard?.choiceSets?.find((set) => set.id === choiceSetId) ?? null;
}

function targetWords(profile: LearningProfile, nodeId: string): string[] {
  const planTargets = profile.activeSessionPlan?.nodePlan.find((node) => node.id === nodeId)?.targets ?? [];
  const pendingTargets = profile.pendingHomework?.nodes.find((node) => node.id === nodeId)?.words ?? [];
  return [...new Set([...planTargets, ...pendingTargets].map((word) => word.trim()).filter(Boolean))];
}

function difficulty(profile: LearningProfile, nodeId: string, kind: AdaptiveQuestArtifactStage): 1 | 2 | 3 {
  return profile.activeSessionPlan?.nodePlan.find((node) => node.id === nodeId)?.difficulty ??
    (kind === "boss" ? 3 : 2);
}

function appendLifecycle(
  concept: GeneratedExperienceConceptRecord,
  status: GeneratedExperienceConceptStatus,
  now: Date,
  reason?: string,
  microQuestionAnswer?: string,
): GeneratedExperienceConceptRecord {
  return {
    ...concept,
    status,
    ...(reason ? { reason } : {}),
    ...(microQuestionAnswer ? { microQuestionAnswer } : {}),
    updatedAt: now.toISOString(),
    lifecycle: [
      ...concept.lifecycle,
      {
        status,
        at: now.toISOString(),
        ...(reason ? { reason } : {}),
      },
    ],
  };
}

function cardFor(record: GeneratedExperienceConceptRecord): GeneratedExperienceConceptCard {
  const concept = record.concept as ConceptCandidateV1;
  return {
    conceptId: record.conceptId,
    optionId: record.optionId,
    status: "concept_candidate",
    label: concept.title,
    description: concept.hook,
    tags: concept.traits,
    artDirection: concept.artDirection,
    ...(concept.thumbnailUrl ? { thumbnailUrl: concept.thumbnailUrl } : {}),
    ...(concept.companionMicroQuestion ? { companionMicroQuestion: concept.companionMicroQuestion } : {}),
  };
}

const conceptTool = {
  name: "create_quest_boss_concepts",
  description: "Create lightweight child-facing concept cards only. Sunny builds the selected runtime later.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["concepts"],
    properties: {
      concepts: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "schemaVersion",
            "conceptId",
            "optionId",
            "title",
            "hook",
            "artDirection",
            "interactionFantasy",
            "rewardLoop",
            "domainProofPlan",
            "childFitRationale",
            "supportCriteria",
            "reviseCriteria",
            "falsifyCriteria",
            "traits",
            "estimatedMinutes",
          ],
          properties: {
            schemaVersion: { type: "integer", enum: [1] },
            conceptId: { type: "string", minLength: 3 },
            optionId: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 3 },
            hook: { type: "string", minLength: 8 },
            artDirection: { type: "string", minLength: 8 },
            interactionFantasy: { type: "string", minLength: 8 },
            rewardLoop: { type: "string", minLength: 8 },
            domainProofPlan: { type: "string", minLength: 8 },
            childFitRationale: { type: "string", minLength: 8 },
            supportCriteria: { type: "array", minItems: 1, items: { type: "string" } },
            reviseCriteria: { type: "array", minItems: 1, items: { type: "string" } },
            falsifyCriteria: { type: "array", minItems: 1, items: { type: "string" } },
            traits: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
            estimatedMinutes: { type: "integer", minimum: 1, maximum: 12 },
            thumbnailUrl: { type: "string" },
            companionMicroQuestion: {
              type: "object",
              additionalProperties: false,
              required: ["prompt", "answerType"],
              properties: {
                prompt: { type: "string", minLength: 4 },
                answerType: { type: "string", enum: ["free_text", "short_choice"] },
                options: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
} as const;

async function generateConceptsWithSonnet(args: {
  brief: DesignBriefV1;
  choiceSet: AdventureChoiceSet;
}): Promise<ConceptCandidateV1[]> {
  const client = new Anthropic();
  const prompt = [
    "You are Sunny's adaptive learning-game designer.",
    "Create 2-3 lightweight concept cards, not runnable games.",
    "The child will choose one card; Sunny will build only the selected concept.",
    "Use the actual assignment and domain proof template. Do not leak spelling answers or reading answers.",
    "Each concept must say why it fits the child and how outcomes support/revise/falsify the design theory.",
    JSON.stringify({ brief: args.brief, availableOptions: args.choiceSet.options }, null, 2),
  ].join("\n\n");
  const message = await client.messages.create({
    model: CONCEPT_MODEL,
    max_tokens: 2200,
    tools: [conceptTool],
    tool_choice: { type: "tool", name: "create_quest_boss_concepts" },
    messages: [{ role: "user", content: prompt }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === "create_quest_boss_concepts",
  );
  if (toolUse?.type === "tool_use") {
    const input = toolUse.input as { concepts?: ConceptCandidateV1[] };
    return input.concepts ?? [];
  }
  return [];
}

export async function prepareGeneratedExperienceConcepts(
  input: PrepareGeneratedExperienceConceptsInput,
): Promise<PrepareGeneratedExperienceConceptsResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const now = input.now ?? new Date();
  const childId = input.childId.trim().toLowerCase();
  const profile = readProfile(rootDir, childId);
  if (!profile?.pendingHomework || !profile.activeSessionPlan) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, reason: "active_session_plan_missing" };
  }
  const homeworkId = profile.activeSessionPlan.activeHomeworkId ?? profile.pendingHomework.homeworkId;
  if (!homeworkId) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, reason: "homework_id_missing" };
  }
  const cycle = readHomeworkCycle(rootDir, childId, homeworkId);
  if (!cycle) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, reason: "homework_cycle_missing" };
  }
  const choiceSet = findChoiceSet(profile, input.choiceSetId);
  if (!choiceSet) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, reason: "choice_set_missing" };
  }
  const selectedChoiceSet: AdventureChoiceSet = {
    ...choiceSet,
    options: choiceSet.options.filter((option) =>
      input.optionIds.length === 0 || input.optionIds.includes(option.id),
    ),
  };
  const brief = buildDesignBriefV1({
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSet: selectedChoiceSet,
    homeworkCycle: cycle,
    profile,
    targetWords: targetWords(profile, input.nodeId),
    now,
  });
  const generateConcepts = input.generateConcepts ?? generateConceptsWithSonnet;
  const concepts = await generateConcepts({ brief, choiceSet: selectedChoiceSet });
  const records: GeneratedExperienceConceptRecord[] = concepts.map((concept) => {
    const validation = validateConceptCandidateV1(concept, brief);
    const base: GeneratedExperienceConceptRecord = {
      schemaVersion: 1,
      conceptId: concept.conceptId,
      optionId: concept.optionId,
      childId,
      homeworkId,
      kind: input.kind,
      nodeId: input.nodeId,
      choiceSetId: input.choiceSetId,
      status: "concept_candidate",
      concept,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lifecycle: [{ status: "concept_candidate", at: now.toISOString() }],
    };
    if (validation.ok) return base;
    return appendLifecycle(
      { ...base, reason: validation.failures.join(" | ") },
      "concept_invalid",
      now,
      validation.failures.join(" | "),
    );
  });
  const date = gameDate(profile, now);
  writeJson(conceptsFile(rootDir, childId, date, input.choiceSetId), {
    schemaVersion: 1,
    childId,
    homeworkId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    updatedAt: now.toISOString(),
    brief,
    concepts: records,
  } satisfies ConceptSetFile);
  console.log(
    `🎮 [generated-concepts] [prepared] child=${childId} kind=${input.kind} choiceSet=${input.choiceSetId} available=${records.filter((item) => item.status === "concept_candidate").length}`,
  );
  return {
    ok: true,
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    brief,
    concepts: records
      .filter((record) => record.status === "concept_candidate" && record.concept)
      .map(cardFor),
    rejectedConcepts: records
      .filter((record) => record.status === "concept_invalid")
      .map((record) => ({
        conceptId: record.conceptId,
        optionId: record.optionId,
        status: "concept_invalid" as const,
        reason: record.reason ?? "concept_invalid",
      })),
  };
}

export async function selectGeneratedExperienceConcept(
  input: SelectGeneratedExperienceConceptInput,
): Promise<SelectGeneratedExperienceConceptResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const now = input.now ?? new Date();
  const childId = input.childId.trim().toLowerCase();
  const profile = readProfile(rootDir, childId);
  if (!profile?.pendingHomework || !profile.activeSessionPlan) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedConceptId: input.selectedConceptId, reason: "active_session_plan_missing" };
  }
  const date = gameDate(profile, now);
  const file = conceptsFile(rootDir, childId, date, input.choiceSetId);
  const set = readJson<ConceptSetFile>(file);
  if (!set) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedConceptId: input.selectedConceptId, reason: "concept_set_missing" };
  }
  const selected = set.concepts.find((concept) => concept.conceptId === input.selectedConceptId);
  if (!selected?.concept || selected.status !== "concept_candidate") {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedConceptId: input.selectedConceptId, reason: "concept_not_selectable" };
  }
  const nextConcepts = set.concepts.map((concept) => {
    if (concept.conceptId === selected.conceptId) {
      return appendLifecycle(concept, "concept_selected", now, undefined, input.microQuestionAnswer);
    }
    if (concept.status === "concept_candidate") {
      return appendLifecycle(concept, "concept_not_selected", now, "Sibling concept was not selected.");
    }
    return concept;
  });
  writeJson(file, { ...set, updatedAt: now.toISOString(), concepts: nextConcepts });

  const prepared = await prepareGeneratedExperienceCandidates({
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    optionIds: [selected.optionId],
    rootDir,
    now,
    generateSpec: async () => conceptToQuestSpecV1({
      concept: selected.concept as ConceptCandidateV1,
      kind: input.kind,
      domain: set.brief.domainTemplate.domain,
      difficulty: difficulty(profile, input.nodeId, input.kind),
    }),
    ...(input.validateRuntime ? { validateRuntime: input.validateRuntime } : {}),
  });
  if (!prepared.ok) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedConceptId: input.selectedConceptId, reason: prepared.reason };
  }
  const candidate = prepared.candidates[0];
  if (!candidate) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedConceptId: input.selectedConceptId, reason: "selected_concept_candidate_validation_failed" };
  }
  const selectedCandidate = selectGeneratedExperienceCandidate({
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    selectedCandidateId: candidate.candidateId,
    ...(input.choiceEventId ? { choiceEventId: input.choiceEventId } : {}),
    rootDir,
    now,
  });
  if (!selectedCandidate.ok) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedConceptId: input.selectedConceptId, reason: selectedCandidate.reason };
  }
  console.log(
    `🎮 [generated-concepts] [selected] child=${childId} kind=${input.kind} concept=${input.selectedConceptId} file=${selectedCandidate.newFile}`,
  );
  return {
    ok: true,
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    selectedConceptId: input.selectedConceptId,
    selectedCandidateId: selectedCandidate.selectedCandidateId,
    notSelectedConceptIds: nextConcepts
      .filter((concept) => concept.status === "concept_not_selected")
      .map((concept) => concept.conceptId),
    notSelectedCandidateIds: selectedCandidate.notSelectedCandidateIds,
    newFile: selectedCandidate.newFile,
    date: selectedCandidate.date,
    contentId: selectedCandidate.contentId,
    validationReport: selectedCandidate.validationReport,
  };
}
