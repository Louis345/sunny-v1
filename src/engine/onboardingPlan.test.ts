import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { createOnboardingPlan } from "./onboardingPlan";
import {
  buildOnboardingBoardPreviewCommand,
  onboardingPreviewBoardPrompt,
  onboardingPreviewSummary,
} from "../scripts/onboardingMode";
import {
  ATTENTION_TASKS,
  chooseAttentionTask,
  recordAttentionSignal,
} from "./attentionVitals";
import { initializeLearningProfile } from "../utils/learningProfileIO";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-onboarding-attention-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readJson<T>(root: string, rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T;
}

function profile(childId: string): LearningProfile {
  const out = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [],
  });
  out.sessionStats.totalSessions = 0;
  return out;
}

function writeChild(root: string, childId: string, p = profile(childId)): void {
  writeJson(root, `src/context/${childId}/learning_profile.json`, p);
  writeJson(root, `src/context/${childId}/word_bank.json`, {
    childId,
    version: 1,
    lastUpdated: "2026-05-03T00:00:00.000Z",
    words: [],
  });
}

describe("onboarding attention plan", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads known children from the child chart and chooses a predictive mini intake path", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    const p = profile(childId);
    p.attentionModel = undefined;
    p.sessionStats.totalSessions = 8;
    p.demographics.diagnoses = ["ADHD", "dyslexia"];
    p.readingProfile.flaggedPatterns = ["fatigue_after_reading"];
    p.rewardPreferences.favoriteGames = ["space-frogger"];
    writeChild(root, childId, p);
    fs.mkdirSync(path.join(root, "src", "context", childId), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "context", childId, `${childId}_context.md`),
      "Session notes mention attention fatigue, reading load, and visual support.",
      "utf8",
    );

    const plan = createOnboardingPlan(childId, {
      rootDir: root,
      now: new Date("2026-05-03T14:00:00.000Z"),
    });

    expect(plan.intakeMode).toBe("known_child_intake");
    expect(plan.nodes.map((node) => node.purpose)).toEqual([
      "attention_screening",
      "dopamine_reward",
      "hybrid_learning_attention",
    ]);
    expect(plan.selectedAttentionTask.taskId).toBe("bubble-pop");
    expect(plan.selectedAttentionTaskReason).toContain("low-reading");
    expect(plan.selectedAttentionTaskConfig.childPacing.maxFocusedWindow_ms).toBeGreaterThan(0);
    expect(plan.selectedAttentionTaskConfig.companionDuringTrials).toBe("hidden");
    expect(plan.careQuestion).toContain("low-reading");
    expect(plan.theories[0]?.supportCriteria.length).toBeGreaterThan(0);
    expect(plan.nodes.find((node) => node.purpose === "dopamine_reward")?.affectsBaselineScore)
      .toBe(false);
  });

  it("falls back to conservative new child intake with a single low-load screen", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "newkid";
    const p = profile(childId);
    p.attentionModel = undefined;
    writeChild(root, childId, p);

    const plan = createOnboardingPlan(childId, { rootDir: root });

    expect(plan.intakeMode).toBe("new_child_intake");
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]?.purpose).toBe("attention_screening");
    expect(plan.selectedAttentionTask.readingDemand).toBe("none");
    expect(plan.theories[0]?.confidence).toBeLessThan(0.5);
  });

  it("renders stateless preview text that shows what the child will do", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const p = profile(childId);
    p.attentionModel = undefined;
    p.sessionStats.totalSessions = 6;
    p.rewardPreferences.favoriteGames = ["space-frogger"];
    writeChild(root, childId, p);
    fs.mkdirSync(path.join(root, "src", "context", childId), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "context", childId, `${childId}_context.md`),
      "Reina responds to challenge rewards and should avoid long reading first.",
      "utf8",
    );

    const plan = createOnboardingPlan(childId, { rootDir: root });
    const preview = onboardingPreviewSummary(plan);

    expect(preview).toContain("STATeless preview".replace("STAT", "Stat"));
    expect(preview).toContain("What the child will do");
    expect(preview).toContain("Parent preview");
    expect(preview).toContain("Why this activity");
    expect(preview).toContain(plan.selectedAttentionTaskReason);
    expect(preview).toContain("Transition path");
    expect(preview).toContain("intro -> practice/demo -> measured baseline -> preview results -> return to map");
    expect(preview).toContain("Would write in live mode");
    expect(preview).toContain("Attention screen");
    expect(preview).toContain("Reward break");
    expect(preview).toContain("Writes: none");
  });

  it("offers the read-only board as the visual follow-up to stateless preview", () => {
    expect(onboardingPreviewBoardPrompt("ila")).toContain(
      "Open read-only onboarding board for ila?",
    );

    expect(buildOnboardingBoardPreviewCommand("ila")).toEqual({
      command: "npm",
      args: [
        "run",
        "sunny:run",
        "--",
        "--subject",
        "onboarding",
        "--child",
        "ila",
        "--session-mode",
        "as-child",
        "--preview",
        "free",
        "--node-access",
        "inspect-all",
        "--voice",
        "muted",
      ],
    });
  });

  it("selects attention tasks from the care question and child evidence", () => {
    expect(chooseAttentionTask({
      careQuestion: "Is impulsive responding the problem?",
      avoidReadingDemand: true,
    }).taskId).toBe("fish-flanker");

    expect(chooseAttentionTask({
      careQuestion: "Can the child sustain attention on a low-reading task?",
      avoidReadingDemand: true,
    }).taskId).toBe("bubble-pop");

    expect(ATTENTION_TASKS.every((task) => task.purpose === "attention_screening")).toBe(true);
    expect(
      ATTENTION_TASKS.every((task) =>
        task.profileConfigKeys.includes("attentionTraining.currentAcademicLoad.maxFocusedWindow_ms"),
      ),
    ).toBe(true);
    expect(
      ATTENTION_TASKS.every((task) =>
        task.transitionPolicy.practicePassAccuracy > 0 &&
        task.transitionPolicy.onPass === "start_measured_trials" &&
        task.transitionPolicy.onFail === "mark_invalid_and_return" &&
        task.transitionPolicy.companionDuringPractice === "instruct" &&
        task.transitionPolicy.companionDuringMeasurement === "hidden",
      ),
    ).toBe(true);
    expect(
      ATTENTION_TASKS.every((task) =>
        task.feedbackPolicy.practice === "corrective_audio_visual" &&
        task.feedbackPolicy.measured === "neutral_audio_only" &&
        task.feedbackPolicy.results === "reward_summary" &&
        task.rewardDensity === "low" &&
        ["low", "medium"].includes(task.sensoryLoad),
      ),
    ).toBe(true);
  });

  it("explains an impulsivity-based attention task choice from chart context", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const p = profile(childId);
    p.attentionModel = undefined;
    p.sessionStats.totalSessions = 3;
    writeChild(root, childId, p);
    fs.mkdirSync(path.join(root, "src", "context", childId), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "context", childId, `${childId}_context.md`),
      "Session notes mention rapid wrong taps, impulsive guessing, and competition helps focus.",
      "utf8",
    );

    const plan = createOnboardingPlan(childId, { rootDir: root });

    expect(plan.selectedAttentionTask.taskId).toBe("fish-flanker");
    expect(plan.selectedAttentionTaskReason).toContain("impulsive");
    expect(plan.nodes[0]?.activityId).toBe("fish-flanker");
  });

  it("records valid attention vitals into the chart path and updates the attention model", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const p = profile(childId);
    p.attentionModel = undefined;
    writeChild(root, childId, p);

    const out = recordAttentionSignal(childId, {
      sessionId: "onboarding-1",
      activityId: "bubble-pop",
      purpose: "attention_screening",
      startedAt: "2026-05-03T14:00:00.000Z",
      endedAt: "2026-05-03T14:01:30.000Z",
      activeDuration_ms: 90_000,
      idleEvents: 0,
      abandonments: 0,
      reengagements: 0,
      omissions: 1,
      commissions: 0,
      meanReactionTime_ms: 620,
      reactionTimeVariability: 0.18,
      dropoff: 0.08,
      frustrationSignals: [],
      flowSignals: ["completed_practice_gate"],
      practiceGate: { passed: true, accuracy: 0.9 },
    }, {
      rootDir: root,
      now: new Date("2026-05-03T14:02:00.000Z"),
    });

    expect(out.recorded).toBe(true);
    expect(out.profile.attentionModel?.source).toBe("onboarding_baseline");
    expect(out.profile.attentionModel?.status).toBe("measured");
    expect(out.profile.attentionModel?.currentWindow_ms).toBeGreaterThan(0);

    const vitals = fs.readdirSync(path.join(root, "src", "context", childId, "vitals"));
    expect(vitals).toContain("2026-05-03.ndjson");
    const persisted = readJson<LearningProfile>(root, `src/context/${childId}/learning_profile.json`);
    expect(persisted.aiContentCatalog?.find((item) => item.contentId === "attention:bubble-pop")?.purpose)
      .toBe("attention_screening");
  });

  it("marks failed practice gates invalid without updating attention model", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    const p = profile(childId);
    p.attentionModel = undefined;
    writeChild(root, childId, p);

    const out = recordAttentionSignal(childId, {
      sessionId: "onboarding-1",
      activityId: "fish-flanker",
      purpose: "attention_screening",
      startedAt: "2026-05-03T14:00:00.000Z",
      endedAt: "2026-05-03T14:00:20.000Z",
      activeDuration_ms: 20_000,
      idleEvents: 1,
      abandonments: 0,
      reengagements: 0,
      frustrationSignals: ["rule_confusion"],
      flowSignals: [],
      practiceGate: { passed: false, accuracy: 0.25 },
    }, { rootDir: root });

    expect(out.recorded).toBe(false);
    expect(out.reason).toBe("practice_gate_failed");
    expect(out.profile.attentionModel).toBeUndefined();
    const lines = fs.readFileSync(
      path.join(root, "src", "context", childId, "vitals", "2026-05-03.ndjson"),
      "utf8",
    );
    expect(lines).toContain("\"validBaseline\":false");
  });
});
