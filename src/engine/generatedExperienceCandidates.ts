import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdventureChoiceOption, AdventureChoiceSet } from "../shared/adventureBoardJson";
import type { AdaptiveQuestArtifactStage } from "./adaptiveQuestArtifact";
import type { ExperienceArtifactValidationReport } from "./generatedExperienceArtifact";
import { validateGeneratedArtifactRuntime } from "./generatedArtifactRuntimeValidator";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import {
  renderQuestBossShellFromSpec,
  validateQuestSpecV1,
  type QuestSpecV1,
} from "./questBossSpec";
import {
  buildQuestBossCreativeContextPacket,
  renderCreativeContextForPrompt,
} from "./questBossCreativeContext";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
} from "../profiles/chartWaterfall";

export type GeneratedExperienceCandidateStatus =
  | "candidate"
  | "spec_invalid"
  | "validation_failed"
  | "validated_available"
  | "selected"
  | "not_selected"
  | "preserved"
  | "revised"
  | "discarded"
  | "retired";

export type CandidateValidationReport = ExperienceArtifactValidationReport;

export interface GeneratedExperienceCandidateRecord {
  schemaVersion: 1;
  candidateId: string;
  contentId: string;
  childId: string;
  homeworkId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  optionId: string;
  status: GeneratedExperienceCandidateStatus;
  label: string;
  description?: string;
  tags: string[];
  filename?: string;
  filePath?: string;
  spec?: QuestSpecV1;
  validationReport?: CandidateValidationReport;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  lifecycle: Array<{
    status: GeneratedExperienceCandidateStatus;
    at: string;
    reason?: string;
    choiceEventId?: string;
  }>;
}

export interface GeneratedExperienceCandidateCard {
  candidateId: string;
  optionId: string;
  status: Extract<GeneratedExperienceCandidateStatus, "validated_available">;
  label: string;
  description?: string;
  tags: string[];
  contentId: string;
  newFile: string;
  validationReport: CandidateValidationReport;
}

export interface RejectedGeneratedExperienceCandidate {
  candidateId: string;
  optionId: string;
  status: "spec_invalid" | "validation_failed";
  reason: string;
  validationReport?: CandidateValidationReport;
}

export type PrepareGeneratedExperienceCandidatesResult =
  | {
      ok: true;
      childId: string;
      kind: AdaptiveQuestArtifactStage;
      nodeId: string;
      choiceSetId: string;
      candidates: GeneratedExperienceCandidateCard[];
      rejectedCandidates: RejectedGeneratedExperienceCandidate[];
    }
  | {
      ok: false;
      childId: string;
      kind?: AdaptiveQuestArtifactStage;
      nodeId?: string;
      choiceSetId?: string;
      reason: string;
    };

export type SelectGeneratedExperienceCandidateResult =
  | {
      ok: true;
      childId: string;
      kind: AdaptiveQuestArtifactStage;
      nodeId: string;
      choiceSetId: string;
      selectedCandidateId: string;
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
      selectedCandidateId?: string;
      reason: string;
    };

type GenerateSpecArgs = {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSet: AdventureChoiceSet;
  option: AdventureChoiceOption;
  targetWords: string[];
  homeworkCycle: HomeworkCycle;
  profile: LearningProfile;
  rootDir?: string;
  now?: Date;
};

export type GenerateQuestSpecFn = (args: GenerateSpecArgs) => Promise<QuestSpecV1> | QuestSpecV1;

export type ValidateCandidateRuntimeFn = (args: {
  html: string;
  childId: string;
  stage: AdaptiveQuestArtifactStage;
  homeworkType: string;
  words: string[];
  outputDir: string;
  now: Date;
}) => Promise<CandidateValidationReport>;

export interface PrepareGeneratedExperienceCandidatesInput {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  optionIds: string[];
  rootDir?: string;
  now?: Date;
  generateSpec?: GenerateQuestSpecFn;
  validateRuntime?: ValidateCandidateRuntimeFn;
}

