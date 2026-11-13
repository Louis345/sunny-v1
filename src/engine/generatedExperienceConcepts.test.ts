import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  prepareGeneratedExperienceConcepts,
  selectGeneratedExperienceConcept,
} from "./generatedExperienceConcepts";
import type { ConceptCandidateV1 } from "./questBossDesignLoop";

const CHILD_ID = "reina";
const HOMEWORK_ID = "hw-design-loop";
const WORDS = ["sign", "know", "write"];

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
    planId: "plan-design-loop",
    childId: CHILD_ID,
    createdAt: "2026-05-29T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: HOMEWORK_ID,
    domain: "spelling",
    testDate: "2026-05-30",
    nodePlan: [{
      id: "n-quest",
      type: "quest",
      activityId: "quest",
      targets: WORDS,
      difficulty: 2,
      source: "chart_planner",
    }],
    adventureBoard: {
      schemaVersion: 1,
      boardId: "board-design-loop",
      planId: "plan-design-loop",
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
      nodes: [{ id: "n-quest", kind: "quest", label: "Quest", state: "available", choiceSetId: "quest-choice" }],
      edges: [],
      choiceSets: [{
        id: "quest-choice",
        kind: "quest-wrapper",
        title: "Pick a quest",
        options: [
          { id: "launch", label: "Launch Lab", state: "available", tags: ["charge-meter", "visual"] },
          { id: "vault", label: "Mystery Vault", state: "available", tags: ["mystery", "puzzle"] },
        ],
      }],
    },
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "design-loop",
      previousCompletedNodeCount: 1,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "silent",
      verbosity: "low",
      maxMicroProbes: 0,
    },
    evidenceUsed: [{ id: "baseline", type: "activity_result", summary: "baseline" }],
    openQuestions: [],
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
    generatedAt: "2026-05-29T12:00:00.000Z",
    capturedContent: null,
    nodes: [{ id: "n-quest", type: "quest", words: WORDS, difficulty: 2, gameFile: null, storyFile: null, date: "2026-05-29" }],
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
      rawText: "Spelling words: sign, know, write",
      words: WORDS,
      questions: [],
      sourceDocuments: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "silent letters",
        primarySkill: "spell from memory",
        assignmentFormat: "spelling list",
        concepts: ["silent letters"],
        sourceEvidence: ["fixture"],
      },
    },
    contentFingerprint: "design-loop",
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

function concept(optionId: string, title: string): ConceptCandidateV1 {
  return {
    schemaVersion: 1,
    conceptId: `concept-${optionId}`,
    optionId,
    title,
    hook: "Charge the challenge by proving answers from memory.",
    artDirection: "Bright game world with one strong object, progress meter, and tactile launch moment.",
    interactionFantasy: "Each answer charges the object toward a payoff.",
    rewardLoop: "Three proof moments unlock a satisfying launch.",
    domainProofPlan: "Use hidden spelling recall with typed production and reveal only after attempt.",
    childFitRationale: "Uses visual progress and short action loops.",
    supportCriteria: ["completed attempts"],
    reviseCriteria: ["asks for different"],
    falsifyCriteria: ["abandons early"],
    traits: ["visual", "charge-meter"],
    estimatedMinutes: 4,
    companionMicroQuestion: {
      prompt: "What made you pick that one?",
      answerType: "free_text",
    },
  };
}

describe("generated experience concepts", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("prepares concept cards without generating game files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-concepts-"));
    roots.push(root);
    writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
    writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle());

    const result = await prepareGeneratedExperienceConcepts({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["launch", "vault"],
      rootDir: root,
      now: new Date("2026-05-29T12:00:00.000Z"),
      generateConcepts: async () => [concept("launch", "Orb Launch Lab"), concept("vault", "Mystery Vault")],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.concepts).toHaveLength(2);
    expect(result.concepts[0]).toMatchObject({
      conceptId: "concept-launch",
      optionId: "launch",
      status: "concept_candidate",
      companionMicroQuestion: { prompt: "What made you pick that one?" },
    });
    expect(fs.existsSync(path.join(root, `src/context/${CHILD_ID}/homework/games/2026-05-29/.candidates`))).toBe(false);
  });

  it("selects one concept, marks siblings not selected, and builds only the selected game", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-concepts-"));
    roots.push(root);
    writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
    writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle());

    const prepared = await prepareGeneratedExperienceConcepts({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      optionIds: ["launch", "vault"],
      rootDir: root,
      now: new Date("2026-05-29T12:00:00.000Z"),
      generateConcepts: async () => [concept("launch", "Orb Launch Lab"), concept("vault", "Mystery Vault")],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.reason);

    const selected = await selectGeneratedExperienceConcept({
      childId: CHILD_ID,
      kind: "quest",
      nodeId: "n-quest",
      choiceSetId: "quest-choice",
      selectedConceptId: "concept-launch",
      microQuestionAnswer: "the launch looked fun",
      rootDir: root,
      now: new Date("2026-05-29T12:02:00.000Z"),
      validateRuntime: async () => ({
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-29T12:02:00.000Z",
        runtimeValidation: {
          engine: "playwright",
          passed: true,
          screenshotPaths: ["/tmp/concept.png"],
          consoleErrors: [],
          pageErrors: [],
          attemptedTargets: 3,
          completed: true,
          completionPayloads: [{ completed: true }],
          usedValidationHook: true,
        },
      }),
    });

    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.reason);
    expect(selected.selectedConceptId).toBe("concept-launch");
    expect(selected.notSelectedConceptIds).toEqual(["concept-vault"]);
    expect(selected.newFile).toBe("quest-quest-choice-launch.html");
    const concepts = readJson<{ concepts: Array<{ conceptId: string; status: string; microQuestionAnswer?: string }> }>(
      root,
      `src/context/${CHILD_ID}/homework/games/2026-05-29/.concepts/quest-choice/concepts.json`,
    );
    expect(concepts.concepts).toContainEqual(expect.objectContaining({
      conceptId: "concept-launch",
      status: "concept_selected",
      microQuestionAnswer: "the launch looked fun",
    }));
    expect(concepts.concepts).toContainEqual(expect.objectContaining({
      conceptId: "concept-vault",
      status: "concept_not_selected",
    }));
    const generatedFiles = fs.readdirSync(
      path.join(root, `src/context/${CHILD_ID}/homework/games/2026-05-29/.candidates/quest-choice`),
    );
    expect(generatedFiles).toContain("quest-quest-choice-launch.html");
    expect(generatedFiles).not.toContain("quest-quest-choice-vault.html");
  });
});
