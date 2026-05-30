import fs from "fs";
import path from "path";
import type { MysteryChoiceOption } from "../shared/adventureTypes";
import type { LearningProfile } from "../context/schemas/learningProfile";
import {
  buildDiverseQuestVisualCandidateDirections,
  selectQuestVisualCandidateDirection,
  type DiverseQuestVisualDirection,
  type DiverseQuestVisualSelection,
} from "./diverseQuestVisualCandidateLab";
import {
  type QuestVisualPromptLabFixture,
  type QuestVisualSignal,
} from "./questVisualPromptLab";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { resolveChildContextDir } from "../utils/contextRoot";
import { updateChildProfileGenerationModel } from "../profile/updateProfile";
import { renderPlayableVisualQuestShell } from "./playableVisualQuestShell";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { validateGeneratedArtifactRuntime } from "./generatedArtifactRuntimeValidator";
import type { ExperienceArtifactValidationReport } from "./generatedExperienceArtifact";

export type PrepareQuestVisualCandidatesInput = {
  childId: string;
  kind: "quest" | "boss";
  nodeId: string;
  choiceSetId?: string;
  rootDir?: string;
  paid?: boolean;
  now?: Date;
  model?: string;
};

export type PreparedQuestVisualCandidate = {
  id: string;
  family: DiverseQuestVisualDirection["family"];
  title: string;
  description: string;
  wrapperTraits: string[];
  imagePath: string;
  imageFile: string;
  imageUrl: string;
  promptPath: string;
  provider: "openai" | "fixture";
  model: string;
};

export type QuestVisualCandidateManifest = {
  version: 1;
  childId: string;
  kind: "quest" | "boss";
  nodeId: string;
  choiceSetId: string;
  createdAt: string;
  homeworkId?: string;
  fixture: QuestVisualPromptLabFixture;
  candidates: PreparedQuestVisualCandidate[];
};

export type PrepareQuestVisualCandidatesResult =
  | {
      ok: true;
      choiceSetId: string;
      cards: MysteryChoiceOption[];
      candidates: PreparedQuestVisualCandidate[];
      manifestPath: string;
    }
  | {
      ok: false;
      error: string;
    };

export type SelectQuestVisualCandidateInput = {
  childId: string;
  kind: "quest" | "boss";
  nodeId: string;
  choiceSetId: string;
  selectedCandidateId: string;
  rootDir?: string;
  now?: Date;
};

export type SelectQuestVisualCandidateResult =
  | {
      ok: true;
      selectedCandidateId: string;
      notSelectedCandidateIds: string[];
      newFile: string;
      gameHtmlPath: string;
      contentId: string;
      validationReport: ExperienceArtifactValidationReport;
      choiceEvent: DiverseQuestVisualSelection["choiceEvent"];
    }
  | {
      ok: false;
      error: string;
      validationReport?: ExperienceArtifactValidationReport;
    };

const DEFAULT_MODEL = process.env.SUNNY_QUEST_VISUAL_IMAGE_MODEL ?? "gpt-image-1";
const DEFAULT_QUALITY = process.env.SUNNY_QUEST_VISUAL_IMAGE_QUALITY ?? "medium";

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

function contextDir(rootDir: string, childId: string): string {
  return resolveChildContextDir(childId, { rootDir });
}

function generatedCandidatesDir(rootDir: string, childId: string, choiceSetId: string): string {
  return path.join(contextDir(rootDir, childId), "homework", "generated-candidates", choiceSetId);
}