export interface SelectGeneratedExperienceCandidateInput {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  selectedCandidateId: string;
  choiceEventId?: string;
  rootDir?: string;
  now?: Date;
}

type CandidateSetFile = {
  schemaVersion: 1;
  childId: string;
  homeworkId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  updatedAt: string;
  candidates: GeneratedExperienceCandidateRecord[];
};

const SPEC_MODEL = "claude-sonnet-4-20250514";

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "candidate";
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

function profilePath(rootDir: string, childId: string): string {
  return path.join(contextDir(rootDir, childId), "learning_profile.json");
}

function readProfile(rootDir: string, childId: string): LearningProfile | null {
  const profile = readJson<LearningProfile>(profilePath(rootDir, childId));
  return profile ? hydrateLearningProfileFromWaterfall(childId, profile, { rootDir }) : null;
}

function writeProfile(rootDir: string, childId: string, profile: LearningProfile, now: Date): void {
  const next = slimLearningProfileForDoorway(profile);
  next.lastUpdated = now.toISOString();
  writeJson(profilePath(rootDir, childId), next);
}

function readHomeworkCycle(rootDir: string, childId: string, homeworkId: string): HomeworkCycle | null {
  return readJson<HomeworkCycle>(
    path.join(contextDir(rootDir, childId), "homework", "cycles", `${homeworkId}.json`),
  );
}

function gameDate(profile: LearningProfile, now: Date): string {
  return profile.pendingHomework?.weekOf || now.toISOString().slice(0, 10);
}

function candidatesDir(rootDir: string, childId: string, date: string, choiceSetId: string): string {
  return path.join(
    contextDir(rootDir, childId),
    "homework",
    "games",
    date,
    ".candidates",
    safeSlug(choiceSetId),
  );
}

function candidatesFile(rootDir: string, childId: string, date: string, choiceSetId: string): string {
  return path.join(candidatesDir(rootDir, childId, date, choiceSetId), "candidates.json");
}

function appendLifecycle(
  candidate: GeneratedExperienceCandidateRecord,
  status: GeneratedExperienceCandidateStatus,
  now: Date,
  reason?: string,
  choiceEventId?: string,
): GeneratedExperienceCandidateRecord {
  return {
    ...candidate,
    status,
    reason: reason ?? candidate.reason,
    updatedAt: now.toISOString(),
    lifecycle: [
      ...candidate.lifecycle,
      {
        status,
        at: now.toISOString(),
        ...(reason ? { reason } : {}),
        ...(choiceEventId ? { choiceEventId } : {}),
      },
    ],
  };
}

function findChoiceSet(profile: LearningProfile, choiceSetId: string): AdventureChoiceSet | null {
  return profile.activeSessionPlan?.adventureBoard?.choiceSets?.find((set) => set.id === choiceSetId) ?? null;
}

function targetWords(profile: LearningProfile, nodeId: string): string[] {
  const planTargets = profile.activeSessionPlan?.nodePlan.find((node) => node.id === nodeId)?.targets ?? [];
  const pendingTargets = profile.pendingHomework?.nodes.find((node) => node.id === nodeId)?.words ?? [];
  return [...new Set([...planTargets, ...pendingTargets].map((word) => word.trim()).filter(Boolean))];
}

function optionDescription(option: AdventureChoiceOption, spec: QuestSpecV1): string {
  return option.description ?? spec.challengeFrame;
}

