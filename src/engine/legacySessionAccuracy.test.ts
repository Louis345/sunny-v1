import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeSession, formatLegacySessionAccuracy, getSessionRewardState, planSession, recordAttempt } from "./learningEngine";
import { initializeLearningProfile, readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle } from "./learningCycleIngest";
import { recordSpellingDiscoveryAttempt } from "./learningCycleRuntime";
import { getLearningCycle } from "./learningCycleRepository";
import { computeProgression } from "./progression";

const childId = "lab-legacy-accuracy";
let rootDir: string;
let childDir: string;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-legacy-accuracy-"));
  childDir = path.join(rootDir, "src/context", childId);
  vi.spyOn(process, "cwd").mockReturnValue(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", persistenceMode: "live" }));
  writeLearningProfile(childId, initializeLearningProfile({ childId, age: 8, grade: 3, diagnoses: [], learningGoals: [] }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(rootDir, { recursive: true, force: true });
});

function measured(correct: boolean[]) {
  planSession(childId, "spelling");
  correct.forEach((value, index) => recordAttempt(childId, { word: index ? "light" : "night", domain: "spelling", correct: value, quality: value ? 5 : 0, scaffoldLevel: 0 }));
  return finalizeSession(childId);
}
function note() {
  return fs.readFileSync(path.join(childDir, "session_notes", `${new Date().toISOString().slice(0, 10)}.md`), "utf8");
}

describe("legacy finalization cannot turn missing measurements into failure", () => {
  // The human saw 20 saved native observations but a 0% legacy summary. Old labs
  // exercised canonical capture and legacy finalization separately, not together.
  it("keeps native-only Discovery evidence and prior accuracy intact on Leave", () => {
    measured([true, true]);
    const before = readLearningProfile(childId)!;
    const items = buildSpellingRecallItems({ homeworkId: "hw-native", words: ["night", "light", "bright", "sight", "right", "might", "flight", "high", "sky", "fly", "try", "cry", "dry", "why", "my", "by", "kind", "find", "mind", "child"], evidenceIds: ["source:lab"], measurementRole: "fresh_checkpoint" });
    createSpellingDiscoveryCycle({ childId, homeworkId: "hw-native", title: "Lab words", contentFingerprint: "lab-fingerprint", items }, { rootDir });
    planSession(childId, "homework");
    items.forEach(item => recordSpellingDiscoveryAttempt({ childId, homeworkId: "hw-native", attempt: { attemptId: `attempt:${item.id}`, itemId: item.id, attemptedValue: item.word, observedAt: new Date().toISOString() }, support: { status: "unassisted", scaffolds: [] } }, { rootDir }));
    const cycleFile = path.join(childDir, "homework/cycles/hw-native.json");
    const canonicalBefore = fs.readFileSync(cycleFile, "utf8");
    const bankBefore = fs.readFileSync(path.join(childDir, "word_bank.json"), "utf8");
    const summary = finalizeSession(childId);
    const after = readLearningProfile(childId)!;
    expect(summary).toMatchObject({ totalAttempts: 0, accuracy: null });
    expect(after.moodHistory).toEqual(before.moodHistory);
    expect(after.sessionStats.averageAccuracy).toBe(1);
    expect(after.sessionStats.totalSessions).toBe(before.sessionStats.totalSessions + 1);
    expect(fs.readFileSync(cycleFile, "utf8")).toBe(canonicalBefore);
    expect(getLearningCycle(childId, "hw-native", { rootDir })!.observations).toHaveLength(20);
    expect(fs.readFileSync(path.join(childDir, "word_bank.json"), "utf8")).toBe(bankBefore);
    expect(getSessionRewardState(childId)).toBeNull();
    expect(note()).toContain("Accuracy: unmeasured (0 legacy attempts)");
    expect(note()).not.toContain("Accuracy: 0%");
  });

  it("reports a never-measured empty session as unmeasured, not zero", () => {
    const summary = finalizeSession(childId);
    const profile = readLearningProfile(childId)!;
    expect(summary.accuracy).toBeNull();
    expect(profile.sessionStats.averageAccuracy).toBeNull();
    expect(profile.moodHistory).toEqual([]);
    expect(formatLegacySessionAccuracy(summary)).toBe("no measured legacy accuracy");
  });

  it("excludes empty visits from the denominator of later measured averages", () => {
    expect(measured([true]).accuracy).toBe(1);
    finalizeSession(childId);
    finalizeSession(childId);
    expect(measured([true, false]).accuracy).toBe(0.5);
    const profile = readLearningProfile(childId)!;
    expect(profile.sessionStats.totalSessions).toBe(4);
    expect(profile.sessionStats.averageAccuracy).toBe(0.75);
    expect(profile.moodHistory.map(row => row.sessionAccuracy)).toEqual([1, 0.5]);
    expect(note()).toContain("Accuracy: 50% (1/2)");
  });

  it("preserves the weight of an existing legacy aggregate without rewriting old mood entries", () => {
    const profile = readLearningProfile(childId)!;
    profile.sessionStats.totalSessions = 4;
    profile.sessionStats.averageAccuracy = 0.75;
    profile.moodHistory = [{ date: "2026-09-01", startMood: "neutral", endMood: "neutral", bondQuality: "moderate", sessionAccuracy: 0, notableSignals: ["historical; eligibility unknown"] }];
    writeLearningProfile(childId, profile);
    finalizeSession(childId);
    measured([true, false]);
    const after = readLearningProfile(childId)!;
    expect(after.sessionStats.averageAccuracy).toBe(0.7);
    expect(after.moodHistory[0]).toEqual(profile.moodHistory[0]);
  });

  it("keeps real all-wrong work measured as zero rather than unmeasured", () => {
    const summary = measured([false, false]);
    const profile = readLearningProfile(childId)!;
    expect(summary).toMatchObject({ totalAttempts: 2, accuracy: 0 });
    expect(profile.sessionStats.averageAccuracy).toBe(0);
    expect(profile.moodHistory[0].sessionAccuracy).toBe(0);
    expect(formatLegacySessionAccuracy(summary)).toBe("0% accuracy");
  });

  it("does not manufacture a declining trend from repeated empty visits", () => {
    measured([true]); measured([true]); measured([true]); measured([true]);
    const before = computeProgression(childId).recentTrend;
    finalizeSession(childId); finalizeSession(childId); finalizeSession(childId);
    expect(computeProgression(childId).recentTrend).toBe(before);
    expect(readLearningProfile(childId)!.moodHistory).toHaveLength(4);
  });
});
