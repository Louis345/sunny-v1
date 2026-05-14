import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { ChildChart } from "../profiles/childChart";
import { getChildChart } from "../profiles/childChart";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { ensureQuestHtmlContract } from "../scripts/ingestHomework";
import { generateQuestGameHtml } from "../scripts/generateGame";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";
import {
  attachArtifactToHomeworkNode,
  catalogAdaptiveQuestArtifact,
  generateAdaptiveQuestArtifact,
  markAdaptiveArtifactValidation,
  type AdaptiveQuestArtifact,
  type AdaptiveQuestArtifactStage,
} from "./adaptiveQuestArtifact";
import { upsertProfileContentCatalog } from "./learningDecisionContext";

export type GenerateExperienceHtmlArgs = {
  childId: string;
  chart: ChildChart;
  profile: LearningProfile;
  plan: ActiveSessionPlan;
  brief: GeneratedExperienceBrief;
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
  generateHtml?: (args: GenerateExperienceHtmlArgs) => Promise<string> | string;
};

export type ExperienceArtifactValidationReport = {
  passed: boolean;
  score: number;
  failures: string[];
  warnings: string[];
  attempts: number;
  validatedAt: string;
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
  return path.join(rootDir, "src", "context", childId);
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
  return readJson<LearningProfile>(path.join(contextDir(rootDir, childId), "learning_profile.json"));
}

function writeProfile(rootDir: string, childId: string, profile: LearningProfile, now: Date): void {
  writeJson(path.join(contextDir(rootDir, childId), "learning_profile.json"), profile, now);
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
  </style>
</head>
<body>
  <div id="sunny-companion"></div>
  <main>
    <h1>${title}</h1>
    <p>Answer from memory. Sunny will score this quest from the hidden GAME_PARAMS targets.</p>
    <button id="finish">Finish quest</button>
  </main>
  <script>
    const params = window.GAME_PARAMS || {};
    const targets = Array.isArray(params.words) ? params.words : [];
    document.getElementById("finish").addEventListener("click", () => {
      const first = targets[0] || "target";
      fireAttemptEvent({ word: first, correct: true });
      fireCompanionEvent("correct_answer", { activityId: "${args.brief.kind}" });
      sendNodeComplete({ completed: true, accuracy: 1, timeSpent_ms: 1000, wordsAttempted: Math.max(1, targets.length) });
    });
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
  homeworkCycle: HomeworkCycle;
  artifact: AdaptiveQuestArtifact;
  generateHtml: NonNullable<GenerateExperienceArtifactFromChartInput["generateHtml"]>;
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
  return {
    ...args.profile,
    pendingHomework: {
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
    },
  };
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
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`🎮 [experience-artifact] [blocked] child=${childId} stage=${stage} reason=${message}`);
    return { ok: false, childId, homeworkId, briefId: brief.briefId, stage, reason: message };
  }

  const generateHtml = input.generateHtml ?? defaultQuestHtml;
  const { html, report } = await buildValidatedHtml({
    childId,
    chart,
    profile,
    plan,
    brief,
    homeworkCycle: cycle,
    artifact,
    generateHtml,
    now,
  });
  artifact = markAdaptiveArtifactValidation(artifact, {
    ...report,
    status: report.passed ? "passed" : "failed",
  });

  if (!report.passed) {
    const failedCatalogItem = {
      ...catalogAdaptiveQuestArtifact(artifact, {
        childId,
        title: `${cycle.capturedContent?.title ?? homeworkId} ${stage} failed validation`,
      }),
      reuseStatus: "retire" as const,
      reuseReason: `Generated ${stage} failed validation and was not made playable.`,
    };
    const withCatalog = upsertProfileContentCatalog(profile, [failedCatalogItem]);
    const withFailedBrief = {
      ...withCatalog,
      activeSessionPlan: updateBriefStatus(withCatalog.activeSessionPlan, brief.briefId, "failed"),
    };
    writeProfile(rootDir, childId, withFailedBrief, now);
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
  const withCatalog = upsertProfileContentCatalog(withAttachedNode, [catalogItem]);
  const withValidatedBrief = {
    ...withCatalog,
    activeSessionPlan: updateBriefStatus(withCatalog.activeSessionPlan, brief.briefId, "validated"),
  };
  writeProfile(rootDir, childId, withValidatedBrief, now);

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
