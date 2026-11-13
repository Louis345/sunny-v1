import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { QuestSpecV1 } from "./questBossSpec";
import {
  buildQuestSpecPrompt,
  prepareGeneratedExperienceCandidates,
  selectGeneratedExperienceCandidate,
} from "./generatedExperienceCandidates";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";

const CHILD_ID = "reina";
const HOMEWORK_ID = "hw-candidate-shell";
const WORDS = ["sign", "know", "write"];

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-generated-candidates-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readJson<T>(root: string, rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T;
}

function plan(): ActiveSessionPlan {
  return {
    planId: "plan-candidate-shell",
    childId: CHILD_ID,
    createdAt: "2026-05-27T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: HOMEWORK_ID,
    domain: "spelling",
    testDate: "2026-05-29",
    nodePlan: [{
      id: "n-quest",
      type: "quest",
      activityId: "quest",
      targets: WORDS,
      difficulty: 2,
      source: "chart_planner",
      locked: true,
    }],
    adventureBoard: {
      schemaVersion: 1,
      boardId: "board-candidate-shell",
      planId: "plan-candidate-shell",
      childId: CHILD_ID,
      domain: "spelling",
      theme: {
        background: { type: "solid", value: "#123" },
        palette: {
          path: "#fff",
          completed: "#16a34a",
          available: "#7c3aed",
          locked: "#64748b",
          current: "#f59e0b",
          preview: "#60a5fa",
          text: "#fff",
          panel: "rgba(0,0,0,.5)",
        },
      },
      nodes: [{ id: "n-quest", kind: "quest", label: "Quest", state: "available", choiceSetId: "quest-choice" }],
      edges: [],
      choiceSets: [{
        id: "quest-choice",
        kind: "quest-wrapper",
        title: "Pick a quest",
        options: [
          { id: "story", label: "Story Quest", state: "available", tags: ["story"] },
          { id: "puzzle", label: "Puzzle Quest", state: "available", tags: ["puzzle"] },
        ],
      }],
    },
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "candidate",
      previousCompletedNodeCount: 1,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "silent",
      verbosity: "low",
      maxMicroProbes: 0,
    },
    evidenceUsed: [{ id: "baseline", type: "activity_result", summary: "ready" }],
    openQuestions: [],
    generatedExperienceBriefs: [],
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
    weekOf: "2026-05-27",
    testDate: null,
    wordList: WORDS,
    generatedAt: "2026-05-27T12:00:00.000Z",
    capturedContent: null,
    nodes: [{
      id: "n-quest",
      type: "quest",
      words: WORDS,
      difficulty: 2,
      gameFile: null,
      storyFile: null,
      date: "2026-05-27",
    }],
  };
  p.activeSessionPlan = plan();
  return p;
}