function manifestFile(rootDir: string, childId: string, choiceSetId: string): string {
  return path.join(generatedCandidatesDir(rootDir, childId, choiceSetId), "manifest.json");
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function imageUrlFor(input: {
  childId: string;
  choiceSetId: string;
  imageFile: string;
}): string {
  return `/api/homework/generated-candidates/${encodeURIComponent(input.childId)}/${encodeURIComponent(input.choiceSetId)}/${encodeURIComponent(input.imageFile)}`;
}

function imageDataUrlFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".svg" ? "image/svg+xml" : "image/png";
  const data = fs.readFileSync(file);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function domainForProfile(profile: LearningProfile): QuestVisualPromptLabFixture["assignment"]["domain"] {
  const pending = profile.pendingHomework as { homeworkType?: unknown } | undefined;
  const raw = String(profile.activeSessionPlan?.domain ?? pending?.homeworkType ?? "spelling").toLowerCase();
  if (raw.includes("read")) return "reading";
  if (raw.includes("math")) return "math";
  if (raw.includes("science")) return "science";
  return "spelling";
}

function targetWordsForNode(profile: LearningProfile, nodeId: string): string[] {
  const pendingNode = profile.pendingHomework?.nodes?.find((node) => node.id === nodeId);
  const planNode = profile.activeSessionPlan?.nodePlan?.find((node) => node.id === nodeId);
  const words = [
    ...(pendingNode?.words ?? []),
    ...(planNode?.targets ?? []),
    ...(profile.pendingHomework?.wordList ?? []),
  ];
  return [...new Set(words.map((word) => String(word).trim()).filter(Boolean))];
}

type QuestVisualTargetResult = {
  target: string;
  correct: boolean;
  attempts?: number;
  recovered?: boolean;
  hinted?: boolean;
};

type QuestVisualEvidence = {
  nodeId: string;
  contentId?: string;
  recordedAt: string;
  accuracy: number;
  targetResults: QuestVisualTargetResult[];
};

function readLatestQuestEvidence(rootDir: string, childId: string): QuestVisualEvidence | null {
  const dir = path.join(contextDir(rootDir, childId), "activity_results");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".ndjson"))
    .sort()
    .reverse();
  for (const file of files) {
    const rows = fs.readFileSync(path.join(dir, file), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse();
    for (const line of rows) {
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (String(row.nodeType ?? "").toLowerCase() !== "quest") continue;
      const targetResults = Array.isArray(row.targetResults)
        ? row.targetResults
          .map((item): QuestVisualTargetResult | null => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const target = String(record.target ?? "").trim();
            if (!target || typeof record.correct !== "boolean") return null;
            const attempts = Number(record.attempts);
            return {
              target,
              correct: record.correct,
              ...(Number.isFinite(attempts) ? { attempts } : {}),
              ...(typeof record.recovered === "boolean" ? { recovered: record.recovered } : {}),
              ...(typeof record.hinted === "boolean" ? { hinted: record.hinted } : {}),
            };
          })
          .filter((item): item is QuestVisualTargetResult => item != null)
        : [];
      if (targetResults.length === 0) continue;
      return {
        nodeId: String(row.nodeId ?? ""),
        contentId: typeof row.contentId === "string" ? row.contentId : undefined,
        recordedAt: String(row.recordedAt ?? new Date().toISOString()),
        accuracy: Number(row.accuracy ?? 0),
        targetResults,
      };
    }
  }
  return null;
}

function bossTargetsFromQuestEvidence(evidence: QuestVisualEvidence): string[] {
  const weak = evidence.targetResults
    .filter((row) => !row.correct || row.recovered || Number(row.attempts ?? 1) > 1 || row.hinted)
    .map((row) => row.target);
  const secure = evidence.targetResults
    .filter((row) => row.correct && !row.recovered && !row.hinted && Number(row.attempts ?? 1) <= 1)
    .map((row) => row.target);
  return [...new Set([...weak, ...secure].map((word) => word.trim()).filter(Boolean))];
}

