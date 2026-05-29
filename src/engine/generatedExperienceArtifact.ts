import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { ChildChart } from "../profiles/childChart";
import { getChildChart } from "../profiles/childChart";
import {
  inferHomeworkDomainFromPending,
  selectedHomeworkDomain,
  withActiveHomeworkLane,
  withActiveSessionPlanLane,
} from "./homeworkLanes";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  LearningExperiment,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { ensureQuestHtmlContract } from "../scripts/ingestHomework";
import { generateQuestGameHtml } from "../scripts/generateGame";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import { validateGeneratedArtifactRuntime } from "./generatedArtifactRuntimeValidator";
import {
  attachArtifactToHomeworkNode,
  catalogAdaptiveQuestArtifact,
  generateAdaptiveQuestArtifact,
  markAdaptiveArtifactValidation,
  type AdaptiveQuestArtifact,
  type AdaptiveQuestArtifactStage,
} from "./adaptiveQuestArtifact";
import { upsertProfileContentCatalog } from "./learningDecisionContext";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  appendDecisionTrace,
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
  writeWaterfallContentCatalog,
  writeWaterfallHomework,
  writeWaterfallSessionPlan,
} from "../profiles/chartWaterfall";
import {
  buildExperienceContextPacket,
  type ExperienceContextPacket,
} from "./experienceContextPacket";
import { buildExperiencePlannerInput } from "./experiencePlanner";

export type GenerateExperienceHtmlArgs = {
  childId: string;
  chart: ChildChart;
  profile: LearningProfile;
  plan: ActiveSessionPlan;
  brief: GeneratedExperienceBrief;
  parentFeedback?: string;
  experienceContextPacket: ExperienceContextPacket;
  homeworkCycle: HomeworkCycle;
  artifact: AdaptiveQuestArtifact;
  validationFeedback?: {
    failures: string[];
    warnings: string[];
    instruction: string;
  };
};

type QuestBossBrief = GeneratedExperienceBrief & { kind: AdaptiveQuestArtifactStage };

export type GenerateExperienceArtifactFromChartInput = {
  childId: string;
  rootDir?: string;
  now?: Date;
  briefId?: string;
  kind?: AdaptiveQuestArtifactStage;
  parentFeedback?: string;
  generateHtml?: (args: GenerateExperienceHtmlArgs) => Promise<string> | string;
  validateRuntime?: (args: {
    html: string;
    childId: string;
    stage: AdaptiveQuestArtifactStage;
    homeworkType: string;
    words: string[];
    outputDir: string;
    now: Date;
  }) => Promise<ExperienceArtifactValidationReport>;
};

export type ExperienceArtifactValidationReport = {
  passed: boolean;
  score: number;
  failures: string[];
  warnings: string[];
  attempts: number;
  validatedAt: string;
  staticValidation?: {
    passed: boolean;
    score: number;
    failures: string[];
    warnings: string[];
  };
  runtimeValidation?: {
    engine?: "playwright";
    passed: boolean;
    screenshotPaths: string[];
    consoleErrors: string[];
    pageErrors: string[];
    attemptedTargets: number;
    completed: boolean;
    completionPayloads: unknown[];
    usedValidationHook: boolean;
  };
};

export type GeneratedExperienceArtifactResult =
  | {
      ok: true;
      childId: string;
      homeworkId: string;
      briefId: string;
      stage: AdaptiveQuestArtifactStage;
      filename: string;
      filePath: string;
      contentId: string;
      validationReport: ExperienceArtifactValidationReport;
    }
  | {
      ok: false;
      childId: string;
      homeworkId?: string;
      briefId?: string;
      stage?: AdaptiveQuestArtifactStage;
      reason: string;
      validationReport?: ExperienceArtifactValidationReport;
    };

function contextDir(rootDir: string, childId: string): string {
  return resolveChildContextDir(childId, { rootDir });
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`🎮 [experience-artifact] [read-json-failed] file=${file} error=${message}`);
    return null;
  }
}

