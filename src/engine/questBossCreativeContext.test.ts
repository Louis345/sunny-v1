import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdventureChoiceSet } from "../shared/adventureBoardJson";
import { buildCapturedHomeworkContent, buildContentAwareHomeworkNodes } from "../scripts/contentAwareHomeworkPlanner";
import { buildPendingHomeworkPayload } from "../scripts/ingestHomework";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { recordChoiceEvent } from "./choiceEvents";
import {
  buildQuestBossCreativeContextPacket,
  renderCreativeContextForPrompt,
  selectDesignerPersona,
} from "./questBossCreativeContext";

const CHILD_ID = "reina";
const HOMEWORK_ID = "hw-creative-context";
const WORDS = ["sign", "know", "write", "wrong", "answer", "wrap"];

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function choiceSet(): AdventureChoiceSet {
  return {
    id: "quest-choice",
    kind: "quest-wrapper",
    title: "Choose a quest",
    options: [
      {
        id: "sports",
        label: "Arena Quest",
        state: "available",
        tags: ["competition", "strategy"],
      },
      {
        id: "mystery",
        label: "Mystery Quest",
        state: "available",
        tags: ["mystery", "puzzle"],
      },
    ],
  };
}

function plan(): ActiveSessionPlan {
  return {
    planId: "plan-creative-context",
    childId: CHILD_ID,
    createdAt: "2026-05-29T10:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: HOMEWORK_ID,
    domain: "spelling",
    testDate: "2026-05-30",
    nodePlan: [
      {
        id: "n-spell-check",
        type: "spell-check",
        activityId: "spell-check",
        targets: WORDS.slice(0, 3),
        difficulty: 1,
        source: "chart_planner",
      },
      {
        id: "n-quest",
        type: "quest",
        activityId: "quest",
        targets: WORDS.slice(0, 3),
        difficulty: 2,
        source: "chart_planner",
        locked: true,
      },
      {
        id: "n-boss",
        type: "boss",
        activityId: "boss",
        targets: WORDS.slice(0, 3),
        difficulty: 3,
        source: "chart_planner",
        locked: true,
      },
    ],
    adventureBoard: {
      schemaVersion: 1,
      boardId: "board-creative-context",
      planId: "plan-creative-context",
      childId: CHILD_ID,
      domain: "spelling",
      theme: {
        background: { type: "solid", value: "#064e3b" },
        palette: {
          path: "#fef3c7",
          completed: "#16a34a",
          available: "#7c3aed",
          locked: "#64748b",
          current: "#f59e0b",
          preview: "#60a5fa",
          text: "#1f0f2d",
          panel: "#fff7e1",
        },
      },
      nodes: [
        { id: "n-spell-check", kind: "activity", label: "Spell Check", state: "available" },
        { id: "n-quest", kind: "quest", label: "Quest", state: "available", choiceSetId: "quest-choice" },
        { id: "n-boss", kind: "boss", label: "Boss", state: "locked", choiceSetId: "boss-choice" },
      ],
      edges: [{ id: "e-spell-check-quest", from: "n-spell-check", to: "n-quest", state: "available" }],
      choiceSets: [choiceSet()],
    },
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "creative-context",
      previousCompletedNodeCount: 2,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "silent",
      verbosity: "low",
      maxMicroProbes: 0,
    },
    evidenceUsed: [{ id: "spell-check-baseline", type: "activity_result", summary: "2 misses, 1 recovery" }],
    openQuestions: [],
    planTheory: {
      hypothesis: "Silent-letter recall improves when production practice is wrapped in low-friction challenge.",
      evidenceSummary: ["Spell Check showed recoverable misses."],
      intervention: "Use a quest to test hidden spelling recall in a more engaging wrapper.",
      supportCriteria: ["Targets are typed from memory."],
      reviseCriteria: ["Child needs repeated hints."],
      falsifyCriteria: ["Child cannot attempt without visible answers."],
    },
  };
}