const questSpecTool = {
  name: "create_quest_spec",
  description: "Create creative Quest/Boss wrapper content only. Sunny owns runtime, evidence, and target words.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "stage",
      "title",
      "theme",
      "challengeFrame",
      "visualWorld",
      "interactionFlavor",
      "tensionCurve",
      "rewardMoment",
      "failureRecoveryStyle",
      "animationCues",
      "styleReference",
      "wrapperTraits",
      "difficulty",
      "estimatedMinutes",
      "childFacingIntro",
      "successCopy",
      "scenes",
    ],
    properties: {
      schemaVersion: { type: "integer", enum: [1] },
      stage: { type: "string", enum: ["quest", "boss"] },
      title: { type: "string", minLength: 3 },
      theme: { type: "string", minLength: 3 },
      challengeFrame: { type: "string", minLength: 8 },
      visualWorld: { type: "string", minLength: 8 },
      interactionFlavor: { type: "string", minLength: 8 },
      tensionCurve: { type: "string", minLength: 8 },
      rewardMoment: { type: "string", minLength: 8 },
      failureRecoveryStyle: { type: "string", minLength: 8 },
      animationCues: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "string", minLength: 2 },
      },
      styleReference: { type: "string", minLength: 8 },
      wrapperTraits: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "string", minLength: 2 },
      },
      difficulty: { type: "integer", enum: [1, 2, 3] },
      estimatedMinutes: { type: "integer", minimum: 1, maximum: 12 },
      childFacingIntro: { type: "string", minLength: 10 },
      successCopy: { type: "string", minLength: 5 },
      retryCopy: { type: "string" },
      scenes: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "prompt"],
          properties: {
            id: { type: "string", minLength: 2 },
            title: { type: "string", minLength: 3 },
            prompt: { type: "string", minLength: 8 },
          },
        },
      },
    },
  },
} as const;