function writeJson(file: string, value: unknown, now: Date): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (value && typeof value === "object" && "lastUpdated" in value) {
    (value as { lastUpdated?: string }).lastUpdated = now.toISOString();
  }
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readProfile(rootDir: string, childId: string): LearningProfile | null {
  const profile = readJson<LearningProfile>(path.join(contextDir(rootDir, childId), "learning_profile.json"));
  return profile ? hydrateLearningProfileFromWaterfall(childId, profile, { rootDir }) : null;
}

function writeProfile(rootDir: string, childId: string, profile: LearningProfile, now: Date): void {
  writeWaterfallHomework(childId, profile, { rootDir, now });
  writeWaterfallSessionPlan(childId, profile, { rootDir, now });
  writeWaterfallContentCatalog(childId, profile, { rootDir, now });
  writeJson(path.join(contextDir(rootDir, childId), "learning_profile.json"), slimLearningProfileForDoorway(profile), now);
}

function writeFailedValidationArtifacts(args: {
  validationOutputDir: string;
  html: string;
  report: ExperienceArtifactValidationReport;
  childId: string;
  stage: AdaptiveQuestArtifactStage;
  briefId: string;
}): void {
  fs.mkdirSync(args.validationOutputDir, { recursive: true });
  fs.writeFileSync(path.join(args.validationOutputDir, "failed-generated-artifact.html"), args.html, "utf8");
  fs.writeFileSync(
    path.join(args.validationOutputDir, "failed-validation-report.json"),
    JSON.stringify(args.report, null, 2),
    "utf8",
  );
  console.log(
    `🎮 [experience-artifact] [failed-html-saved] child=${args.childId} stage=${args.stage} brief=${args.briefId}`,
  );
}

function readHomeworkCycle(rootDir: string, childId: string, homeworkId: string): HomeworkCycle | null {
  return readJson<HomeworkCycle>(
    path.join(contextDir(rootDir, childId), "homework", "cycles", `${homeworkId}.json`),
  );
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "artifact";
}

function findBrief(
  plan: ActiveSessionPlan | null | undefined,
  opts: { briefId?: string; kind?: AdaptiveQuestArtifactStage },
): QuestBossBrief | null {
  const briefs = plan?.generatedExperienceBriefs ?? [];
  const candidates = briefs.filter((brief): brief is QuestBossBrief => brief.kind === "quest" || brief.kind === "boss");
  if (opts.briefId) return candidates.find((brief) => brief.briefId === opts.briefId) ?? null;
  if (opts.kind) return candidates.find((brief) => brief.kind === opts.kind) ?? null;
  return candidates[0] ?? null;
}

function updateBriefStatus(
  plan: ActiveSessionPlan | undefined,
  briefId: string,
  status: GeneratedExperienceBrief["artifactStatus"],
): ActiveSessionPlan | undefined {
  if (!plan) return plan;
  return {
    ...plan,
    generatedExperienceBriefs: (plan.generatedExperienceBriefs ?? []).map((brief) =>
      brief.briefId === briefId ? { ...brief, artifactStatus: status } : brief,
    ),
  };
}

