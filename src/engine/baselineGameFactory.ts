import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { ChildChart } from "../profiles/childChart";
import { getChildChart } from "../profiles/childChart";
import { buildProfile } from "../profiles/buildProfile";
import { ensureQuestHtmlContract } from "../scripts/ingestHomework";
import { generateQuestGameHtml } from "../scripts/generateGame";
import { validateBaselineShellHtml } from "./baselineShellValidation";
import {
  buildBaselineMechanicBriefCandidates,
  formatBaselineMechanicBriefForReview,
  generateBaselineMechanicBriefCandidatesWithLlm,
  type BaselineMechanicBrief,
  type BaselineShellGapRequest,
} from "./baselineMechanicBrief";
import {
  appendContentFeedbackLesson,
  distillContentFeedbackSummary,
  readContentFeedbackLessons,
} from "./contentFeedbackMemory";
import { recordQuestBossArtifactReview } from "./generatedArtifactReview";
import { validateGeneratedArtifactRuntime } from "./generatedArtifactRuntimeValidator";
import { resolveChildContextDir } from "../utils/contextRoot";
import type { AIContentCatalogItem, LearningProfile } from "../context/schemas/learningProfile";
import { writeWaterfallContentCatalog, writeWaterfallHomework } from "../profiles/chartWaterfall";
import { writeActiveSessionPlan } from "./sessionPlanFromChart";
import {
  buildAdventureBoardFromActiveSessionPlan,
  type ActiveSessionPlanBoardSnapshot,
} from "../shared/adventureBoardFromPlan";
import { listDueFactsFromBank } from "./factBankRecorder";
import type { BaselineShellMatch } from "./baselineShellGap";
import { classifyMathConceptCluster } from "./assignmentPlanner";
import { ingestDiagnostic } from "../utils/ingestOutput";
import { engagementTheoryPromptContext } from "./engagementTheory";
import { projectLearningCycle, transitionLearningCycle } from "./learningCycleRepository";

export type BaselineShellArtifact = {
  contentId: string;
  briefId: string;
  filename: string;
  filePath: string;
  gameHtmlPath: string;
  artifactStatus: "ready_for_review" | "approved_ready" | "failed_retryable" | "retired";
  brief: BaselineMechanicBrief;
  validationReport?: {
    passed: boolean;
    failures: string[];
    warnings: string[];
    screenshotPaths: string[];
    worldStateChanged: boolean;
  };
};

function gamesDir(rootDir: string, childId: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "homework", "games");
}