function recentSignalsForProfile(profile: LearningProfile): QuestVisualSignal[] {
  const traitEntries = Object.entries(profile.activityTraitModel ?? {})
    .sort((a, b) => Number((b[1] as { positiveWeight?: number }).positiveWeight ?? 0) - Number((a[1] as { positiveWeight?: number }).positiveWeight ?? 0))
    .slice(0, 6)
    .map(([trait]) => trait);
  if (traitEntries.length > 0) {
    return [
      {
        source: "activity-trait-model",
        wrapperTraits: traitEntries,
        outcome: "completed",
        postActivityAction: "replay_same",
        accuracy: null,
        frustration: 0.1,
      },
    ];
  }
  return [
    {
      source: "quest-default",
      wrapperTraits: ["mystery", "visual progress", "choice", "reward"],
      outcome: "completed",
      postActivityAction: "replay_same",
      accuracy: null,
      frustration: 0.1,
    },
  ];
}

function fixtureFromProfile(
  profile: LearningProfile,
  nodeId: string,
  kind: "quest" | "boss",
  questEvidence?: QuestVisualEvidence | null,
): QuestVisualPromptLabFixture {
  const domain = domainForProfile(profile);
  const words = kind === "boss" && questEvidence
    ? bossTargetsFromQuestEvidence(questEvidence)
    : targetWordsForNode(profile, nodeId);
  const cycleTopic =
    profile.activeSessionPlan?.generatedExperienceBriefs?.find((brief) => brief.kind === kind)?.learningGoal ??
    profile.activeSessionPlan?.planTheory?.intervention ??
    (profile.pendingHomework as { title?: string } | undefined)?.title ??
    profile.pendingHomework?.homeworkId ??
    "current homework mastery";
  const concepts =
    profile.activeSessionPlan?.generatedExperienceBriefs?.find((brief) => brief.kind === kind)?.targetConcepts ??
    profile.activeSessionPlan?.nodePlan?.find((node) => node.id === nodeId)?.targets?.slice(0, 4) ??
    [];
  const proofMode = domain === "spelling"
    ? "listen or see a clue, then type the word from memory"
    : domain === "reading"
      ? "use remembered evidence to reveal the next route"
      : domain === "math"
        ? "solve a reasoning lock and explain the chosen operation"
        : "use evidence to stabilize the system";
  return {
    id: `${profile.childId}-${nodeId}`,
    child: {
      name: profile.childId.charAt(0).toUpperCase() + profile.childId.slice(1),
      age: profile.demographics?.age ?? 8,
    },
    assignment: {
      domain,
      masteryTopic: kind === "boss" && questEvidence
        ? `final transfer check after Quest evidence (${Math.round(questEvidence.accuracy * 100)}% Quest accuracy)`
        : cycleTopic,
      skills: concepts.length ? concepts : [cycleTopic],
      proofMode,
      targetWords: domain === "spelling" ? words : undefined,
    },
    recentSignals: recentSignalsForProfile(profile),
  };
}

function stageVisualDirections(
  directions: DiverseQuestVisualDirection[],
  kind: "quest" | "boss",
  questEvidence?: QuestVisualEvidence | null,
): DiverseQuestVisualDirection[] {
  if (kind === "quest") return directions;
  const evidenceLine = questEvidence
    ? `Boss role: this is the transfer/mastery finale after Quest evidence. Probe weak or recovered targets first, then confirm secure targets cold. Quest evidence source: ${questEvidence.contentId ?? questEvidence.nodeId}.`
    : "Boss role: this is the transfer/mastery finale after Quest evidence.";
  return directions.map((direction) => ({
    ...direction,
    title: direction.title.startsWith("Final ") ? direction.title : `Final ${direction.title}`,
    prompt: [
      direction.prompt
        .replace("adaptive learning Quest", "adaptive learning Boss")
        .replace("learning Quest for", "learning Boss for"),
      "",
      evidenceLine,
      "The Boss should feel like the same chosen world has become the final gate, not a disconnected worksheet or generic harder game.",
    ].join("\n"),
  }));
}