function defaultQuestHtml(args: GenerateExperienceHtmlArgs): string {
  const title = args.brief.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const wordsJson = JSON.stringify(args.artifact.targetWords);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="/games/_contract.js"></script>
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, sans-serif; background: #fff7e1; color: #1f0f2d; display: grid; place-items: center; }
    main { width: min(720px, calc(100vw - 48px)); border: 3px solid #1f0f2d; border-radius: 8px; padding: 28px; background: #ffffff; box-shadow: 0 8px 0 #fcd34d; }
    h1 { margin: 0 0 12px; font-size: 36px; }
    p { font-size: 18px; line-height: 1.4; }
    button { border: 3px solid #1f0f2d; border-radius: 8px; background: #7c3aed; color: white; font-weight: 800; font-size: 20px; padding: 14px 18px; }
    .round { display: none; gap: 12px; margin-top: 18px; }
    .round.active { display: grid; }
    input { border: 3px solid #1f0f2d; border-radius: 8px; font-size: 22px; padding: 12px; }
  </style>
</head>
<body>
  <div id="sunny-companion"></div>
  <main>
    <h1>${title}</h1>
    <p>Answer from memory. Sunny will score this quest from the hidden GAME_PARAMS targets.</p>
    <div id="rounds"></div>
  </main>
  <script>
    const params = window.GAME_PARAMS || {};
    const fallbackTargets = ${wordsJson};
    const targets = Array.isArray(params.words) && params.words.length ? params.words : fallbackTargets;
    const startTime = Date.now();
    let index = 0;
    let correct = 0;
    const rounds = document.getElementById("rounds");
    targets.forEach((target, i) => {
      const round = document.createElement("section");
      round.className = "round" + (i === 0 ? " active" : "");
      round.innerHTML = '<label>Word ' + (i + 1) + ' of ' + targets.length + '</label><input aria-label="answer word ' + (i + 1) + '" /><button>Submit</button><p class="feedback"></p>';
      const input = round.querySelector("input");
      const feedback = round.querySelector(".feedback");
      round.querySelector("button").addEventListener("click", () => {
        const attemptedValue = input.value.trim();
        const ok = attemptedValue.toLowerCase() === String(target).toLowerCase();
        if (ok) correct += 1;
        window.fireAttemptEvent({ domain: "spelling", target, attemptedValue, correct: ok, quality: ok ? 5 : 1, scaffoldLevel: 0 });
        window.fireCompanionEvent(ok ? "correct_answer" : "wrong_answer", { word: target });
        feedback.textContent = ok ? "Correct" : "Try the next one";
        round.classList.remove("active");
        index += 1;
        const next = rounds.children[index];
        if (next) {
          next.classList.add("active");
        } else {
          window.sendNodeComplete({ completed: true, accuracy: correct / Math.max(1, targets.length), timeSpent_ms: Date.now() - startTime, wordsAttempted: targets.length });
        }
      });
      rounds.appendChild(round);
    });
    window.SUNNY_VALIDATION_HOOKS = {
      playthrough: async ({ words }) => {
        const validationWords = Array.isArray(words) && words.length ? words : targets;
        for (let i = 0; i < validationWords.length; i += 1) {
          const round = rounds.children[i];
          const input = round.querySelector("input");
          input.value = validationWords[i];
          input.dispatchEvent(new Event("input", { bubbles: true }));
          round.querySelector("button").click();
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    };
  </script>
</body>
</html>`;
}

export async function generateExperienceHtmlWithSonnet(
  args: GenerateExperienceHtmlArgs,
): Promise<string> {
  const client = new Anthropic();
  const payload = JSON.stringify(
    {
      childChart: {
        childId: args.chart.childId,
        identity: args.chart.identity,
        adaptiveLoadState: args.profile.adaptiveLoadState,
        activityTraitModel: args.profile.activityTraitModel,
      },
      activeSessionPlan: args.plan,
      generatedExperienceBrief: args.brief,
      parentFeedback: args.parentFeedback,
      experienceContextPacket: args.experienceContextPacket,
      adaptiveArtifactBrief: args.artifact.brief,
      homework: args.homeworkCycle.capturedContent,
      validationFeedback: args.validationFeedback,
    },
    null,
    2,
  );
  return generateQuestGameHtml({
    client,
    extractedJsonPretty: payload,
    homeworkType: args.homeworkCycle.subject,
    testDate: args.homeworkCycle.testDate ?? undefined,
    learningTheory: args.homeworkCycle.theory?.markdown ?? args.homeworkCycle.assumptions ?? undefined,
    validationFeedback: args.validationFeedback
      ? JSON.stringify(args.validationFeedback, null, 2)
      : undefined,
  });
}

async function buildValidatedHtml(args: {
  childId: string;
  chart: ChildChart;
  profile: LearningProfile;
  plan: ActiveSessionPlan;
  brief: QuestBossBrief;
  parentFeedback?: string;
  experienceContextPacket: ExperienceContextPacket;
  homeworkCycle: HomeworkCycle;
  artifact: AdaptiveQuestArtifact;
  generateHtml: NonNullable<GenerateExperienceArtifactFromChartInput["generateHtml"]>;
  validateRuntime: NonNullable<GenerateExperienceArtifactFromChartInput["validateRuntime"]>;
  validationOutputDir: string;
  now: Date;
}): Promise<{ html: string; report: ExperienceArtifactValidationReport }> {
  let attempts = 1;
  let html = ensureQuestHtmlContract(await args.generateHtml(args));
  let validation = validateGeneratedGame(html, {
    words: args.artifact.targetWords,
    homeworkType: args.homeworkCycle.subject,
    childId: args.childId,
    generationStage: args.artifact.generationStage,
  });
  let staticValidation = {
    passed: validation.passed,
    score: validation.score,
    failures: [...validation.failures],
    warnings: [...validation.warnings],
  };
  if (!validation.passed && validation.shouldRegenerate) {
    attempts = 2;
    console.log(
      `🎮 [experience-artifact] [retry] child=${args.childId} brief=${args.brief.briefId} failures=${validation.failures.join(" | ")}`,
    );
    html = ensureQuestHtmlContract(
      await args.generateHtml({
        ...args,
        validationFeedback: {
          failures: validation.failures,
          warnings: validation.warnings,
          instruction: "Revise the generated HTML so it passes Sunny's game contract validation.",
        },
      }),
    );
    validation = validateGeneratedGame(html, {
      words: args.artifact.targetWords,
      homeworkType: args.homeworkCycle.subject,
      childId: args.childId,
      generationStage: args.artifact.generationStage,
    });
    staticValidation = {
      passed: validation.passed,
      score: validation.score,
      failures: [...validation.failures],
      warnings: [...validation.warnings],
    };
  }
  if (validation.passed) {
    const runtime = await args.validateRuntime({
      html,
      childId: args.childId,
      stage: args.artifact.generationStage,
      homeworkType: args.homeworkCycle.subject,
      words: args.artifact.targetWords,
      outputDir: args.validationOutputDir,
      now: args.now,
    });
    return {
      html,
      report: {
        ...runtime,
        attempts: attempts + runtime.attempts - 1,
        passed: validation.passed && runtime.passed,
        score: Math.min(validation.score, runtime.score),
        failures: [...validation.failures, ...runtime.failures],
        warnings: [...validation.warnings, ...runtime.warnings],
        staticValidation,
      },
    };
  }
  return {
    html,
    report: {
      passed: validation.passed,
      score: validation.score,
      failures: [...validation.failures],
      warnings: [...validation.warnings],
      attempts,
      validatedAt: args.now.toISOString(),
      staticValidation,
    },
  };
}

function attachArtifactToProfileNode(args: {
  profile: LearningProfile;
  stage: AdaptiveQuestArtifactStage;
  artifact: AdaptiveQuestArtifact;
  gameDate: string;
}): LearningProfile {
  const pending = args.profile.pendingHomework;
  if (!pending) return args.profile;
  const nextPending = {
    ...pending,
    nodes: pending.nodes.map((node) => {
        if (node.type !== args.stage) return node;
        const attached = attachArtifactToHomeworkNode(
          {
            ...node,
            type: args.stage,
          } as never,
          args.artifact,
        );
        return {
          ...node,
          words: attached.words,
          gameFile: attached.gameFile ?? null,
          storyFile: attached.storyFile ?? node.storyFile ?? null,
          adaptiveArtifact: attached.adaptiveArtifact,
          date: args.gameDate,
        };
      }),
  };
  const domain = selectedHomeworkDomain(args.profile) ?? inferHomeworkDomainFromPending(pending);
  return domain
    ? withActiveHomeworkLane(args.profile, domain, nextPending, { select: true })
    : { ...args.profile, pendingHomework: nextPending };
}

function activateExperimentForArtifact(
  profile: LearningProfile,
  experimentId: string | undefined,
  contentId: string,
  now: Date,
): LearningProfile {
  if (!experimentId) return profile;
  const experiments = profile.learningExperiments ?? profile.activeSessionPlan?.learningExperiments ?? [];
  const existing = experiments.find((experiment) => experiment.experimentId === experimentId);
  const nextExperiment: LearningExperiment = existing
    ? {
        ...existing,
        status: existing.status === "planned" ? "active" : existing.status,
        updatedAt: now.toISOString(),
        generatedArtifactIds: [...new Set([...existing.generatedArtifactIds, contentId])],
      }
    : {
        experimentId,
        childId: profile.childId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        status: "active",
        hypothesis: "Generated artifact should improve transfer for the active chart theory.",
        intervention: "Generated Quest/Boss artifact",
        comparison: "Baseline activity evidence",
        successCriteria: ["artifact accuracy >= 0.85"],
        stopConditions: ["high frustration or failed runtime validation"],
        assignedActivityIds: [],
        generatedArtifactIds: [contentId],
        metricsToCollect: ["accuracy", "attempt_count", "completion", "frustration"],
        results: [],
      };
  const merged = [
    ...experiments.filter((experiment) => experiment.experimentId !== experimentId),
    nextExperiment,
  ];
  const base = {
    ...profile,
    learningExperiments: merged,
  };
  return profile.activeSessionPlan
    ? withActiveSessionPlanLane(base, { ...profile.activeSessionPlan, learningExperiments: merged })
    : base;
}

export async function generateExperienceArtifactFromChart(
  input: GenerateExperienceArtifactFromChartInput,
): Promise<GeneratedExperienceArtifactResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const now = input.now ?? new Date();
  const childId = input.childId.trim().toLowerCase();
  const chart = getChildChart(childId, { rootDir });
  const profile = readProfile(rootDir, childId);
  if (!profile) return { ok: false, childId, reason: "learning_profile_missing" };

  const pending = profile.pendingHomework;
  const plan = profile.activeSessionPlan;
  const homeworkId = plan?.activeHomeworkId ?? pending?.homeworkId;
  if (!pending || !plan || !homeworkId) {
    return { ok: false, childId, homeworkId, reason: "active_session_plan_missing" };
  }

  const brief = findBrief(plan, input);
  if (!brief) return { ok: false, childId, homeworkId, reason: "generated_experience_brief_missing" };
  if (brief.kind !== "quest" && brief.kind !== "boss") {
    return { ok: false, childId, homeworkId, briefId: brief.briefId, reason: "unsupported_experience_kind" };
  }
  const stage = brief.kind;
  const plannerInput = buildExperiencePlannerInput(chart, { rootDir, now });
  const experienceContextPacket = buildExperienceContextPacket(plannerInput, plan, { now });
  const cycle = readHomeworkCycle(rootDir, childId, homeworkId);
  if (!cycle) {
    return { ok: false, childId, homeworkId, briefId: brief.briefId, stage, reason: "homework_cycle_missing" };
  }

  const gameDate = pending.weekOf || now.toISOString().slice(0, 10);
  const filename = `${stage}-${safeSlug(brief.briefId)}.html`;
  let artifact: AdaptiveQuestArtifact;
  try {
    artifact = generateAdaptiveQuestArtifact({
      childChart: chart,
      homeworkCycle: cycle,
      assignmentInterpretation: cycle.capturedContent?.assignmentInterpretation,
      carePlan: null,
      theory: stage === "boss" ? cycle.bossTheory ?? cycle.theory : cycle.theory,
      baselineEvidence: (cycle.interventionHistory ?? []).filter((item) =>
        stage === "boss" ? item.nodeType !== "boss" : item.nodeType !== "quest" && item.nodeType !== "boss",
      ),
      contentCatalogMemory: profile.aiContentCatalog ?? [],
      generationStage: stage,
      generatedPath: filename,
      experimentId: brief.experimentId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`🎮 [experience-artifact] [blocked] child=${childId} stage=${stage} reason=${message}`);
    return { ok: false, childId, homeworkId, briefId: brief.briefId, stage, reason: message };
  }

  const generateHtml = input.generateHtml ?? defaultQuestHtml;
  const validateRuntime = input.validateRuntime ?? ((args) => validateGeneratedArtifactRuntime(args));
  const validationOutputDir = path.join(
    contextDir(rootDir, childId),
    "homework",
    "games",
    gameDate,
    ".validation",
    safeSlug(brief.briefId),
  );
  const { html, report } = await buildValidatedHtml({
    childId,
    chart,
    profile,
    plan,
    brief,
    parentFeedback: input.parentFeedback,
    experienceContextPacket,
    homeworkCycle: cycle,
    artifact,
    generateHtml,
    validateRuntime,
    validationOutputDir,
    now,
  });
  artifact = markAdaptiveArtifactValidation(artifact, {
    ...report,
    status: report.passed ? "passed" : "failed",
  });

  if (!report.passed) {
    writeFailedValidationArtifacts({
      validationOutputDir,
      html,
      report,
      childId,
      stage,
      briefId: brief.briefId,
    });
    const failedCatalogItem = {
      ...catalogAdaptiveQuestArtifact(artifact, {
        childId,
        title: `${cycle.capturedContent?.title ?? homeworkId} ${stage} failed validation`,
      }),
      reuseStatus: "retire" as const,
      reuseReason: `Generated ${stage} failed validation and was not made playable.`,
    };
    const withCatalog = upsertProfileContentCatalog(profile, [failedCatalogItem]);
    const failedPlan = updateBriefStatus(withCatalog.activeSessionPlan, brief.briefId, "failed");
    const withFailedBrief = failedPlan
      ? withActiveSessionPlanLane(withCatalog, failedPlan)
      : withCatalog;
    writeProfile(rootDir, childId, withFailedBrief, now);
    writeWaterfallContentCatalog(childId, withFailedBrief, { rootDir, now });
    appendDecisionTrace(childId, {
      traceId: `trace-${stage}-validation-failed-${brief.briefId}`,
      eventType: stage === "boss" ? "boss_generation" : "quest_generation",
      evidenceRead: artifact.baselineEvidenceIds,
      theoryUsed: artifact.brief.hypothesis,
      changeSummary: `${stage} generation failed validation and was retired.`,
      reason: report.failures.join(" | ") || "Generated artifact validation failed.",
      writesTo: [path.join(contextDir(rootDir, childId), "learning_profile.json")],
      createdAt: now.toISOString(),
    }, { rootDir, now });
    console.log(
      `🎮 [experience-artifact] [validation-failed] child=${childId} stage=${stage} score=${report.score}`,
    );
    return {
      ok: false,
      childId,
      homeworkId,
      briefId: brief.briefId,
      stage,
      reason: "generated_game_validation_failed",
      validationReport: report,
    };
  }

  const filePath = path.join(contextDir(rootDir, childId), "homework", "games", gameDate, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, "utf8");
  console.log(`🎮 [experience-artifact] [validated] child=${childId} stage=${stage} file=${filename}`);

  const catalogItem = catalogAdaptiveQuestArtifact(artifact, {
    childId,
    title: `${cycle.capturedContent?.title ?? homeworkId} ${stage}`,
  });
  const withAttachedNode = attachArtifactToProfileNode({
    profile,
    stage,
    artifact,
    gameDate,
  });
  const withExperiment = activateExperimentForArtifact(withAttachedNode, artifact.experimentId, artifact.contentId, now);
  const withCatalog = upsertProfileContentCatalog(withExperiment, [catalogItem]);
  const validatedPlan = updateBriefStatus(withCatalog.activeSessionPlan, brief.briefId, "validated");
  const withValidatedBrief = validatedPlan
    ? withActiveSessionPlanLane(withCatalog, validatedPlan)
    : withCatalog;
  writeProfile(rootDir, childId, withValidatedBrief, now);
  writeWaterfallContentCatalog(childId, withValidatedBrief, { rootDir, now });
  appendDecisionTrace(childId, {
    traceId: `trace-${stage}-validated-${brief.briefId}`,
    eventType: stage === "boss" ? "boss_generation" : "quest_generation",
    evidenceRead: artifact.baselineEvidenceIds,
    theoryUsed: artifact.brief.hypothesis,
    changeSummary: `${stage} artifact ${artifact.contentId} validated and attached.`,
    reason: `Runtime/static validation passed with score ${report.score}.`,
    writesTo: [filePath, path.join(contextDir(rootDir, childId), "learning_profile.json")],
    createdAt: now.toISOString(),
  }, { rootDir, now });

  return {
    ok: true,
    childId,
    homeworkId,
    briefId: brief.briefId,
    stage,
    filename,
    filePath,
    contentId: artifact.contentId,
    validationReport: report,
  };
}