function cycle(): HomeworkCycle {
  return {
    homeworkId: HOMEWORK_ID,
    subject: "spelling_test",
    wordList: WORDS,
    capturedContent: {
      title: "Silent Letters",
      type: "spelling_test",
      rawText: WORDS.join(" "),
      words: WORDS,
      questions: [],
      sourceDocuments: [],
      contentProfile: null,
    },
    contentFingerprint: "candidate-fingerprint",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-27",
    testDate: "2026-05-29",
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

function specFor(label: string): QuestSpecV1 {
  return {
    schemaVersion: 1,
    stage: "quest",
    title: label,
    theme: "detective story",
    challengeFrame: "Solve hidden clues from memory.",
    visualWorld: "A compact detective table with glowing file tabs and bold Sunny buttons.",
    interactionFlavor: "Each answer opens one sealed clue drawer.",
    tensionCurve: "Quiet setup, focused recall, satisfying final stamp.",
    rewardMoment: "A solved stamp lands on the case file.",
    failureRecoveryStyle: "Misses become clues for a clean retry.",
    animationCues: ["file tab glow", "drawer opens", "solved stamp"],
    styleReference: "Sunny choice-card style with readable panels and tactile buttons.",
    wrapperTraits: ["story"],
    difficulty: 2,
    estimatedMinutes: 4,
    childFacingIntro: "The case opens with a quiet clue.",
    successCopy: "Case solved.",
    retryCopy: "Try the next clue.",
    scenes: [
      { id: "scene-1", title: "Case File", prompt: "Listen, remember, then type the hidden answer." },
    ],
  };
}

describe("generated experience candidates", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("asks the model for a strict wrapper-only spec instead of runtime or answer clues", () => {
    const activePlan = plan();
    const choiceSet = activePlan.adventureBoard!.choiceSets![0]!;
    const prompt = buildQuestSpecPrompt({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSet,
      option: choiceSet.options[0]!,
      targetWords: WORDS,
      homeworkCycle: cycle(),
      profile: profile(),
    });

    expect(prompt).toContain('"schemaVersion": 1');
    expect(prompt).toContain('"visualWorld": "what the generated shell should feel like visually"');
    expect(prompt).toContain('"interactionFlavor": "how each recall round feels as play"');
    expect(prompt).toContain('"rewardMoment": "what satisfying payoff happens after completion"');
    expect(prompt).toContain('"difficulty": 1 | 2 | 3');
    expect(prompt).toContain('"scenes": [{ "id": "scene-1", "title": "Scene Title", "prompt": "Wrapper-only prompt" }]');
    expect(prompt).toContain("Scene prompts must be wrapper context only");
    expect(prompt).toContain("Do not include definitions, semantic clues, rhymes");
    expect(prompt).toContain("Forbidden output strings: reina, Reina, sign, know, write");
    expect(prompt).toContain("Use \"you\" instead of the child name.");
    expect(prompt).toContain("Sunny owns the runtime shell");
    expect(prompt).toContain("Creative context packet");
    expect(prompt).toContain("designerPersona");
    expect(prompt).toContain("Sunny style reference");
    expect(prompt).toContain("curated inspiration");
    expect(prompt).not.toContain("- Child: reina");
  });

  it("prepares validated candidates through the trusted Quest shell", async () => {
    const root = makeRoot();
    roots.push(root);
    writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
    writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle());

    const result = await prepareGeneratedExperienceCandidates({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["story", "puzzle"],
      rootDir: root,
      now: new Date("2026-05-27T12:10:00.000Z"),
      generateSpec: async ({ option }) => specFor(option.label),
      validateRuntime: async () => ({
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-27T12:10:00.000Z",
        runtimeValidation: {
          engine: "playwright",
          passed: true,
          screenshotPaths: ["/tmp/quest.png"],
          consoleErrors: [],
          pageErrors: [],
          attemptedTargets: 3,
          completed: true,
          completionPayloads: [{ completed: true }],
          usedValidationHook: true,
        },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.status)).toEqual([
      "validated_available",
      "validated_available",
    ]);
    const candidateFile = path.join(
      root,
      `src/context/${CHILD_ID}/homework/games/2026-05-27/.candidates/quest-choice`,
      result.candidates[0]!.newFile,
    );
    expect(fs.existsSync(candidateFile)).toBe(true);
    expect(fs.readFileSync(candidateFile, "utf8")).toContain("/games/_contract.js");
  });

  it("marks selected and sibling candidates without discarding valid unchosen options", async () => {
    const root = makeRoot();
    roots.push(root);
    writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
    writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle());

    const prepared = await prepareGeneratedExperienceCandidates({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["story", "puzzle"],
      rootDir: root,
      now: new Date("2026-05-27T12:10:00.000Z"),
      generateSpec: async ({ option }) => specFor(option.label),
      validateRuntime: async () => ({
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-27T12:10:00.000Z",
      }),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.reason);
    const selected = prepared.candidates[0]!;

    const result = selectGeneratedExperienceCandidate({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      selectedCandidateId: selected.candidateId,
      rootDir: root,
      now: new Date("2026-05-27T12:12:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.notSelectedCandidateIds).toHaveLength(1);
    const lifecycle = readJson<{ candidates: Array<{ candidateId: string; status: string }> }>(
      root,
      `src/context/${CHILD_ID}/homework/games/2026-05-27/.candidates/quest-choice/candidates.json`,
    );
    expect(lifecycle.candidates).toContainEqual(expect.objectContaining({
      candidateId: selected.candidateId,
      status: "selected",
    }));
    expect(lifecycle.candidates).toContainEqual(expect.objectContaining({
      candidateId: result.notSelectedCandidateIds[0],
      status: "not_selected",
    }));
    expect(lifecycle.candidates).not.toContainEqual(expect.objectContaining({ status: "discarded" }));
    const updatedProfile = readJson<LearningProfile>(root, `src/context/${CHILD_ID}/learning_profile.json`);
    expect(updatedProfile.pendingHomework?.nodes[0]?.gameFile).toBe(result.newFile);
    const playableFile = path.join(
      root,
      `src/context/${CHILD_ID}/homework/games/2026-05-27`,
      result.newFile,
    );
    expect(fs.existsSync(playableFile)).toBe(true);
    expect(fs.readFileSync(playableFile, "utf8")).toContain("/games/_contract.js");
  });
});