function fixtureSvg(direction: DiverseQuestVisualDirection): string {
  const palette = direction.family === "mystery_vault"
    ? ["#07111f", "#fbbf24", "#22d3ee"]
    : direction.family === "strategy_machine"
      ? ["#06131a", "#60a5fa", "#f97316"]
      : ["#081409", "#86efac", "#c084fc"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024">
    <defs><radialGradient id="g" cx="50%" cy="46%" r="58%"><stop offset="0" stop-color="${palette[1]}"/><stop offset=".42" stop-color="${palette[2]}"/><stop offset="1" stop-color="${palette[0]}"/></radialGradient></defs>
    <rect width="1536" height="1024" fill="${palette[0]}"/>
    <circle cx="768" cy="472" r="310" fill="url(#g)" opacity=".86"/>
    <rect x="478" y="620" width="580" height="86" rx="43" fill="rgba(255,255,255,.16)" stroke="${palette[1]}" stroke-width="6"/>
    <circle cx="768" cy="472" r="128" fill="rgba(255,255,255,.22)" stroke="${palette[2]}" stroke-width="8"/>
  </svg>`;
}

async function writeOpenAiImage(input: {
  direction: DiverseQuestVisualDirection;
  imagePath: string;
  model: string;
}): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for paid Quest visual candidates.");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.direction.prompt,
      size: "1536x1024",
      quality: DEFAULT_QUALITY,
      n: 1,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI image generation failed (${response.status}): ${raw.slice(0, 800)}`);
  }
  const parsed = JSON.parse(raw) as { data?: Array<{ b64_json?: string }> };
  const b64 = parsed.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response did not include b64_json.");
  fs.writeFileSync(input.imagePath, Buffer.from(b64, "base64"));
}

export async function prepareQuestVisualCandidates(
  input: PrepareQuestVisualCandidatesInput,
): Promise<PrepareQuestVisualCandidatesResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const profile = readLearningProfile(childId, { rootDir });
  if (!profile?.pendingHomework) return { ok: false, error: "pending_homework_missing" };
  const questEvidence = input.kind === "boss" ? readLatestQuestEvidence(rootDir, childId) : null;
  if (input.kind === "boss" && !questEvidence) {
    return { ok: false, error: "boss_quest_evidence_required" };
  }
  const choiceSetId = input.choiceSetId?.trim() || `${input.kind}-${safeSlug(input.nodeId)}-visuals`;
  const existingManifest = readJson<QuestVisualCandidateManifest>(manifestFile(rootDir, childId, choiceSetId));
  if (
    existingManifest?.kind === input.kind &&
    existingManifest.nodeId === input.nodeId &&
    existingManifest.candidates.every((candidate) => fs.existsSync(candidate.imagePath))
  ) {
    return {
      ok: true,
      choiceSetId,
      candidates: existingManifest.candidates,
      cards: existingManifest.candidates.map((candidate) =>
        candidateToCard(candidate, existingManifest.fixture.assignment.domain, existingManifest.kind),
      ),
      manifestPath: manifestFile(rootDir, childId, choiceSetId),
    };
  }
  const outDir = generatedCandidatesDir(rootDir, childId, choiceSetId);
  const promptsDir = path.join(outDir, "prompts");
  const imagesDir = path.join(outDir, "images");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  const fixture = fixtureFromProfile(profile, input.nodeId, input.kind, questEvidence);
  const directions = stageVisualDirections(
    buildDiverseQuestVisualCandidateDirections(fixture),
    input.kind,
    questEvidence,
  );
  const paid = input.paid === true;
  const model = input.model ?? DEFAULT_MODEL;
  const candidates: PreparedQuestVisualCandidate[] = [];
  for (const direction of directions) {
    const promptPath = path.join(promptsDir, `${direction.id}.txt`);
    fs.writeFileSync(promptPath, direction.prompt, "utf8");
    const imageFile = `${direction.id}.${paid ? "png" : "svg"}`;
    const imagePath = path.join(imagesDir, imageFile);
    if (paid) {
      await writeOpenAiImage({ direction, imagePath, model });
    } else {
      fs.writeFileSync(imagePath, fixtureSvg(direction), "utf8");
    }
    candidates.push({
      id: direction.id,
      family: direction.family,
      title: direction.title,
      description: direction.description,
      wrapperTraits: direction.wrapperTraits,
      imagePath,
      imageFile,
      imageUrl: imageUrlFor({ childId, choiceSetId, imageFile }),
      promptPath,
      provider: paid ? "openai" : "fixture",
      model: paid ? model : "fixture-svg",
    });
  }
  const manifest: QuestVisualCandidateManifest = {
    version: 1,
    childId,
    kind: input.kind,
    nodeId: input.nodeId,
    choiceSetId,
    createdAt: (input.now ?? new Date()).toISOString(),
    homeworkId: profile.pendingHomework.homeworkId ?? profile.activeSessionPlan?.activeHomeworkId,
    fixture,
    candidates,
  };
  const manifestPath = manifestFile(rootDir, childId, choiceSetId);
  writeJson(manifestPath, manifest);
  return {
    ok: true,
    choiceSetId,
    candidates,
    cards: candidates.map((candidate) => candidateToCard(candidate, manifest.fixture.assignment.domain, manifest.kind)),
    manifestPath,
  };
}

