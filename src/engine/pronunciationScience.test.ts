import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  comparePronunciationProviders,
  demoPronunciationScienceResults,
  mapPronunciationToWilsonSignals,
  normalizeAzurePronunciationPayload,
  normalizeSpeechacePronunciationPayload,
  readLatestPronunciationScienceSummary,
  writePronunciationScienceEvidence,
} from "./pronunciationScience";

const ROOTS: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-pronunciation-science-"));
  ROOTS.push(root);
  return root;
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function seedDemoChild(root: string): string {
  const childId = "demo_adaptive";
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["reading"],
  });
  const contextRoot = path.join(root, ".sunny-sandbox", "context");
  writeJson(root, ".sunny-sandbox/context/demo_adaptive/learning_profile.json", profile);
  writeJson(root, ".sunny-sandbox/context/demo_adaptive/word_bank.json", {
    childId,
    version: 1,
    words: [],
    lastUpdated: "2026-05-15T12:00:00.000Z",
  });
  return contextRoot;
}

afterEach(() => {
  for (const root of ROOTS.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("pronunciation science", () => {
  it("normalizes Azure phoneme evidence and maps it to Wilson-style signals", () => {
    const result = normalizeAzurePronunciationPayload({
      targetWord: "ahead",
      createdAt: "2026-05-15T12:00:00.000Z",
      flowState: {
        timeOnTask_ms: 10_000,
        bestStreak: 4,
        heatReached: true,
        comboReached: false,
        retries: 2,
        missToHitRecoveries: 1,
        idleEvents: 0,
        pauseRequests: 0,
        replayRequests: 1,
        powerBarSurvival_ms: 10_000,
        abandoned: false,
      },
      payload: {
        NBest: [{
          Display: "ahead",
          PronunciationAssessment: { AccuracyScore: 62, FluencyScore: 70, ProsodyScore: 74 },
          Words: [{
            Word: "ahead",
            PronunciationAssessment: { AccuracyScore: 62 },
            Phonemes: [
              { Phoneme: "ah", PronunciationAssessment: { AccuracyScore: 92 } },
              { Phoneme: "h", PronunciationAssessment: { AccuracyScore: 20 }, ErrorType: "Omission" },
              { Phoneme: "eh", PronunciationAssessment: { AccuracyScore: 60 } },
              { Phoneme: "d", PronunciationAssessment: { AccuracyScore: 88 } },
            ],
          }],
        }],
      },
    });

    expect(result.provider).toBe("azure");
    expect(result.wordScore).toBe(62);
    expect(result.phonemeScores.map((row) => row.phoneme)).toEqual(["ah", "h", "eh", "d"]);
    expect(result.omissions).toContain("h");
    expect(result.wilsonSignals).toEqual(expect.arrayContaining([
      "medial_sound_confusion",
      "segmentation",
      "vowel_confusion",
      "recovery_after_model",
    ]));
  });

  it("normalizes Speechace sound_most_like evidence and compares providers", () => {
    const speechace = normalizeSpeechacePronunciationPayload({
      targetWord: "ahead",
      createdAt: "2026-05-15T12:00:00.000Z",
      payload: {
        text_score: {
          word_score_list: [{
            word: "ahead",
            quality_score: 58,
            phone_score_list: [
              { phone: "ah", quality_score: 95 },
              { phone: "h", quality_score: 25, sound_most_like: "d" },
              { phone: "eh", quality_score: 62 },
              { phone: "d", quality_score: 86 },
            ],
            syllable_score_list: [{ letters: "a", quality_score: 60 }],
          }],
        },
      },
    });
    const azure = demoPronunciationScienceResults()[0]!;

    expect(speechace.provider).toBe("speechace");
    expect(speechace.soundMostLike).toBe("d");
    expect(speechace.substitutions[0]).toMatchObject({ expected: "h", actual: "d" });

    const [comparison] = comparePronunciationProviders([azure, speechace]);
    expect(comparison?.targetWord).toBe("ahead");
    expect(comparison?.agreement).toBe("agree");
    expect(comparison?.clearestProvider).toMatch(/azure|speechace|both/);
  });

  it("maps explicit phoneme and flow patterns without a provider payload", () => {
    const signals = mapPronunciationToWilsonSignals({
      targetWord: "slowly",
      spokenTranscript: "slow",
      phonemeScores: [
        { phoneme: "s", score: 95, position: "initial" },
        { phoneme: "ow", score: 40, position: "medial" },
        { phoneme: "l", score: 92, position: "medial" },
        { phoneme: "iy", score: 28, position: "final" },
      ],
      omissions: ["iy"],
      insertions: [],
      substitutions: [{ expected: "iy", actual: "ih", position: "final" }],
      flowState: {
        timeOnTask_ms: 20_000,
        bestStreak: 5,
        heatReached: true,
        comboReached: false,
        retries: 1,
        missToHitRecoveries: 1,
        idleEvents: 0,
        pauseRequests: 0,
        replayRequests: 0,
        powerBarSurvival_ms: 20_000,
        abandoned: false,
      },
    });

    expect(signals).toEqual(expect.arrayContaining([
      "medial_sound_confusion",
      "final_sound_confusion",
      "segmentation",
      "suffix_reading",
      "auditory_discrimination",
    ]));
  });

  it("writes and summarizes pronunciation science only inside the sandbox context root", () => {
    const root = makeRoot();
    const contextRoot = seedDemoChild(root);
    const results = demoPronunciationScienceResults("2026-05-15T12:00:00.000Z");

    const file = writePronunciationScienceEvidence("demo_adaptive", {
      sessionId: "session-1",
      homeworkId: "hw-demo",
      results,
    }, {
      rootDir: root,
      contextRoot,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });
    const summary = readLatestPronunciationScienceSummary("demo_adaptive", {
      rootDir: root,
      contextRoot,
    });

    expect(file).toContain(".sunny-sandbox/context/demo_adaptive/pronunciation_science");
    expect(fs.existsSync(path.join(root, "src/context/demo_adaptive/pronunciation_science"))).toBe(false);
    expect(summary.resultCount).toBe(2);
    expect(summary.providers).toEqual(expect.arrayContaining(["azure", "speechace"]));
    expect(summary.lowScoreTargets).toContain("ahead");
    expect(summary.wilsonSignals).toContain("segmentation");
    expect(summary.flowState.totalMissToHitRecoveries).toBe(4);
  });
});
