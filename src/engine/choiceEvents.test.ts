import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  applyChoiceEventPreference,
  buildMysteryChoiceSet,
  preferenceWeightForChoiceSource,
  readChoiceEvents,
  recordChoiceEvent,
  summarizeChoiceEngagement,
} from "./choiceEvents";

let root: string;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function profileFor(childId: string): LearningProfile {
  return initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
}

function writeProfile(childId: string, profile: LearningProfile = profileFor(childId)): void {
  writeJson(path.join(root, "src", "context", childId, "learning_profile.json"), profile);
}

describe("choice events", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-choice-events-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("records child-scoped mystery choice events as append-only NDJSON", () => {
    const event = recordChoiceEvent({
      childId: "reina",
      choiceSetId: "choice-reina-1",
      sessionId: "session-1",
      nodeId: "n-mystery",
      context: "mystery",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [
        {
          optionId: "monster",
          activityId: "monster-stampede",
          nodeType: "monster-stampede",
          label: "Fast Game",
          purposeLabel: "Fast Game",
        },
        {
          optionId: "pronunciation",
          activityId: "pronunciation",
          nodeType: "pronunciation",
          label: "Pronunciation Battle",
          purposeLabel: "Voice Challenge",
        },
      ],
      selectedOptionId: "pronunciation",
      skippedOptionIds: ["monster"],
      timeToChoose_ms: 3200,
      started: true,
      completed: true,
      accuracy: 0.9,
      activePlayTime_ms: 82_000,
      replayRequested: true,
      explicitSentiment: "like",
      frustrationScore: 0.1,
      createdAt: "2026-05-12T10:30:00.000Z",
    }, { rootDir: root });

    expect(event.choiceEventId).toMatch(/^choice_event_/);
    const file = path.join(root, "src", "context", "reina", "choice_events", "2026-05-12.ndjson");
    expect(fs.existsSync(file)).toBe(true);

    const loaded = readChoiceEvents("reina", { rootDir: root });
    expect(loaded).toHaveLength(1);
    expect(loaded[0].selectedOptionId).toBe("pronunciation");
    expect(loaded[0].skippedOptionIds).toEqual(["monster"]);
  });

  it("builds a mystery choice set with generic static thumbnails", () => {
    const set = buildMysteryChoiceSet({
      childId: "reina",
      sessionId: "session-1",
      nodeId: "n-mystery",
      domain: "spelling",
      candidates: [
        {
          activityId: "monster-stampede",
          nodeType: "monster-stampede",
          label: "Fast Game",
          purposeLabel: "Fast Game",
        },
        {
          activityId: "pronunciation",
          nodeType: "pronunciation",
          label: "Pronunciation Battle",
          purposeLabel: "Voice Challenge",
        },
        {
          activityId: "karaoke",
          nodeType: "karaoke",
          label: "Story Mission",
          purposeLabel: "Story Mission",
        },
        {
          activityId: "spell-check",
          nodeType: "spell-check",
          label: "Spell Check",
          purposeLabel: "Recall",
        },
      ],
      now: new Date("2026-05-12T11:00:00.000Z"),
    });

    expect(set.choiceSetId).toMatch(/^choice_set_/);
    expect(set.context).toBe("mystery");
    expect(set.shownOptions.map((option) => option.activityId)).toEqual([
      "monster-stampede",
      "pronunciation",
      "karaoke",
    ]);
    expect(set.shownOptions[0].thumbnailUrl).toBe("/thumbnails/activities/monster-stampede.svg");
    expect(set.shownOptions[1].thumbnailUrl).toBe("/thumbnails/activities/pronunciation.svg");
  });

  it("updates preference and bandit evidence from real child choice without changing mental load", async () => {
    writeProfile("reina");
    const rewardCalls: unknown[][] = [];

    const result = await applyChoiceEventPreference({
      childId: "reina",
      choiceSetId: "choice-reina-2",
      sessionId: "session-2",
      nodeId: "n-mystery",
      context: "mystery",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [
        {
          optionId: "pronunciation",
          activityId: "pronunciation",
          nodeType: "pronunciation",
          label: "Pronunciation Battle",
          purposeLabel: "Voice Challenge",
        },
      ],
      selectedOptionId: "pronunciation",
      skippedOptionIds: [],
      completed: true,
      accuracy: 0.95,
      activePlayTime_ms: 40_000,
      explicitSentiment: "like",
      frustrationScore: 0.05,
      createdAt: "2026-05-12T11:10:00.000Z",
    }, {
      rootDir: root,
      recordBanditReward: async (...args) => {
        rewardCalls.push(args);
      },
    });

    expect(result.applied).toBe(true);
    const profile = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;
    expect(profile.activityModel?.pronunciation?.plays).toBe(1);
    expect(profile.activityModel?.pronunciation?.likedCount).toBe(1);
    expect(profile.activityModel?.pronunciation?.domains.spelling).toBe(1);
    expect(profile.activityTraitModel?.voice?.positiveWeight).toBeGreaterThan(0);
    expect(profile.activityTraitModel?.speed?.positiveWeight).toBeGreaterThan(0);
    expect(profile.activityTraitModel?.["low-writing-load"]?.positiveWeight).toBeGreaterThan(0);
    expect(profile.adaptiveLoadState).toBeUndefined();
    expect(rewardCalls).toEqual([["reina", "pronunciation", true, true, 0.95]]);
  });

  it("records baseline route choices as selected and skipped preference evidence", async () => {
    writeProfile("reina");
    const rewardCalls: unknown[][] = [];

    const event = recordChoiceEvent({
      eventName: "option_selected",
      childId: "reina",
      choiceSetId: "baseline-route-options",
      sessionId: "plan-reina-1",
      nodeId: "baseline-hf-fluency",
      context: "baseline_route",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [
        {
          optionId: "choice-baseline-hf-recognition",
          activityId: "word-radar",
          nodeType: "word-radar",
          label: "Quick Read",
          purposeLabel: "Quick Read",
          preferenceTraits: ["practice", "control"],
        },
        {
          optionId: "choice-baseline-hf-fluency",
          activityId: "pronunciation",
          nodeType: "pronunciation",
          label: "Pronunciation",
          purposeLabel: "Pronunciation",
          preferenceTraits: ["voice", "control"],
        },
      ],
      selectedOptionId: "choice-baseline-hf-fluency",
      skippedOptionIds: ["choice-baseline-hf-recognition"],
      createdAt: "2026-05-12T11:15:00.000Z",
    }, { rootDir: root });

    const result = await applyChoiceEventPreference(event, {
      rootDir: root,
      recordBanditReward: async (...args) => {
        rewardCalls.push(args);
      },
    });

    const loaded = readChoiceEvents("reina", { rootDir: root });
    const profile = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;
    expect(result.applied).toBe(true);
    expect(loaded[0]).toMatchObject({
      context: "baseline_route",
      selectedOptionId: "choice-baseline-hf-fluency",
      skippedOptionIds: ["choice-baseline-hf-recognition"],
    });
    expect(profile.activityModel?.pronunciation?.plays).toBe(1);
    expect(profile.activityTraitModel?.voice?.positiveWeight).toBeGreaterThan(0);
    expect(profile.activityTraitModel?.control?.positiveWeight).toBeGreaterThan(0);
    expect(rewardCalls).toEqual([["reina", "pronunciation", true, false, 0.5]]);
  });

  it("does not treat system-required activity completion as strong preference", async () => {
    const profile = profileFor("reina");
    profile.adaptiveLoadState = {
      spelling: {
        domain: "spelling",
        currentCohortSize: 5,
        maxRecentSuccessfulCohort: 5,
        challengeRecommendation: "maintain",
        lastLoadEvidence: {
          activityId: "spell-check",
          completed: true,
          accuracy: 0.8,
          targetCount: 5,
          frustrationScore: 0.2,
          strongEvidence: false,
          occurredAt: "2026-05-12T10:00:00.000Z",
        },
      },
    };
    writeProfile("reina", profile);

    const reward = vi.fn();
    const result = await applyChoiceEventPreference({
      childId: "reina",
      choiceSetId: "forced-1",
      sessionId: "session-3",
      nodeId: "n-spell-check",
      context: "homework_required",
      domain: "spelling",
      source: "system_required",
      shownOptions: [
        {
          optionId: "spell-check",
          activityId: "spell-check",
          nodeType: "spell-check",
          label: "Spell Check",
          purposeLabel: "Recall",
        },
      ],
      selectedOptionId: "spell-check",
      skippedOptionIds: [],
      completed: true,
      accuracy: 1,
      explicitSentiment: "like",
      createdAt: "2026-05-12T11:20:00.000Z",
    }, { rootDir: root, recordBanditReward: reward });

    const after = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;
    expect(result.applied).toBe(false);
    expect(after.activityModel?.["spell-check"]).toBeUndefined();
    expect(after.activityTraitModel).toBeUndefined();
    expect(after.adaptiveLoadState?.spelling?.currentCohortSize).toBe(5);
    expect(reward).not.toHaveBeenCalled();
  });

  it("ignores non-preference telemetry events when applying activity preference", async () => {
    writeProfile("reina");
    const reward = vi.fn();

    const result = await applyChoiceEventPreference({
      eventName: "activity_launched",
      childId: "reina",
      choiceSetId: "choice-reina-launch",
      sessionId: "session-4",
      nodeId: "n-mystery",
      context: "mystery",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [
        {
          optionId: "pronunciation",
          activityId: "pronunciation",
          nodeType: "pronunciation",
          label: "Pronunciation Battle",
          purposeLabel: "Voice Challenge",
        },
      ],
      selectedOptionId: "pronunciation",
      skippedOptionIds: [],
      started: true,
      createdAt: "2026-05-12T11:22:00.000Z",
    }, { rootDir: root, recordBanditReward: reward });

    const after = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;
    expect(result).toEqual({ applied: false, reason: "non_preference_event" });
    expect(after.activityModel?.pronunciation).toBeUndefined();
    expect(reward).not.toHaveBeenCalled();
  });

  it("weights real child choice higher than forced or parent/system sources", () => {
    expect(preferenceWeightForChoiceSource("child_choice")).toBe(1);
    expect(preferenceWeightForChoiceSource("parent_choice")).toBeLessThan(1);
    expect(preferenceWeightForChoiceSource("system_recommendation")).toBeLessThan(
      preferenceWeightForChoiceSource("parent_choice"),
    );
    expect(preferenceWeightForChoiceSource("system_required")).toBe(0);
  });

  it("applies system surprise completion as weaker preference without bandit reward", async () => {
    writeProfile("reina");
    const reward = vi.fn();

    const result = await applyChoiceEventPreference({
      eventName: "activity_completed",
      childId: "reina",
      choiceSetId: "surprise-1",
      sessionId: "session-5",
      nodeId: "n-mystery",
      context: "mystery",
      domain: "spelling",
      source: "system_recommendation",
      shownOptions: [
        {
          optionId: "asteroid",
          activityId: "asteroid",
          nodeType: "asteroid",
          label: "Asteroids",
          purposeLabel: "Surprise Game",
        },
      ],
      selectedOptionId: "asteroid",
      skippedOptionIds: [],
      completed: true,
      accuracy: 1,
      explicitSentiment: "like",
      createdAt: "2026-05-12T11:25:00.000Z",
    }, { rootDir: root, recordBanditReward: reward });

    const after = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;
    expect(result.applied).toBe(true);
    expect(after.activityModel?.asteroid?.plays).toBe(1);
    expect(after.activityModel?.asteroid?.engagementScore).toBeLessThan(1);
    expect(reward).not.toHaveBeenCalled();
  });

  it("points the first mystery choice thumbnails at local static files", () => {
    const set = buildMysteryChoiceSet({
      childId: "reina",
      sessionId: "session-4",
      nodeId: "n-mystery",
      domain: "spelling",
      candidates: [
        {
          activityId: "monster-stampede",
          nodeType: "monster-stampede",
          label: "Fast Game",
          purposeLabel: "Fast Game",
        },
        {
          activityId: "pronunciation",
          nodeType: "pronunciation",
          label: "Pronunciation Battle",
          purposeLabel: "Voice Challenge",
        },
        {
          activityId: "karaoke",
          nodeType: "karaoke",
          label: "Story Mission",
          purposeLabel: "Story Mission",
        },
      ],
      now: new Date("2026-05-12T11:30:00.000Z"),
    });

    for (const option of set.shownOptions) {
      expect(option.thumbnailUrl).toBeTruthy();
      const publicPath = path.join(
        process.cwd(),
        "web",
        "public",
        option.thumbnailUrl!.replace(/^\//, ""),
      );
      expect(fs.existsSync(publicPath), option.thumbnailUrl).toBe(true);
    }
  });

  it("points Wheel of Fortune mystery choices at a real local thumbnail", () => {
    const set = buildMysteryChoiceSet({
      childId: "reina",
      sessionId: "session-6",
      nodeId: "n-mystery",
      domain: "spelling",
      candidates: [
        {
          activityId: "wheel-of-fortune",
          nodeType: "wheel-of-fortune",
          label: "Wheel of Fortune",
          purposeLabel: "Spin Reward",
        },
      ],
      now: new Date("2026-05-12T11:35:00.000Z"),
    });

    const option = set.shownOptions[0];
    expect(option.thumbnailUrl).toBe("/thumbnails/activities/wheel-of-fortune.svg");
    expect(
      fs.existsSync(
        path.join(process.cwd(), "web", "public", option.thumbnailUrl!.replace(/^\//, "")),
      ),
    ).toBe(true);
  });

  it("treats successful voluntary replay as stronger preference than done-for-now", async () => {
    writeProfile("reina");
    writeProfile("ila");

    await applyChoiceEventPreference({
      eventName: "replay_requested",
      postActivityAction: "replay_same",
      childId: "reina",
      choiceSetId: "post-word-radar",
      sessionId: "session-replay",
      nodeId: "n-word-radar",
      context: "baseline_route",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [{
        optionId: "word-radar",
        activityId: "word-radar",
        nodeType: "word-radar",
        label: "Word Radar",
        purposeLabel: "Visual Practice",
        preferenceTraits: ["visual", "control"],
      }],
      selectedOptionId: "word-radar",
      skippedOptionIds: [],
      completed: true,
      accuracy: 0.9,
      activePlayTime_ms: 45_000,
      replayRequested: true,
      frustrationScore: 0.1,
      createdAt: "2026-05-12T12:00:00.000Z",
    }, { rootDir: root, recordBanditReward: vi.fn() });

    await applyChoiceEventPreference({
      eventName: "activity_completed",
      postActivityAction: "back_to_map",
      childId: "ila",
      choiceSetId: "post-word-radar",
      sessionId: "session-done",
      nodeId: "n-word-radar",
      context: "baseline_route",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [{
        optionId: "word-radar",
        activityId: "word-radar",
        nodeType: "word-radar",
        label: "Word Radar",
        purposeLabel: "Visual Practice",
        preferenceTraits: ["visual", "control"],
      }],
      selectedOptionId: "word-radar",
      skippedOptionIds: [],
      completed: true,
      accuracy: 0.9,
      activePlayTime_ms: 45_000,
      replayRequested: false,
      frustrationScore: 0.1,
      createdAt: "2026-05-12T12:00:00.000Z",
    }, { rootDir: root, recordBanditReward: vi.fn() });

    const replayProfile = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;
    const doneProfile = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "ila", "learning_profile.json"), "utf8"),
    ) as LearningProfile;

    expect(replayProfile.activityModel?.["word-radar"]?.likedCount).toBe(1);
    expect(doneProfile.activityModel?.["word-radar"]?.likedCount).toBe(0);
    expect(doneProfile.activityModel?.["word-radar"]?.dislikedCount).toBe(0);
    expect(replayProfile.activityModel?.["word-radar"]?.engagementScore).toBeGreaterThan(
      doneProfile.activityModel?.["word-radar"]?.engagementScore ?? 1,
    );
  });

  it("treats replay after failure as persistence instead of proof the child liked it", async () => {
    writeProfile("reina");
    const reward = vi.fn();

    await applyChoiceEventPreference({
      eventName: "replay_requested",
      postActivityAction: "replay_same",
      childId: "reina",
      choiceSetId: "post-spell-check",
      sessionId: "session-retry",
      nodeId: "n-spell-check",
      context: "homework_required",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [{
        optionId: "spell-check",
        activityId: "spell-check",
        nodeType: "spell-check",
        label: "Spell Check",
        purposeLabel: "Recall",
        preferenceTraits: ["typing", "recall"],
      }],
      selectedOptionId: "spell-check",
      skippedOptionIds: [],
      completed: false,
      accuracy: 0.25,
      activePlayTime_ms: 20_000,
      replayRequested: true,
      frustrationScore: 0.35,
      createdAt: "2026-05-12T12:10:00.000Z",
    }, { rootDir: root, recordBanditReward: reward });

    const profile = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;

    expect(profile.activityModel?.["spell-check"]?.likedCount).toBe(0);
    expect(profile.activityModel?.["spell-check"]?.dislikedCount).toBe(0);
    expect(profile.activityTraitModel?.typing?.mixedWeight).toBeGreaterThan(0);
    expect(reward).toHaveBeenCalledWith("reina", "spell-check", false, false, 0.25);
  });

  it("treats abandon with high frustration as overload or avoidance evidence", async () => {
    writeProfile("reina");
    const reward = vi.fn();

    await applyChoiceEventPreference({
      eventName: "activity_completed",
      postActivityAction: "abandon",
      childId: "reina",
      choiceSetId: "post-letter-rush",
      sessionId: "session-overload",
      nodeId: "n-letter-rush",
      context: "baseline_route",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [{
        optionId: "letter-rush",
        activityId: "letter-rush",
        nodeType: "letter-rush",
        label: "Letter Rush",
        purposeLabel: "Speed Challenge",
        preferenceTraits: ["speed", "competition"],
      }],
      selectedOptionId: "letter-rush",
      skippedOptionIds: [],
      completed: false,
      accuracy: 0.1,
      activePlayTime_ms: 8_000,
      replayRequested: false,
      frustrationScore: 0.9,
      createdAt: "2026-05-12T12:20:00.000Z",
    }, { rootDir: root, recordBanditReward: reward });

    const profile = JSON.parse(
      fs.readFileSync(path.join(root, "src", "context", "reina", "learning_profile.json"), "utf8"),
    ) as LearningProfile;

    expect(profile.activityModel?.["letter-rush"]?.likedCount).toBe(0);
    expect(profile.activityModel?.["letter-rush"]?.dislikedCount).toBe(1);
    expect(profile.activityTraitModel?.speed?.negativeWeight).toBeGreaterThan(0);
    expect(reward).toHaveBeenCalledWith("reina", "letter-rush", false, false, 0.1);
  });

  it("summarizes wrapper traits for future Quest and Boss generation", () => {
    const events = [
      recordChoiceEvent({
        eventName: "replay_requested",
        postActivityAction: "replay_harder",
        childId: "reina",
        choiceSetId: "post-story",
        sessionId: "session-story",
        nodeId: "n-quest",
        context: "quest",
        domain: "spelling",
        source: "child_choice",
        shownOptions: [{
          optionId: "story-quest",
          activityId: "quest",
          nodeType: "quest",
          label: "Story Quest",
          purposeLabel: "Story",
          preferenceTraits: ["story", "challenge"],
        }],
        selectedOptionId: "story-quest",
        skippedOptionIds: [],
        completed: true,
        accuracy: 0.95,
        activePlayTime_ms: 60_000,
        replayRequested: true,
        frustrationScore: 0.05,
        createdAt: "2026-05-12T12:30:00.000Z",
      }, { rootDir: root }),
      recordChoiceEvent({
        eventName: "activity_completed",
        postActivityAction: "abandon",
        childId: "reina",
        choiceSetId: "post-speed",
        sessionId: "session-speed",
        nodeId: "n-letter-rush",
        context: "baseline_route",
        domain: "spelling",
        source: "child_choice",
        shownOptions: [{
          optionId: "speed",
          activityId: "letter-rush",
          nodeType: "letter-rush",
          label: "Letter Rush",
          purposeLabel: "Speed",
          preferenceTraits: ["speed", "competition"],
        }],
        selectedOptionId: "speed",
        skippedOptionIds: [],
        completed: false,
        accuracy: 0.2,
        activePlayTime_ms: 9_000,
        frustrationScore: 0.9,
        createdAt: "2026-05-12T12:35:00.000Z",
      }, { rootDir: root }),
    ];

    const summary = summarizeChoiceEngagement(events);

    expect(summary.preferredWrappers).toContain("story");
    expect(summary.replayedWrappers).toContain("challenge");
    expect(summary.avoidedWrappers).toContain("speed");
    expect(summary.challengeTolerance).toBe("likes_harder_replay");
    expect(summary.overloadPatterns).toContain("speed");
  });
});