function candidateToCard(
  candidate: PreparedQuestVisualCandidate,
  domain: QuestVisualPromptLabFixture["assignment"]["domain"],
  kind: "quest" | "boss",
): MysteryChoiceOption {
  return {
    optionId: candidate.id,
    activityId: `${kind}-visual-candidate`,
    nodeType: kind,
    label: candidate.title,
    purposeLabel: candidate.family.replace(/_/g, " ").toUpperCase(),
    thumbnailUrl: candidate.imageUrl,
    domain,
    activityKind: "generated_learning",
    contentId: `${kind}-visual-candidate-${candidate.id}`,
  };
}

export function resolveQuestVisualCandidateImagePath(input: {
  childId: string;
  choiceSetId: string;
  filename: string;
  rootDir?: string;
}): string | null {
  const rootDir = input.rootDir ?? process.cwd();
  const filename = path.basename(input.filename);
  if (!/^[\w.-]+$/.test(filename)) return null;
  const file = path.join(generatedCandidatesDir(rootDir, input.childId.trim().toLowerCase(), input.choiceSetId), "images", filename);
  return fs.existsSync(file) ? file : null;
}

export async function selectQuestVisualCandidate(
  input: SelectQuestVisualCandidateInput,
): Promise<SelectQuestVisualCandidateResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const now = input.now ?? new Date();
  const childId = input.childId.trim().toLowerCase();
  const profile = readLearningProfile(childId, { rootDir });
  if (!profile?.pendingHomework) return { ok: false, error: "pending_homework_missing" };
  const questEvidence = input.kind === "boss" ? readLatestQuestEvidence(rootDir, childId) : null;
  if (input.kind === "boss" && !questEvidence) {
    return { ok: false, error: "boss_quest_evidence_required" };
  }
  const manifest = readJson<QuestVisualCandidateManifest>(manifestFile(rootDir, childId, input.choiceSetId));
  if (!manifest) return { ok: false, error: "candidate_manifest_missing" };
  if (manifest.kind !== input.kind) return { ok: false, error: "candidate_manifest_kind_mismatch" };
  const selectedCandidate = manifest.candidates.find((candidate) => candidate.id === input.selectedCandidateId);
  if (!selectedCandidate) return { ok: false, error: "candidate_not_found" };
  const directions: DiverseQuestVisualDirection[] = manifest.candidates.map((candidate) => ({
    id: candidate.id,
    family: candidate.family,
    status: "validated_available",
    title: candidate.title,
    description: candidate.description,
    wrapperTraits: candidate.wrapperTraits,
    prompt: fs.existsSync(candidate.promptPath) ? fs.readFileSync(candidate.promptPath, "utf8") : "",
  }));
  const selection = selectQuestVisualCandidateDirection(directions, input.selectedCandidateId);
  const targetWords = input.kind === "boss" && questEvidence
    ? bossTargetsFromQuestEvidence(questEvidence)
    : targetWordsForNode(profile, input.nodeId);
  const imageUrl = imageDataUrlFor(selectedCandidate.imagePath);
  const html = renderPlayableVisualQuestShell({
    kind: input.kind,
    childId,
    candidateId: selectedCandidate.id,
    title: selectedCandidate.title,
    imagePath: imageUrl,
    targetWords,
    assignment: {
      domain: manifest.fixture.assignment.domain,
      title: manifest.fixture.assignment.masteryTopic,
      concepts: manifest.fixture.assignment.skills,
    },
  });
  const staticValidation = validateGeneratedGame(html, {
    words: targetWords,
    homeworkType: manifest.fixture.assignment.domain === "spelling" ? "spelling_test" : manifest.fixture.assignment.domain,
    childId,
    generationStage: input.kind,
  });
  let report: ExperienceArtifactValidationReport = {
    passed: staticValidation.passed,
    score: staticValidation.score,
    failures: [...staticValidation.failures],
    warnings: [...staticValidation.warnings],
    attempts: 1,
    validatedAt: now.toISOString(),
    staticValidation: {
      passed: staticValidation.passed,
      score: staticValidation.score,
      failures: [...staticValidation.failures],
      warnings: [...staticValidation.warnings],
    },
  };
  if (staticValidation.passed) {
    const runtime = await validateGeneratedArtifactRuntime({
      html,
      childId,
      stage: input.kind,
      homeworkType: manifest.fixture.assignment.domain === "spelling" ? "spelling_test" : manifest.fixture.assignment.domain,
      words: targetWords,
      outputDir: path.join(generatedCandidatesDir(rootDir, childId, input.choiceSetId), ".validation", selectedCandidate.id),
      now,
    });
    report = {
      ...runtime,
      passed: runtime.passed,
      score: Math.min(staticValidation.score, runtime.score),
      failures: [...staticValidation.failures, ...runtime.failures],
      warnings: [...staticValidation.warnings, ...runtime.warnings],
      attempts: runtime.attempts,
      validatedAt: runtime.validatedAt,
      staticValidation: report.staticValidation,
    };
  }
  if (!report.passed) return { ok: false, error: "generated_game_validation_failed", validationReport: report };

  const gameDate = profile.pendingHomework.weekOf || now.toISOString().slice(0, 10);
  const newFile = `${input.kind}-${safeSlug(input.choiceSetId)}-${safeSlug(selectedCandidate.id)}.html`;
  const gameHtmlPath = path.join(contextDir(rootDir, childId), "homework", "games", gameDate, newFile);
  fs.mkdirSync(path.dirname(gameHtmlPath), { recursive: true });
  fs.writeFileSync(gameHtmlPath, html, "utf8");
  const contentId = `${input.kind}-visual-${safeSlug(input.choiceSetId)}-${safeSlug(selectedCandidate.id)}`;
  profile.pendingHomework = {
    ...profile.pendingHomework,
    nodes: profile.pendingHomework.nodes.map((node) =>
      node.id === input.nodeId
        ? {
            ...node,
            gameFile: newFile,
            gameHtmlPath,
            date: gameDate,
            contentId,
            words: targetWords,
          }
        : node,
    ),
  };
  writeLearningProfile(childId, profile);
  await updateChildProfileGenerationModel(childId, "sonnet", gameHtmlPath);
  return {
    ok: true,
    selectedCandidateId: selectedCandidate.id,
    notSelectedCandidateIds: selection.choiceEvent.skippedOptionIds,
    newFile,
    gameHtmlPath,
    contentId,
    validationReport: report,
    choiceEvent: selection.choiceEvent,
  };
}