// Quarantined historical source retained temporarily for migration archaeology.
// Homework generation has no call path to this renderer.
function quarantinedLegacyBaselineHtml(brief: BaselineMechanicBrief): string {
  return ensureQuestHtmlContract(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${brief.title}</title>
  <script src="/games/_contract.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f172a; color:#f8fafc; margin:0; padding:24px; }
    #board { max-width:720px; margin:0 auto; }
    .prompt { font-size:28px; margin:16px 0; }
    .choices { display:grid; gap:12px; }
    button { font-size:20px; padding:14px 18px; border-radius:12px; border:none; cursor:pointer; }
    #mute { position:fixed; top:16px; right:16px; font-size:16px; padding:8px 12px; }
    #sunny-companion { position:fixed; right:16px; bottom:16px; width:120px; height:120px; }
  </style>
</head>
<body>
  <div id="board">
    <h1>${brief.title}</h1>
    <p>${brief.mechanic}</p>
    <div class="prompt" id="prompt">Loading...</div>
    <div class="choices" id="choices"></div>
  </div>
  <button id="mute" type="button" aria-label="Mute game sounds">🔊</button>
  <div id="sunny-companion"></div>
  <script>
    const GAME_PARAMS = window.GAME_PARAMS || {};
    const params = new URLSearchParams(window.location.search);
    const configUrl = params.get("config");
    if (!configUrl) {
      document.getElementById("prompt").textContent = "Missing config parameter.";
      throw new Error("Missing config parameter");
    }
    let rounds = [];
    let index = 0;
    let correct = 0;
    let muted = false;
    let audioContext = null;
    const startedAt = Date.now();
    function soundContext() {
      if (muted) return null;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      audioContext ||= new AudioContextCtor();
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
      return audioContext;
    }
    function playTone(frequency, duration, offset = 0) {
      const ctx = soundContext();
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(ctx.currentTime + offset);
      oscillator.stop(ctx.currentTime + offset + duration + 0.02);
    }
    function playResultSound(isCorrect) {
      if (isCorrect) { playTone(660, 0.16); playTone(880, 0.18, 0.08); }
      else playTone(180, 0.18);
    }
    document.getElementById("mute").onclick = () => {
      muted = !muted;
      document.getElementById("mute").textContent = muted ? "🔇" : "🔊";
    };
    async function loadConfig() {
      const response = await fetch(configUrl);
      const config = await response.json();
      rounds = config.rounds || [];
      renderRound();
      if (window.GameBridge) window.GameBridge.reportState({ phase: "loaded", roundCount: rounds.length });
    }
    function renderRound() {
      const round = rounds[index];
      if (!round) return finish();
      document.getElementById("prompt").textContent = round.prompt;
      const choices = document.getElementById("choices");
      choices.innerHTML = "";
      (round.options || []).forEach((option) => {
        const button = document.createElement("button");
        button.textContent = option.label;
        button.onclick = () => handleAnswer(option, round);
        choices.appendChild(button);
      });
      if (window.GameBridge) window.GameBridge.reportState({ phase: "round", index, prompt: round.prompt });
    }
    function handleAnswer(option, round) {
      playTone(420, 0.06);
      const isCorrect = !!option.correct;
      if (isCorrect) correct += 1;
      playResultSound(isCorrect);
      if (window.fireAttemptEvent) {
        window.fireAttemptEvent({
          target: round.id,
          domain: "math",
          correct: isCorrect,
          responseTimeMs: Date.now() - startedAt,
          attempts: 1,
        });
      }
      if (window.fireCompanionEvent) {
        window.fireCompanionEvent(isCorrect ? "correct_answer" : "wrong_answer");
      }
      index += 1;
      renderRound();
    }
    function finish() {
      playTone(523, 0.12); playTone(659, 0.16, 0.08); playTone(784, 0.2, 0.16);
      if (window.fireCompanionEvent) window.fireCompanionEvent("session_complete");
      if (window.sendNodeComplete) {
        window.sendNodeComplete({
          completed: true,
          accuracy: rounds.length ? correct / rounds.length : 1,
          targetsShown: rounds.length,
          targetsCorrect: correct,
          completionSummary: { correct, total: rounds.length, mechanic: "${brief.mechanic}" },
        });
      }
    }
    window.SUNNY_VALIDATION_HOOKS = {
      playthrough: async ({ words }) => {
        if (!rounds.length) await loadConfig();
        for (const round of rounds) {
          const option = (round.options || []).find((entry) => entry.correct) || (round.options || [])[0];
          if (option) handleAnswer(option, round);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      },
    };
    loadConfig().catch((err) => {
      document.getElementById("prompt").textContent = "Could not load config: " + err.message;
    });
  </script>
</body>
</html>`);
}

function buildBaselineGenerationPayload(input: {
  brief: BaselineMechanicBrief;
  gap: BaselineShellGapRequest;
  homework: { title: string; body: string; rounds: Array<{ id: string }> };
  chart: ChildChart;
  preferenceSummary: string;
  configUrl: string;
}): string {
  return JSON.stringify(
    {
      artifactKind: "baseline_shell",
      mechanicBrief: input.brief,
      gap: {
        domain: input.gap.domain,
        skillTarget: input.gap.skillTarget,
        title: input.gap.title,
        reason: input.gap.reason,
      },
      homework: input.homework,
      childEngagementHooks: {
        rewardPreferences: input.chart.learningProfile.rewardPreferences,
        displayName: input.chart.identity.displayName,
      },
      contentFeedbackSummary: input.preferenceSummary,
      engagementTheory: engagementTheoryPromptContext(input.chart.engagementTheory ?? input.chart.learningProfile.engagementTheory ?? null),
      configInjection: {
        configUrlParam: "config",
        configUrl: input.configUrl,
        requiredBehavior:
          "fetch config JSON at runtime from the config query param; never hardcode rounds or targets",
      },
    },
    null,
    2,
  );
}

export async function generateBaselineMechanicBriefCandidates(input: {
  chart: ChildChart;
  gap: BaselineShellGapRequest;
  rootDir?: string;
  homeworkBody?: string;
}): Promise<BaselineMechanicBrief[]> {
  const rootDir = input.rootDir ?? process.cwd();
  const lessons = readContentFeedbackLessons(rootDir, input.chart.childId);
  const preferenceSummary = distillContentFeedbackSummary(lessons);
  const hooks = input.chart.learningProfile.rewardPreferences?.favoriteGames?.length
    ? input.chart.learningProfile.rewardPreferences.favoriteGames.map(String)
    : ["adventure", "challenge"];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      ingestDiagnostic(
        `🎮 [baseline-factory] [brief-llm] child=${input.chart.childId} homework=${input.gap.homeworkId}`,
      );
      return await generateBaselineMechanicBriefCandidatesWithLlm({
        gap: input.gap,
        preferenceSummary,
        childHooks: hooks,
        homeworkBody: input.homeworkBody,
        engagementTheoryContext: engagementTheoryPromptContext(input.chart.engagementTheory ?? input.chart.learningProfile.engagementTheory ?? null),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ingestDiagnostic(`🎮 [baseline-factory] [brief-fallback] reason=${message}`);
    }
  }

  return buildBaselineMechanicBriefCandidates({
    gap: input.gap,
    preferenceSummary,
    childHooks: hooks,
  });
}

async function buildValidatedBaselineHtml(input: {
  chart: ChildChart;
  gap: BaselineShellGapRequest;
  brief: BaselineMechanicBrief;
  homework: { title: string; body: string; rounds: Array<{ id: string }> };
  preferenceSummary: string;
  configUrl: string;
  configFilePath: string;
  targetIds: string[];
  validationOutputDir: string;
  client: Anthropic;
}): Promise<{ html: string; report: BaselineShellArtifact["validationReport"] }> {
  const childId = input.chart.childId;
  const payload = buildBaselineGenerationPayload({
    brief: input.brief,
    gap: input.gap,
    homework: input.homework,
    chart: input.chart,
    preferenceSummary: input.preferenceSummary,
    configUrl: input.configUrl,
  });
  const childProfile = await buildProfile(childId);
  if (!childProfile) {
    throw new Error(`No profile found for child ${childId}`);
  }

  const generateHtml = async (validationFeedback?: string): Promise<string> => {
    return ensureQuestHtmlContract(
      await generateQuestGameHtml({
        client: input.client,
        extractedJsonPretty: payload,
        homeworkType: "baseline",
        childProfile,
        validationFeedback,
        maxTokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 16384),
        // One-time shell build: quality matters most and the cost amortizes
        // over every refill, so use the strongest model.
        model: process.env.SUNNY_GENERATION_MODEL ?? "claude-sonnet-5",
      }),
    );
  };

  let feedback: string | undefined;
  let lastFailure = "Generated activity did not satisfy its acceptance manifest.";
  for (let attempt = 1; attempt <= baselineGenerationAttemptLimit(); attempt += 1) {
    const html = await generateHtml(feedback);
    const validation = validateBaselineShellHtml(html, {
      childId,
      homeworkType: input.gap.domain,
      targets: input.targetIds,
      expectedTitle: input.brief.title,
    });
    if (!validation.passed) {
      lastFailure = `Baseline shell validation failed: ${validation.failures.join("; ")}`;
      ingestDiagnostic(`🎮 [baseline-factory] [retry] child=${childId} failures=${validation.failures.join(" | ")}`);
      feedback = `Fix every static contract failure. Do not remove working behavior:\n${validation.failures.join("\n")}\n${validation.warnings.join("\n")}`;
      continue;
    }

    const runtime = await validateGeneratedArtifactRuntime({
      html,
      childId,
      stage: "baseline",
      homeworkType: input.gap.domain,
      words: input.targetIds,
      outputDir: input.validationOutputDir,
      activityConfig: { urlPath: input.configUrl, filePath: input.configFilePath },
    });
    const screenshotPaths = runtime.runtimeValidation?.screenshotPaths ?? [];
    const report = {
      passed: runtime.passed,
      failures: [...validation.failures, ...runtime.failures],
      warnings: [...validation.warnings, ...runtime.warnings],
      screenshotPaths,
      worldStateChanged: new Set(
        screenshotPaths
          .filter((file) => fs.existsSync(file))
          .map((file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex")),
      ).size > 1,
    };
    if (runtime.passed) {
      ingestDiagnostic(`🎮 [baseline-factory] [validated] child=${childId} attempts=${attempt} screenshots=${screenshotPaths.length}`);
      return { html, report };
    }

    lastFailure = `Baseline runtime validation failed: ${runtime.failures.join("; ")}`;
    ingestDiagnostic(`🎮 [baseline-factory] [runtime-retry] child=${childId} failures=${runtime.failures.join(" | ")}`);
    feedback = [
      "The HTML passed static checks but failed a real Chromium playthrough.",
      "Fix the runtime interaction and evidence flow while preserving the exact title, mechanic, visual identity, and config loading.",
      ...runtime.failures,
    ].join("\n");
  }
  throw new Error(lastFailure);
}

export function baselineGenerationAttemptLimit(): number {
  return 3;
}

export async function generateBaselineShellArtifact(input: {
  chart: ChildChart;
  gap: BaselineShellGapRequest;
  brief: BaselineMechanicBrief;
  homeworkId: string;
  configFilename: string;
  homework?: { title: string; body: string; rounds: Array<{ id: string }> };
  configFilePath?: string;
  rootDir?: string;
  generateHtml?: (args: { brief: BaselineMechanicBrief; configUrl: string }) => Promise<string> | string;
  skipRuntimeValidation?: boolean;
}): Promise<BaselineShellArtifact> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.chart.childId;
  const dir = gamesDir(rootDir, childId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${input.homeworkId}-${input.brief.briefId}.html`;
  const filePath = path.join(dir, filename);
  const configUrl = `/api/activity-config/${childId}/${input.homeworkId}/${input.configFilename}`;
  if (!input.generateHtml) {
    throw new Error("Baseline generation blocked: an AI-authored HTML generator is required.");
  }
  const html = ensureQuestHtmlContract(await input.generateHtml({ brief: input.brief, configUrl }));

  const staticValidation = validateBaselineShellHtml(html, {
    childId,
    homeworkType: input.gap.domain,
    targets: input.homework?.rounds.map((round) => round.id) ?? [],
    expectedTitle: input.brief.title,
  });
  if (!staticValidation.passed) {
    throw new Error(`Baseline shell validation failed: ${staticValidation.failures.join("; ")}`);
  }

  fs.writeFileSync(filePath, html, "utf8");
  const contentId = `${input.homeworkId}:generated-baseline:${input.brief.briefId}`;
  const artifact: BaselineShellArtifact = {
    contentId,
    briefId: input.brief.briefId,
    filename,
    filePath,
    gameHtmlPath: filePath,
    artifactStatus: "ready_for_review",
    brief: input.brief,
  };
  ingestDiagnostic(`🎮 [baseline-factory] [generated] child=${childId} file=${filename}`);
  return artifact;
}

export function reviewBaselineShellArtifact(input: {
  rootDir?: string;
  childId: string;
  artifact: BaselineShellArtifact;
  decision: "approve" | "revise" | "reject" | "regenerate";
  reason: string;
  reviewer?: string;
}): void {
  const rootDir = input.rootDir ?? process.cwd();
  recordQuestBossArtifactReview({
    rootDir,
    childId: input.childId,
    artifactPath: input.artifact.filePath,
    contentId: input.artifact.contentId,
    briefId: input.artifact.briefId,
    decision: input.decision,
    reason: input.reason,
    reviewer: input.reviewer,
    reusableLessons: [input.artifact.brief.mechanic, input.artifact.brief.theme],
  });
  appendContentFeedbackLesson(rootDir, input.childId, {
    contentId: input.artifact.contentId,
    mechanic: input.artifact.brief.mechanic,
    theme: input.artifact.brief.theme,
    domain: input.artifact.brief.domain,
    decision: input.decision,
    reason: input.reason,
    source: "human_review",
  });
}

export function catalogBaselineShellArtifact(input: {
  artifact: BaselineShellArtifact;
  childId: string;
  homeworkId: string;
  evidenceUsed: string[];
  theoryDecisionId?: string;
  engagementTheoryId?: string;
  experimentId?: string;
  artworkStatus?: "generated" | "fallback" | "missing";
}): AIContentCatalogItem {
  return {
    contentId: input.artifact.contentId,
    theoryDecisionId:
      input.theoryDecisionId ?? `theory:homework:${input.homeworkId}:generation`,
    engagementTheoryId: input.engagementTheoryId,
    experimentId: input.experimentId,
    childId: input.childId,
    homeworkId: input.homeworkId,
    source: "generated_shell",
    type: "game",
    title: input.artifact.brief.title,
    activityId: "generated-baseline",
    algorithmTargets: ["retrieval-practice", "desirable-difficulty"],
    targetSkills: [input.artifact.brief.skillTarget],
    targetConcepts: [input.artifact.brief.domain],
    targetWords: [],
    engagementHooks: [input.artifact.brief.theme],
    mechanic: input.artifact.brief.mechanic,
    theme: input.artifact.brief.theme,
    sfxProfile: "tap-correct-wrong-progress-complete",
    companionPolicy: "talk-to-sunny",
    artworkStatus: input.artworkStatus ?? "fallback",
    inputEvidence: {
      activityEvidenceIds: input.evidenceUsed,
    },
    reuseStatus: "candidate",
    reuseReason: "Generated baseline shell awaiting human review",
    reviewStatus: input.artifact.artifactStatus,
    gameHtmlPath: input.artifact.gameHtmlPath,
    domain: input.artifact.brief.domain,
    skillTarget: input.artifact.brief.skillTarget,
  };
}

export function printBaselineBriefMenu(briefs: BaselineMechanicBrief[]): void {
  briefs.forEach((brief, index) => {
    ingestDiagnostic(`\n--- Candidate ${index + 1} ---`);
    ingestDiagnostic(formatBaselineMechanicBriefForReview(brief));
  });
}

export async function generateBaselineShellWithLlm(input: {
  chart: ChildChart;
  gap: BaselineShellGapRequest;
  brief: BaselineMechanicBrief;
  homeworkId: string;
  configFilename: string;
  homework: { title: string; body: string; rounds: Array<{ id: string }> };
  configFilePath: string;
  rootDir?: string;
  validationOutputDir?: string;
}): Promise<BaselineShellArtifact> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.chart.childId;
  const dir = gamesDir(rootDir, childId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${input.homeworkId}-${input.brief.briefId}.html`;
  const filePath = path.join(dir, filename);
  const configUrl = `/api/activity-config/${childId}/${input.homeworkId}/${input.configFilename}`;
  const lessons = readContentFeedbackLessons(rootDir, childId);
  const preferenceSummary = distillContentFeedbackSummary(lessons);
  const targetIds = input.homework.rounds.map((round) => round.id);
  const validationOutputDir =
    input.validationOutputDir ?? path.join(dir, `${input.homeworkId}-validation`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Baseline generation blocked: ANTHROPIC_API_KEY is required; generic homework fallback is disabled.");
  }

  const client = new Anthropic({ apiKey });
  const { html, report } = await buildValidatedBaselineHtml({
    chart: input.chart,
    gap: input.gap,
    brief: input.brief,
    homework: input.homework,
    preferenceSummary,
    configUrl,
    configFilePath: input.configFilePath,
    targetIds,
    validationOutputDir,
    client,
  });

  fs.writeFileSync(filePath, html, "utf8");
  const contentId = `${input.homeworkId}:generated-baseline:${input.brief.briefId}`;
  ingestDiagnostic(`🎮 [baseline-factory] [generated-llm] child=${childId} file=${filename}`);
  return {
    contentId,
    briefId: input.brief.briefId,
    filename,
    filePath,
    gameHtmlPath: filePath,
    artifactStatus: report?.passed ? "ready_for_review" : "failed_retryable",
    brief: input.brief,
    validationReport: report,
  };
}

function upsertCatalogItem(
  catalog: AIContentCatalogItem[],
  item: AIContentCatalogItem,
): AIContentCatalogItem[] {
  const index = catalog.findIndex((entry) => entry.contentId === item.contentId);
  if (index < 0) return [...catalog, item];
  const next = [...catalog];
  next[index] = { ...next[index], ...item };
  return next;
}

export type BaselineLaneRound = {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string; correct: boolean }>;
};

function isAssessableDueMathFact(fact: { prompt: string; answer: string }): boolean {
  const prompt = fact.prompt.trim();
  return prompt.toLowerCase() !== fact.answer.trim().toLowerCase() &&
    (/\d+\s*[x×÷+\-]\s*\d+/i.test(prompt) || /\?$/.test(prompt));
}

function isAssessableMathRound(round: BaselineLaneRound): boolean {
  const prompt = round.prompt.trim();
  return /\d+\s*[x×÷+\-]\s*\d+/i.test(prompt) || /\?$/.test(prompt);
}

/**
 * One config per generated-baseline lane: rounds are matched to the lane's
 * concept cluster so two lanes on the board test different sub-skills instead
 * of being reskins of the same round list. SM2-due facts go to the first lane.
 */
export function refillBaselineLaneConfigs(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  title: string;
  homeworkRounds: BaselineLaneRound[];
  nodes: Array<{ id: string; type: string; title?: string; words?: string[] }>;
  /** Planner-authored rounds per node; when present they win over cluster matching. */
  roundsByNodeId?: Record<string, BaselineLaneRound[]>;
  domain?: string;
}): Record<string, string> {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const domain = input.domain?.trim().toLowerCase() || "math";
  const laneNodes = input.nodes.filter((node) => node.type === "generated-baseline");
  if (laneNodes.length === 0) return {};

  const dueFacts = listDueFactsFromBank(childId, { rootDir, limit: 8 })
    .filter(isAssessableDueMathFact)
    .slice(0, 4);
  const dueRounds: BaselineLaneRound[] = dueFacts.map((fact, index) => ({
    id: `due-${index + 1}`,
    prompt: fact.prompt,
    options: [
      { id: "a", label: fact.answer, correct: true },
      { id: "b", label: "0", correct: false },
    ],
  }));

  const configDir = path.join(
    resolveChildContextDir(childId, { rootDir }),
    "homework",
    "games",
    input.homeworkId,
  );
  fs.mkdirSync(configDir, { recursive: true });

  const clusterForTexts = (texts: string[]): string | null => {
    const counts = new Map<string, number>();
    for (const text of texts) {
      const cluster = classifyMathConceptCluster(text);
      if (cluster) counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  const out: Record<string, string> = {};
  laneNodes.forEach((node, laneIndex) => {
    const plannerRounds = input.roundsByNodeId?.[node.id]
      ?.filter((round) => domain !== "math" || isAssessableMathRound(round));
    const laneCluster = plannerRounds?.length ? null : clusterForTexts(node.words ?? []);
    const matchedRounds = laneCluster
      ? input.homeworkRounds.filter((round) => classifyMathConceptCluster(round.prompt) === laneCluster)
      : [];
    const baseRounds = plannerRounds?.length
      ? plannerRounds
      : matchedRounds.length > 0 ? matchedRounds : input.homeworkRounds;
    const rounds = [...baseRounds, ...(laneIndex === 0 ? dueRounds : [])].slice(0, 12);
    const configFilename = `generated-baseline-${node.id}.json`;
    const configPath = path.join(configDir, configFilename);
    fs.writeFileSync(configPath, `${JSON.stringify({
      schemaVersion: 1,
      activityId: "generated-baseline",
      engine: { id: "generated-baseline", mode: "practice" },
      topic: node.title?.trim() || input.title,
      assignmentTitle: input.title,
      domain,
      learningGoal: laneCluster ? `${input.title} — ${laneCluster.replace(/_/g, " ")}` : input.title,
      gradeBand: "early_elementary",
      targets: rounds.map((round) => ({ id: round.id, label: round.prompt, type: "fact" })),
      rounds,
      dueFactIds: laneIndex === 0 ? dueFacts.map((fact) => fact.factId) : [],
      evidencePolicy: {
        writesPracticeEvidence: true,
        writesMasteryEvidence: false,
        requiresPerTargetResult: true,
        allowedEvidence: ["practice"],
      },
    }, null, 2)}\n`, "utf8");
    out[node.id] = `/api/activity-config/${childId}/${input.homeworkId}/${configFilename}`;
    ingestDiagnostic(
      `🎮 [baseline-factory] [lane-refill] child=${childId} node=${node.id} source=${plannerRounds?.length ? "planner" : laneCluster ?? "mixed"} rounds=${rounds.length}`,
    );
  });
  return out;
}

export function attachBaselineShellToHomework(input: {
  rootDir?: string;
  childId: string;
  artifact: BaselineShellArtifact;
  activityConfigPath: string;
  configPathByNodeId?: Record<string, string>;
  /** Distinct shell per node; nodes absent from the map fall back to input.artifact. */
  artifactByNodeId?: Record<string, BaselineShellArtifact>;
  /** When set, only these generated-baseline nodes are (re)stamped; others keep their attachment. */
  onlyNodeIds?: string[];
}): void {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const chart = getChildChart(childId, { rootDir });
  const pendingHomework = chart.homework.pending;
  if (!pendingHomework) {
    throw new Error("attachBaselineShellToHomework: no pending homework");
  }

  const profilePath = path.join(resolveChildContextDir(childId, { rootDir }), "learning_profile.json");
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as LearningProfile;

  const homeworkId =
    pendingHomework.homeworkId ??
    pendingHomework.weekOf ??
    input.artifact.contentId.split(":")[0] ??
    "sample";
  const artifactForNode = (nodeId: string): BaselineShellArtifact =>
    input.artifactByNodeId?.[nodeId] ?? input.artifact;
  const nodeInScope = (nodeId: string): boolean =>
    !input.onlyNodeIds || input.onlyNodeIds.includes(nodeId);

  const nextNodes = pendingHomework.nodes.map((node) => {
    if (node.type !== "generated-baseline" || !nodeInScope(node.id)) return node;
    return {
      ...node,
      gameHtmlPath: artifactForNode(node.id).gameHtmlPath,
      activityConfigPath: input.configPathByNodeId?.[node.id] ?? input.activityConfigPath,
      date: homeworkId,
      artifactStatus: "approved_ready" as const,
      approved: true,
    };
  });

  const distinctArtifacts = new Map<string, BaselineShellArtifact>();
  distinctArtifacts.set(input.artifact.contentId, input.artifact);
  for (const artifact of Object.values(input.artifactByNodeId ?? {})) {
    distinctArtifacts.set(artifact.contentId, artifact);
  }
  // learning_profile.json is a doorway projection and usually omits the
  // catalog. Read the chart-hydrated catalog so attaching one node cannot
  // erase previously approved shells needed by the next controlled arm.
  let nextCatalog = chart.learningProfile.aiContentCatalog ?? profile.aiContentCatalog ?? [];
  for (const artifact of distinctArtifacts.values()) {
    const artifactNode = Object.entries(input.artifactByNodeId ?? {})
      .find(([, candidate]) => candidate.contentId === artifact.contentId)?.[0];
    const planNode = chart.activeSessionPlan?.nodePlan.find((node) => node.id === artifactNode);
    const catalogItem = catalogBaselineShellArtifact({
      artifact: { ...artifact, artifactStatus: "approved_ready" },
      childId,
      homeworkId,
      evidenceUsed: [homeworkId],
      theoryDecisionId: chart.activeSessionPlan?.planId
        ? `theory:${chart.activeSessionPlan.planId}`
        : undefined,
      engagementTheoryId: planNode?.theoryId ?? chart.engagementTheory?.theoryId,
      experimentId: planNode?.experimentId,
      artworkStatus: planNode?.thumbnailUrl?.includes("/generated/") ? "generated" : "fallback",
    });
    catalogItem.reuseStatus = "reuse";
    catalogItem.reviewStatus = "approved_ready";
    catalogItem.reviewDecision = "approve";
    nextCatalog = upsertCatalogItem(nextCatalog, catalogItem);
  }

  const nextProfile: LearningProfile = {
    ...profile,
    pendingHomework: {
      ...pendingHomework,
      nodes: nextNodes,
    },
    aiContentCatalog: nextCatalog,
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(profilePath, `${JSON.stringify(nextProfile, null, 2)}\n`, "utf8");
  writeWaterfallHomework(childId, nextProfile, { rootDir });
  writeWaterfallContentCatalog(childId, nextProfile, { rootDir });

  // The V2 cycle is the decision record. Compatibility files above may mirror
  // evidence/catalog data, but an activity is launchable only after the exact
  // validated artifact is bound through a versioned cycle transition.
  let canonicalCycle = chart.learningCycle;
  if (canonicalCycle) {
    for (const node of canonicalCycle.nodes) {
      if (node.role !== "baseline" || !nodeInScope(node.nodeId)) continue;
      const artifact = artifactForNode(node.nodeId);
      const artworkPath = node.artwork.localPath;
      const artifactMatchesContract =
        artifact.brief.title.trim().toLowerCase() === node.title.trim().toLowerCase() &&
        artifact.brief.domain.trim().toLowerCase() === node.academicTarget.domain.trim().toLowerCase() &&
        artifact.brief.skillTarget.trim().toLowerCase() === node.academicTarget.skill.trim().toLowerCase() &&
        artifact.brief.mechanic.trim().toLowerCase() === node.mechanic.trim().toLowerCase() &&
        artifact.brief.theme.trim().toLowerCase() === node.theme.trim().toLowerCase();
      if (artifact.validationReport?.passed !== true || !artworkPath || !artifactMatchesContract) {
        ingestDiagnostic(
          `🎮 [baseline-factory] [canonical-bind-blocked] child=${childId} node=${node.nodeId} reason=${!artworkPath ? "missing_local_artwork" : artifact.validationReport?.passed !== true ? "runtime_validation_missing" : "artifact_contract_mismatch"}`,
        );
        continue;
      }
      const contractFingerprint = createHash("sha256").update(JSON.stringify({
        nodeId: node.nodeId,
        title: node.title,
        domain: node.academicTarget.domain,
        skill: node.academicTarget.skill,
        targets: node.academicTarget.targets,
        mechanic: node.mechanic,
        theme: node.theme,
        openingScreen: node.openingScreen,
        sfxContract: node.sfxContract,
        companionContract: node.companionContract,
        evidenceContract: node.evidenceContract,
        contentId: artifact.contentId,
      })).digest("hex").slice(0, 24);
      canonicalCycle = transitionLearningCycle(childId, homeworkId, canonicalCycle.revision, {
        type: "artifact_bound",
        nodeId: node.nodeId,
        artifact: {
          contentId: artifact.contentId,
          artifactId: artifact.briefId,
          localArtifactPath: artifact.gameHtmlPath,
          localArtworkPath: artworkPath,
          activityConfigPath: input.configPathByNodeId?.[node.nodeId] ?? input.activityConfigPath,
          contractFingerprint,
          validationStatus: "passed",
          validationProof: {
            engine: "playwright",
            passed: artifact.validationReport!.passed,
            worldStateChanged: artifact.validationReport!.worldStateChanged === true,
            screenshotPaths: artifact.validationReport!.screenshotPaths ?? [],
          },
        },
      }, { rootDir });
    }
  }

  // The adventure board launches from activeSessionPlan.nodePlan, not
  // pendingHomework.nodes, so the shell must be stamped there too or every
  // generated-baseline board click resolves to an empty launch URL.
  const activePlan = chart.activeSessionPlan;
  if (canonicalCycle) {
    writeActiveSessionPlan(childId, projectLearningCycle(canonicalCycle).activeSessionPlan, { rootDir });
  } else if (activePlan?.nodePlan.some((node) => node.type === "generated-baseline")) {
    const attachedPlan = {
      ...activePlan,
      nodePlan: activePlan.nodePlan.map((node) =>
        node.type === "generated-baseline" && nodeInScope(node.id)
          ? {
              ...node,
              gameHtmlPath: artifactForNode(node.id).gameHtmlPath,
              contentId: artifactForNode(node.id).contentId,
              // The attached artifact is the runtime truth. Do not leave the
              // planner's proposed mechanic on the board after reuse/generation
              // selects a different approved shell.
              mechanic: artifactForNode(node.id).brief.mechanic,
              theme: artifactForNode(node.id).brief.theme,
               activityConfigPath:
                 input.configPathByNodeId?.[node.id] ?? input.activityConfigPath,
               validationProof: {
                 engine: "playwright" as const,
                 passed: artifactForNode(node.id).validationReport?.passed === true,
                 worldStateChanged: artifactForNode(node.id).validationReport?.worldStateChanged === true,
                 screenshotPaths: artifactForNode(node.id).validationReport?.screenshotPaths ?? [],
               },
             }
          : node,
      ),
    };
    const nextBoard = attachedPlan.adventureBoard
      ? buildAdventureBoardFromActiveSessionPlan({
          plan: attachedPlan as unknown as ActiveSessionPlanBoardSnapshot,
          boardId: attachedPlan.adventureBoard.boardId,
          title: attachedPlan.adventureBoard.title,
          theme: attachedPlan.adventureBoard.theme,
          layout: attachedPlan.adventureBoard.layout,
          plannerRationale: attachedPlan.adventureBoard.plannerRationale,
          companion: attachedPlan.adventureBoard.companion,
          labelForNode: (node) => node.title,
          thumbnailForNode: (node) => node.thumbnailUrl,
        })
      : undefined;
    writeActiveSessionPlan(childId, {
      ...attachedPlan,
      ...(nextBoard ? { adventureBoard: nextBoard } : {}),
    }, { rootDir });
  }
  ingestDiagnostic(
    `🎮 [baseline-factory] [attached] child=${childId} shell=${path.basename(input.artifact.gameHtmlPath)} homework=${homeworkId}`,
  );
}

export function refillBaselineShellConfig(input: {
  rootDir?: string;
  childId: string;
  shell: BaselineShellMatch;
  homeworkId: string;
  title: string;
  homeworkRounds: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; label: string; correct: boolean }>;
  }>;
  configFilename?: string;
}): { configPath: string; activityConfigPath: string; gameHtmlPath: string } {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const configFilename = input.configFilename ?? "generated-baseline.json";
  const dueFacts = listDueFactsFromBank(childId, { rootDir, limit: 8 })
    .filter(isAssessableDueMathFact)
    .slice(0, 4);
  const dueRounds = dueFacts.map((fact, index) => ({
    id: `due-${index + 1}`,
    prompt: fact.prompt,
    options: [
      { id: "a", label: fact.answer, correct: true },
      { id: "b", label: "0", correct: false },
    ],
  }));
  const rounds = [...input.homeworkRounds, ...dueRounds].slice(0, 12);
  const configDir = path.join(
    resolveChildContextDir(childId, { rootDir }),
    "homework",
    "games",
    input.homeworkId,
  );
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, configFilename);
  const config = {
    schemaVersion: 1,
    activityId: "generated-baseline",
    engine: { id: "generated-baseline", mode: "practice" },
    topic: input.title,
    domain: "math",
    learningGoal: input.title,
    gradeBand: "early_elementary",
    targets: rounds.map((round) => ({ id: round.id, label: round.prompt, type: "fact" })),
    rounds,
    dueFactIds: dueFacts.map((fact) => fact.factId),
    evidencePolicy: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const activityConfigPath = `/api/activity-config/${childId}/${input.homeworkId}/${configFilename}`;
  const gameHtmlPath = input.shell.gameHtmlPath ?? "";
  ingestDiagnostic(
    `🎮 [baseline-factory] [refill] child=${childId} homework=${input.homeworkId} rounds=${rounds.length} dueFacts=${dueFacts.length}`,
  );
  return { configPath, activityConfigPath, gameHtmlPath };
}