export function buildQuestSpecPrompt(args: GenerateSpecArgs): string {
  const forbiddenOutput = [
    args.childId,
    args.childId.charAt(0).toUpperCase() + args.childId.slice(1),
    ...args.targetWords,
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  const creativeContext = buildQuestBossCreativeContextPacket({
    childId: args.childId,
    kind: args.kind,
    nodeId: args.nodeId,
    choiceSet: args.choiceSet,
    option: args.option,
    targetWords: args.targetWords,
    homeworkCycle: args.homeworkCycle,
    profile: args.profile,
    ...(args.rootDir ? { rootDir: args.rootDir } : {}),
    ...(args.now ? { now: args.now } : {}),
  });
  return `You are designing the creative wrapper for a Sunny ${args.kind}.

Return a QuestSpecV1 object through the tool. The exact shape is:
{
  "schemaVersion": 1,
  "stage": "${args.kind}",
  "title": "child-facing title",
  "theme": "short theme",
  "challengeFrame": "how the adventure feels",
  "visualWorld": "what the generated shell should feel like visually",
  "interactionFlavor": "how each recall round feels as play",
  "tensionCurve": "how the adventure builds from start to finish",
  "rewardMoment": "what satisfying payoff happens after completion",
  "failureRecoveryStyle": "how misses are framed without shame",
  "animationCues": ["short visual cue"],
  "styleReference": "brief Sunny style note to guide the trusted shell",
  "wrapperTraits": ["story", "mystery"],
  "difficulty": 1 | 2 | 3,
  "estimatedMinutes": 1-12,
  "childFacingIntro": "what the child sees before hidden recall",
  "successCopy": "what the child sees after completion",
  "retryCopy": "optional encouragement",
  "scenes": [{ "id": "scene-1", "title": "Scene Title", "prompt": "Wrapper-only prompt" }]
}

Sunny owns the runtime shell, /games/_contract.js, companion UI, hidden spelling targets, input fields, attempt events, completion events, replay/back overlay, and Playwright validation.
Your spec owns only theme, story wrapper, visual world, interaction flavor, challenge framing, and child-facing copy.

Scene prompts must be wrapper context only. Do not include definitions, semantic clues, rhymes, example answers, or hints that imply a target spelling word. Sunny will inject the hidden recall targets at runtime.
Use "you" instead of the child name.
Forbidden output strings: ${forbiddenOutput.join(", ")}
Never write any forbidden output string in title, intro, success copy, retry copy, scene titles, or scene prompts. Never write JavaScript, HTML, contract code, companion chrome, input fields, or scoring logic.

${renderCreativeContextForPrompt(creativeContext)}

Academic goal: prove hidden spelling recall without exposing answers first.`;
}

async function generateQuestSpecWithSonnet(args: GenerateSpecArgs): Promise<QuestSpecV1> {
  const client = new Anthropic();
  const prompt = buildQuestSpecPrompt(args);
  const message = await client.messages.create({
    model: SPEC_MODEL,
    max_tokens: 1400,
    tools: [questSpecTool],
    tool_choice: { type: "tool", name: "create_quest_spec" },
    messages: [{ role: "user", content: prompt }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === "create_quest_spec",
  );
  if (toolUse?.type === "tool_use") {
    return toolUse.input as QuestSpecV1;
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(text) as QuestSpecV1;
}

function fallbackReport(args: {
  passed: boolean;
  score: number;
  failures: string[];
  warnings: string[];
  now: Date;
  staticValidation?: CandidateValidationReport["staticValidation"];
}): CandidateValidationReport {
  return {
    passed: args.passed,
    score: args.score,
    failures: args.failures,
    warnings: args.warnings,
    attempts: 1,
    validatedAt: args.now.toISOString(),
    ...(args.staticValidation ? { staticValidation: args.staticValidation } : {}),
  };
}

function cardFor(candidate: GeneratedExperienceCandidateRecord): GeneratedExperienceCandidateCard {
  return {
    candidateId: candidate.candidateId,
    optionId: candidate.optionId,
    status: "validated_available",
    label: candidate.label,
    ...(candidate.description ? { description: candidate.description } : {}),
    tags: candidate.tags,
    contentId: candidate.contentId,
    newFile: candidate.filename ?? "",
    validationReport: candidate.validationReport as CandidateValidationReport,
  };
}

export async function prepareGeneratedExperienceCandidates(
  input: PrepareGeneratedExperienceCandidatesInput,
): Promise<PrepareGeneratedExperienceCandidatesResult> {
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
  const words = targetWords(profile, input.nodeId);
  const practiceDomain = String(cycle.capturedContent?.contentProfile?.practiceDomain ?? "").toLowerCase();
  const supportedDomain = cycle.subject === "spelling_test" ||
    cycle.subject === "reading" ||
    practiceDomain === "spelling" ||
    practiceDomain === "reading";
  if (!supportedDomain) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, reason: "only_spelling_or_reading_candidates_supported" };
  }
  const date = gameDate(profile, now);
  const dir = candidatesDir(rootDir, childId, date, input.choiceSetId);
  const generateSpec = input.generateSpec ?? generateQuestSpecWithSonnet;
  const validateRuntime = input.validateRuntime ?? ((args) => validateGeneratedArtifactRuntime(args));
  const selectedOptions = choiceSet.options.filter((option) =>
    input.optionIds.length === 0 || input.optionIds.includes(option.id),
  );
  const candidates: GeneratedExperienceCandidateRecord[] = [];

  for (const option of selectedOptions) {
    const candidateId = `candidate-${safeSlug(input.choiceSetId)}-${safeSlug(option.id)}`;
    const contentId = `content-${candidateId}`;
    const base: GeneratedExperienceCandidateRecord = {
      schemaVersion: 1,
      candidateId,
      contentId,
      childId,
      homeworkId,
      kind: input.kind,
      nodeId: input.nodeId,
      choiceSetId: input.choiceSetId,
      optionId: option.id,
      status: "candidate",
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
      tags: option.tags ?? [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lifecycle: [{ status: "candidate", at: now.toISOString() }],
    };
    try {
      const spec = await generateSpec({
        childId,
        kind: input.kind,
        nodeId: input.nodeId,
        choiceSet,
        option,
        targetWords: words,
        homeworkCycle: cycle,
        profile,
        rootDir,
        now,
      });
      const specValidation = validateQuestSpecV1(spec, { stage: input.kind, targetWords: words });
      if (!specValidation.ok) {
        candidates.push(appendLifecycle(
          { ...base, spec, reason: specValidation.failures.join(" | ") },
          "spec_invalid",
          now,
          specValidation.failures.join(" | "),
        ));
        continue;
      }
      const filename = `${input.kind}-${safeSlug(input.choiceSetId)}-${safeSlug(option.id)}.html`;
      const filePath = path.join(dir, filename);
      const html = renderQuestBossShellFromSpec(specValidation.spec, {
        stage: input.kind,
        targetWords: words,
      });
      const staticValidation = validateGeneratedGame(html, {
        words,
        homeworkType: cycle.subject,
        childId,
        generationStage: input.kind,
      });
      if (!staticValidation.passed) {
        const report = fallbackReport({
          passed: false,
          score: staticValidation.score,
          failures: staticValidation.failures,
          warnings: staticValidation.warnings,
          now,
          staticValidation: {
            passed: staticValidation.passed,
            score: staticValidation.score,
            failures: staticValidation.failures,
            warnings: staticValidation.warnings,
          },
        });
        fs.mkdirSync(path.join(dir, ".validation", safeSlug(option.id)), { recursive: true });
        fs.writeFileSync(path.join(dir, ".validation", safeSlug(option.id), "failed-generated-artifact.html"), html, "utf8");
        fs.writeFileSync(path.join(dir, ".validation", safeSlug(option.id), "failed-validation-report.json"), JSON.stringify(report, null, 2), "utf8");
        candidates.push(appendLifecycle(
          { ...base, spec: specValidation.spec, filename, filePath, validationReport: report, reason: report.failures.join(" | ") },
          "validation_failed",
          now,
          report.failures.join(" | "),
        ));
        continue;
      }
      const runtime = await validateRuntime({
        html,
        childId,
        stage: input.kind,
        homeworkType: cycle.subject,
        words,
        outputDir: path.join(dir, ".validation", safeSlug(option.id)),
        now,
      });
      const report: CandidateValidationReport = {
        ...runtime,
        passed: staticValidation.passed && runtime.passed,
        score: Math.min(staticValidation.score, runtime.score),
        failures: [...staticValidation.failures, ...runtime.failures],
        warnings: [...staticValidation.warnings, ...runtime.warnings],
        staticValidation: {
          passed: staticValidation.passed,
          score: staticValidation.score,
          failures: staticValidation.failures,
          warnings: staticValidation.warnings,
        },
      };
      if (!report.passed) {
        candidates.push(appendLifecycle(
          { ...base, spec: specValidation.spec, filename, filePath, validationReport: report, reason: report.failures.join(" | ") },
          "validation_failed",
          now,
          report.failures.join(" | "),
        ));
        continue;
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, html, "utf8");
      candidates.push(appendLifecycle(
        {
          ...base,
          spec: specValidation.spec,
          description: optionDescription(option, specValidation.spec),
          filename,
          filePath,
          validationReport: report,
        },
        "validated_available",
        now,
      ));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      candidates.push(appendLifecycle({ ...base, reason: message }, "spec_invalid", now, message));
    }
  }

  const file: CandidateSetFile = {
    schemaVersion: 1,
    childId,
    homeworkId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    updatedAt: now.toISOString(),
    candidates,
  };
  writeJson(candidatesFile(rootDir, childId, date, input.choiceSetId), file);
  console.log(
    `🎮 [generated-candidates] [prepared] child=${childId} kind=${input.kind} choiceSet=${input.choiceSetId} available=${candidates.filter((candidate) => candidate.status === "validated_available").length}`,
  );
  return {
    ok: true,
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    candidates: candidates
      .filter((candidate) => candidate.status === "validated_available")
      .map(cardFor),
    rejectedCandidates: candidates
      .filter((candidate) => candidate.status === "spec_invalid" || candidate.status === "validation_failed")
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        optionId: candidate.optionId,
        status: candidate.status as "spec_invalid" | "validation_failed",
        reason: candidate.reason ?? "candidate_not_playable",
        ...(candidate.validationReport ? { validationReport: candidate.validationReport } : {}),
      })),
  };
}