function profile(): LearningProfile {
  const p = initializeLearningProfile({
    childId: CHILD_ID,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  p.pendingHomework = {
    homeworkId: HOMEWORK_ID,
    weekOf: "2026-05-29",
    testDate: "2026-05-30",
    wordList: WORDS,
    generatedAt: "2026-05-29T10:00:00.000Z",
    capturedContent: null,
    nodes: [],
  };
  p.activeSessionPlan = plan();
  p.rewardPreferences = {
    favoriteGames: ["letter-rush", "word-radar"],
    celebrationStyle: "loud",
    bonusRoundHistory: { triggered: 3, correct: 2, lastTriggered: "2026-05-28T20:00:00.000Z" },
  };
  p.activityModel = {
    "letter-rush": {
      activityId: "letter-rush",
      plays: 4,
      completions: 4,
      completionRate: 1,
      averageAccuracy: 0.84,
      engagementScore: 0.9,
      frustrationScore: 0.12,
      likedCount: 3,
      dislikedCount: 0,
      lastRating: "like",
      lastPlayed: "2026-05-28T20:00:00.000Z",
      domains: { spelling: 4 },
      missedWords: [],
    },
  };
  p.activityTraitModel = {
    competition: {
      dimension: "competition",
      positiveWeight: 2.2,
      negativeWeight: 0,
      mixedWeight: 0.1,
      evidenceCount: 4,
      confidence: 0.8,
      lastUpdated: "2026-05-28T20:00:00.000Z",
      activityCounts: { "letter-rush": 4 },
    },
    strategy: {
      dimension: "strategy",
      positiveWeight: 1.3,
      negativeWeight: 0,
      mixedWeight: 0,
      evidenceCount: 2,
      confidence: 0.65,
      lastUpdated: "2026-05-28T20:00:00.000Z",
      activityCounts: { "letter-rush": 2 },
    },
    voice: {
      dimension: "voice",
      positiveWeight: 0,
      negativeWeight: 1.1,
      mixedWeight: 0,
      evidenceCount: 2,
      confidence: 0.7,
      lastUpdated: "2026-05-28T20:00:00.000Z",
      activityCounts: { pronunciation: 2 },
    },
  };
  return p;
}

function cycle(): HomeworkCycle {
  return {
    homeworkId: HOMEWORK_ID,
    subject: "spelling_test",
    wordList: WORDS,
    capturedContent: {
      title: "Silent Letter Spelling",
      type: "spelling_test",
      rawText: WORDS.join(" "),
      words: WORDS,
      questions: [],
      sourceDocuments: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "silent-letter spelling recall",
        primarySkill: "Spell silent-letter words from memory",
        assignmentFormat: "spelling list",
        concepts: ["silent letters", "hidden recall"],
        sourceEvidence: ["fixture"],
      },
    },
    contentFingerprint: "creative-context",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-29",
    testDate: "2026-05-30",
    testDateSource: "cli",
    testDateConfirmed: true,
    assumptions: null,
    theory: null,
    interventionHistory: [],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  } as unknown as HomeworkCycle;
}

describe("quest/boss creative context", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("compiles child profile, choice events, style references, and inspiration for the spec writer", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-quest-context-"));
    roots.push(root);
    recordChoiceEvent({
      eventName: "activity_completed",
      childId: CHILD_ID,
      choiceSetId: "baseline-choice",
      nodeId: "n-letter-rush",
      context: "baseline_route",
      domain: "spelling",
      source: "child_choice",
      shownOptions: [{
        optionId: "letter-rush",
        activityId: "letter-rush",
        nodeType: "letter-rush",
        label: "Letter Rush",
        purposeLabel: "Arcade Challenge",
        preferenceTraits: ["competition", "speed", "strategy"],
      }],
      selectedOptionId: "letter-rush",
      skippedOptionIds: [],
      completed: true,
      accuracy: 0.92,
      postActivityAction: "replay_harder",
      frustrationScore: 0.1,
      createdAt: "2026-05-28T20:15:00.000Z",
    }, { rootDir: root });

    const packet = buildQuestBossCreativeContextPacket({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSet: choiceSet(),
      option: choiceSet().options[0]!,
      targetWords: WORDS.slice(0, 3),
      homeworkCycle: cycle(),
      profile: profile(),
      rootDir: root,
      now: new Date("2026-05-29T10:30:00.000Z"),
    });

    expect(packet.contextVersion).toBe("quest-boss-creative-context-v1");
    expect(packet.designerPersona.id).toBe("sports_showrunner");
    expect(packet.engagement.preferredWrappers).toContain("competition");
    expect(packet.engagement.replayedWrappers).toContain("strategy");
    expect(packet.engagement.avoidedWrappers).toContain("voice");
    expect(packet.engagement.challengeTolerance).toBe("likes_harder_replay");
    expect(packet.styleReference.componentPattern).toContain("AdventureChoiceModal");
    expect(packet.styleReference.companionBoundary).toContain("outside the iframe");
    expect(packet.inspiration.map((item) => item.id)).toContain("arcade-boss-run");

    const promptContext = renderCreativeContextForPrompt(packet);
    expect(promptContext).toContain("sports_showrunner");
    expect(promptContext).toContain("do not write the child name");
    expect(promptContext).toContain("AdventureChoiceModal");
    expect(promptContext).not.toContain("Child: reina");
  });

  it("switches away from pressure-first persona when engagement shows overload", () => {
    const p = profile();
    p.activityTraitModel = {
      speed: {
        dimension: "speed",
        positiveWeight: 0,
        negativeWeight: 2,
        mixedWeight: 0,
        evidenceCount: 3,
        confidence: 0.85,
        lastUpdated: "2026-05-28T20:00:00.000Z",
        activityCounts: { "letter-rush": 3 },
      },
    };
    const persona = selectDesignerPersona({
      profile: p,
      optionTraits: ["speed", "competition"],
      engagementSummary: {
        preferredWrappers: [],
        replayedWrappers: [],
        avoidedWrappers: ["speed", "competition"],
        challengeTolerance: "pressure_sensitive",
        overloadPatterns: ["speed"],
      },
    });
    expect(persona.id).toBe("mastery_coach");
    expect(persona.evidenceUse).toContain("reduce pressure");
  });

  it("keeps a spelling ingestion smoke connected from captured homework to Quest/Boss context", () => {
    const capturedContent = buildCapturedHomeworkContent({
      title: "Silent Letter Spelling",
      type: "spelling_test",
      rawText: WORDS.join("\n"),
      words: WORDS,
      questions: [],
      wordGroups: [{
        id: "silent-letters",
        label: "Silent Letter Words",
        purpose: "spell_from_memory",
        words: WORDS,
        confidence: 0.98,
        evidence: ["fixture spelling list"],
      }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "silent-letter spelling recall",
        primarySkill: "Spell silent-letter words from memory",
        assignmentFormat: "spelling list",
        concepts: ["silent letters"],
        sourceEvidence: ["fixture spelling list"],
      },
    });
    const nodes = buildContentAwareHomeworkNodes({
      type: "spelling_test",
      words: WORDS,
      homeworkId: HOMEWORK_ID,
      childId: CHILD_ID,
      testDate: "2026-05-30",
      contentProfile: capturedContent.contentProfile,
      capturedContent,
    });
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-05-29",
      testDate: "2026-05-30",
      wordList: WORDS,
      homeworkId: HOMEWORK_ID,
      nodes: [
        ...nodes,
        {
          id: "n-quest",
          type: "quest",
          words: WORDS.slice(0, 3),
          difficulty: 2,
          rationale: "Generated quest checks hidden recall after baseline.",
          gameFile: null,
          storyFile: null,
          date: "2026-05-29",
        },
        {
          id: "n-boss",
          type: "boss",
          words: WORDS.slice(0, 3),
          difficulty: 3,
          rationale: "Generated boss checks transfer after quest evidence.",
          gameFile: null,
          storyFile: null,
          date: "2026-05-29",
        },
      ],
      contentProfile: capturedContent.contentProfile,
      capturedContent,
    });
    const p = profile();
    p.pendingHomework = pending;

    const packet = buildQuestBossCreativeContextPacket({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSet: choiceSet(),
      option: choiceSet().options[1]!,
      targetWords: WORDS.slice(0, 3),
      homeworkCycle: { ...cycle(), capturedContent },
      profile: p,
      now: new Date("2026-05-29T10:30:00.000Z"),
    });

    expect(nodes.map((node) => node.type)).toContain("spell-check");
    expect(capturedContent.assignmentInterpretation?.selectedTargets[0]?.purpose).toBe("spell_from_memory");
    expect(packet.homework.goal).toContain("hidden spelling recall");
    expect(packet.homework.testDate).toBe("2026-05-30");
    expect(packet.boardContract.nodeSource).toBe("activeSessionPlan.adventureBoard");
    expect(packet.boardContract.choicePattern).toContain("Quest/Boss wrappers open the shared card modal");
  });
});
