/**
 * Bug 2026-11-10 (Ila, Saori kiosk): the Mac's keyboard was in Japanese input mode. She typed f-o-r-g-o-t and
 * Sunny saved "フォrゴt" (also "イmポrt", "チャrゲ", "sタrヴィンg") and scored each as a misspelling.
 * Why the human caught it: the parent read the saved answers and saw katakana where letters belonged.
 * Why logs did not: the attempt log printed only item ids and "committed"; nothing looked at the characters.
 * Why the lab missed it: every lab child and fixture types plain ASCII; no test ever fed an IME-converted string.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTypedSpelling } from "./imeTypedSpelling";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle, buildSpellingDiscoveryPlan } from "./learningCycleIngest";
import { publishDiscoveryExperience } from "./adaptiveMathDiscovery";
import { recordSpellingDiscoveryAttempt, scoreSpellingRecall } from "./learningCycleRuntime";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";

describe("Japanese-input spelling answers", () => {
  it("recovers the letters she typed from her real 11/10 answers", () => {
    expect(readTypedSpelling("フォrゴt", ["forgot"])).toMatchObject({ status: "ime_normalized", value: "forgot" });
    expect(readTypedSpelling("イmポrt", ["import"])).toMatchObject({ status: "ime_normalized", value: "import" });
    expect(readTypedSpelling("チャrゲ", ["charge"])).toMatchObject({ status: "ime_normalized", value: "charge" });
    expect(readTypedSpelling("sタrヴィンg", ["starving"])).toMatchObject({ status: "ime_normalized", value: "starving" });
  });

  it("converts full-width letters and leaves plain typing alone", () => {
    expect(readTypedSpelling("ｆｏｒｇｏｔ", ["forgot"])).toMatchObject({ status: "ime_normalized", value: "forgot" });
    expect(readTypedSpelling("forgot", ["forgot"])).toEqual({ raw: "forgot", value: "forgot", status: "plain", candidates: ["forgot"] });
    expect(readTypedSpelling("can't", ["can't"]).status).toBe("plain");
  });

  it("keeps a wrong spelling wrong when every possible typing is wrong", () => {
    // カ could be "ka" or "ca": both "kat" and "cat" miss "kite".
    expect(readTypedSpelling("カt", ["kite"])).toMatchObject({ status: "ime_normalized" });
    expect(readTypedSpelling("フォrガt", ["forgot"])).toMatchObject({ status: "ime_normalized", value: "forgat" });
  });

  it("refuses to guess when the kana hides whether she typed the right letters", () => {
    // カt is what both "cat" and "kat" become; Sunny cannot know which one she typed.
    expect(readTypedSpelling("カt", ["cat"]).status).toBe("ime_ambiguous");
    expect(readTypedSpelling("シt", ["sit"]).status).toBe("ime_ambiguous");
  });

  it("marks answers that cannot become plain letters as not scorable", () => {
    expect(readTypedSpelling("フォー", ["for"]).status).toBe("ime_unscorable");
    expect(readTypedSpelling("忘れた", ["forgot"]).status).toBe("ime_unscorable");
  });

  it("scores the recovered letters, and never scores an unreadable answer as wrong", () => {
    const [forgot] = buildSpellingRecallItems({ homeworkId: "hw-ime", words: ["forgot"], evidenceIds: ["s"], measurementRole: "fresh_checkpoint" });
    expect(scoreSpellingRecall(forgot, "フォrゴt")).toEqual({ correct: true, score: 1 });
    expect(scoreSpellingRecall(forgot, "フォrガt")).toEqual({ correct: false, score: 0 });
    expect(scoreSpellingRecall(forgot, "忘れた")).toEqual({ observedErrorType: "keyboard_ime_unscorable" });
    const [cat] = buildSpellingRecallItems({ homeworkId: "hw-ime", words: ["cat"], evidenceIds: ["s"], measurementRole: "fresh_checkpoint" });
    expect(scoreSpellingRecall(cat, "カt")).toEqual({ observedErrorType: "keyboard_ime_ambiguous" });
  });

  it("saves the recovered letters with the raw keyboard text kept as a fact", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ime-"));
    try {
      const items = buildSpellingRecallItems({ homeworkId: "hw-ime", words: ["forgot", "import"], evidenceIds: ["source:one"], measurementRole: "fresh_checkpoint" });
      const cycle = createSpellingDiscoveryCycle({ childId: "lab-child", homeworkId: "hw-ime", title: "Words", contentFingerprint: "fp", items, boardDefinition: linearJourneyFixture(["hw-ime:discovery"]) }, { rootDir });
      await publishDiscoveryExperience({ rootDir, childId: cycle.childId, homeworkId: cycle.homeworkId, spellingItems: items, assignment: cycle.assignment,
        activeSessionPlan: buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } }) });
      const support = { status: "unassisted" as const, scaffolds: [] };
      const write = (attemptId: string, itemId: string, attemptedValue: string) => recordSpellingDiscoveryAttempt({ childId: "lab-child", homeworkId: "hw-ime", support,
        attempt: { attemptId, itemId, attemptedValue, observedAt: "2026-11-10T15:00:00Z" } }, { rootDir });
      write("a1", items[0].id, "フォrゴt");
      const saved = write("a2", items[1].id, "イmポrー").observations;
      expect(saved[0]).toMatchObject({ childResponse: "forgot", result: { correct: true } });
      expect(saved[0].confounds).toEqual(expect.arrayContaining(["keyboard_ime_input", "ime_raw:フォrゴt"]));
      expect(saved[1].result).toEqual({ observedErrorType: "keyboard_ime_unscorable" });
      expect(saved[1].childResponse).toBe("イmポrー");
      // A repeated delivery of the same raw answer is the same attempt, not a conflict.
      expect(() => write("a1", items[0].id, "フォrゴt")).not.toThrow();
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
});