export function selectGeneratedExperienceCandidate(
  input: SelectGeneratedExperienceCandidateInput,
): SelectGeneratedExperienceCandidateResult {
  const rootDir = input.rootDir ?? process.cwd();
  const now = input.now ?? new Date();
  const childId = input.childId.trim().toLowerCase();
  const profile = readProfile(rootDir, childId);
  if (!profile?.pendingHomework) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedCandidateId: input.selectedCandidateId, reason: "pending_homework_missing" };
  }
  const date = gameDate(profile, now);
  const filePath = candidatesFile(rootDir, childId, date, input.choiceSetId);
  const set = readJson<CandidateSetFile>(filePath);
  if (!set) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedCandidateId: input.selectedCandidateId, reason: "candidate_set_missing" };
  }
  const selected = set.candidates.find((candidate) => candidate.candidateId === input.selectedCandidateId);
  if (!selected || selected.status !== "validated_available" || !selected.filename || !selected.filePath || !selected.validationReport) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedCandidateId: input.selectedCandidateId, reason: "candidate_not_playable" };
  }
  if (!fs.existsSync(selected.filePath)) {
    return { ok: false, childId, kind: input.kind, nodeId: input.nodeId, choiceSetId: input.choiceSetId, selectedCandidateId: input.selectedCandidateId, reason: "candidate_file_missing" };
  }
  const selectedFilename = selected.filename;
  const selectedValidationReport = selected.validationReport;
  const playablePath = path.join(contextDir(rootDir, childId), "homework", "games", date, selectedFilename);
  fs.mkdirSync(path.dirname(playablePath), { recursive: true });
  fs.copyFileSync(selected.filePath, playablePath);
  const nextCandidates = set.candidates.map((candidate) => {
    if (candidate.candidateId === selected.candidateId) {
      return appendLifecycle(candidate, "selected", now, undefined, input.choiceEventId);
    }
    if (candidate.status === "validated_available") {
      return appendLifecycle(candidate, "not_selected", now, "Sibling option was not selected.", input.choiceEventId);
    }
    return candidate;
  });
  const notSelectedCandidateIds = nextCandidates
    .filter((candidate) => candidate.status === "not_selected")
    .map((candidate) => candidate.candidateId);
  writeJson(filePath, { ...set, updatedAt: now.toISOString(), candidates: nextCandidates });

  const nextProfile: LearningProfile = {
    ...profile,
    pendingHomework: {
      ...profile.pendingHomework,
      nodes: profile.pendingHomework.nodes.map((node) =>
        node.id === input.nodeId
          ? {
              ...node,
              gameFile: selectedFilename,
              date,
              adaptiveArtifact: {
                artifactId: selected.contentId,
                contentId: selected.contentId,
                homeworkId: set.homeworkId,
                theoryId: profile.activeSessionPlan?.planTheory?.hypothesis ?? "generated-candidate",
                generationStage: input.kind,
                targetGroupIds: [],
                homeworkWordIds: [],
                baselineEvidenceIds: profile.activeSessionPlan?.evidenceUsed.map((item) => item.id) ?? [],
                generatedPath: selected.filename,
                validationStatus: "passed",
                validationReport: selectedValidationReport,
              },
            }
          : node,
      ),
    },
  };
  writeProfile(rootDir, childId, nextProfile, now);
  console.log(
    `🎮 [generated-candidates] [selected] child=${childId} kind=${input.kind} selected=${input.selectedCandidateId} notSelected=${notSelectedCandidateIds.length}`,
  );
  return {
    ok: true,
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSetId,
    selectedCandidateId: input.selectedCandidateId,
    notSelectedCandidateIds,
    newFile: selectedFilename,
    date,
    contentId: selected.contentId,
    validationReport: selectedValidationReport,
  };
}
