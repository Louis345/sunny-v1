import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { writePostSessionTruthPacket } from "./postSessionTruthPacket";

describe("PostSessionTruthPacket", () => {
  it("does not treat raw traces as canonical learning evidence when normalized activity readings exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-truth-normalized-"));
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "activities", "word-radar.ndjson"),
      JSON.stringify({
        type: "activity_reading",
        activityId: "word-radar",
        target: "machine",
        targetGroupId: "high_frequency_words",
        targetPurpose: "read_fluently",
        evidenceTier: "clean_recall",
        result: { status: "missed", correct: false },
        quality: { status: "clean", reasons: [] },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "node_complete",
        game: "word-radar",
        activityId: "word-radar",
        targetResults: [{ target: "wrong-raw-target", correct: true }],
      }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.evidenceInterpreted.targets).toContain("machine");
    expect(packet.evidenceInterpreted.targets).not.toContain("wrong-raw-target");
    expect(packet.evidenceInterpreted.correctTargets).not.toContain("wrong-raw-target");
    expect(packet.evidenceInterpreted.missedTargets).toContain("machine");
  });

  it("does not derive the adaptation decision from raw next_plan trace events", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-truth-no-raw-plan-"));
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "activities", "spell-check.ndjson"),
      JSON.stringify({
        type: "activity_reading",
        activityId: "spell-check",
        target: "ahead",
        targetPurpose: "spell_from_memory",
        result: { status: "missed", correct: false },
        quality: { status: "clean", reasons: [] },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "next_plan_changed",
        reason: "raw trace should not be canonical",
      }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.adaptationDecision.status).toBe("missing");
    expect(packet.adaptationDecision.reason).toContain("No next-plan decision");
  });

  it("rejects next_plan_unchanged when no explicit reason was written", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-unchanged-reason-"));
    fs.writeFileSync(
      path.join(dir, "adaptation-diff.json"),
      JSON.stringify({ status: "unchanged" }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.adaptationDecision.status).toBe("missing");
    expect(packet.adaptationDecision.reason).toContain("requires an explicit reason");
  });

  it("writes interpreted evidence and a next-plan diff for the session folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-truth-"));
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "activities", "word-radar.ndjson"),
      JSON.stringify({
        type: "activity_reading",
        activityId: "word-radar",
        target: "wait",
        evidenceTier: "practice",
        result: { status: "missed", correct: false, accuracy: 0.57 },
        quality: { status: "clean", reasons: [] },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "adaptation-diff.json"),
      JSON.stringify({
        status: "changed",
        reason: "weak recall routed to support",
        nextNodes: ["spell-check", "pronunciation"],
      }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.adaptationDecision.status).toBe("changed");
    expect(packet.evidenceInterpreted.activities).toContain("word-radar");
    expect(packet.evidenceInterpreted.missedTargets).toContain("wait");
    expect(fs.existsSync(path.join(dir, "post-session-truth.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "plan-before.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "evidence-interpreted.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "plan-after.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "adaptation-diff.json"))).toBe(true);
  });

  it("builds a canonical truth packet from activity readings, adventure logs, summaries, and chart evidence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-canonical-"));
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.mkdirSync(path.join(dir, "game-summaries"));
    fs.writeFileSync(
      path.join(dir, "adventure-log.ndjson"),
      [
        JSON.stringify({
          logKind: "adventure",
          type: "node_complete",
          activityId: "word-radar",
          nodeId: "n-radar",
          questState: "locked",
          bossState: "locked",
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "activities", "word-radar.ndjson"),
      [
        JSON.stringify({
          type: "activity_reading",
          activityId: "word-radar",
          nodeId: "n-radar",
          homeworkId: "hw-1",
          target: "machine",
          targetGroupId: "high_frequency_words",
          targetPurpose: "read_fluently",
          intent: "recognition/fluency check",
          evidenceTier: "clean_recall",
          shownState: { answerVisibility: "hidden", audioProof: "played" },
          childAction: { attemptedValue: "ma sheen", responseTimeMs: 2400, helpRequest: false },
          result: { status: "missed", correct: false, accuracy: 0 },
          quality: { status: "clean", reasons: [] },
          flow: { frustration: false, replay: false },
          interpretation: { evidenceMeaning: "slow high-frequency recognition" },
        }),
        JSON.stringify({
          type: "activity_reading",
          activityId: "spell-check",
          target: "ahead",
          targetPurpose: "spell_from_memory",
          evidenceTier: "practice",
          shownState: { answerVisibility: "hidden", scaffoldLevel: 1 },
          childAction: { attemptedValue: "ahed", helpRequest: true },
          result: { status: "recovered", correct: true },
          quality: { status: "scaffolded", reasons: ["help_request"] },
          flow: { frustration: true },
          interpretation: { evidenceMeaning: "spelling recovered with scaffold" },
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "next_plan_changed",
        reason: "machine routed to read-aloud support and ahead kept in scaffolded spelling",
        nextNodes: ["pronunciation", "spell-check"],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-summaries", "word-radar.json"),
      JSON.stringify({
        game: "word-radar",
        activityId: "word-radar",
        targetsShown: ["machine"],
        missedWords: ["machine"],
        accuracy: 0,
        evidenceTier: "clean_recall",
      }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.sessionSummary.activityCount).toBe(2);
    expect(packet.activityReports).toEqual([
      expect.objectContaining({
        activityId: "spell-check",
        readings: 1,
        recoveredTargets: ["ahead"],
        helpRequests: 1,
      }),
      expect.objectContaining({
        activityId: "word-radar",
        readings: 1,
        missedTargets: ["machine"],
        evidenceTiers: ["clean_recall"],
      }),
    ]);
    expect(packet.targetEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "machine",
          targetGroupId: "high_frequency_words",
          targetPurpose: "read_fluently",
          missedCount: 1,
          lastStatus: "missed",
        }),
        expect.objectContaining({
          target: "ahead",
          targetPurpose: "spell_from_memory",
          recoveredCount: 1,
          lastQuality: "scaffolded",
        }),
      ]),
    );
    expect(packet.flowAndPreferenceSignals.helpRequests).toBe(1);
    expect(packet.trustworthiness.weakTargets).toContain("ahead");
    expect(packet.questBossReadiness.boss.status).toBe("locked");
    expect(fs.existsSync(path.join(dir, "psychologist-decision.json"))).toBe(true);
  });

  it("marks adaptation as missing when evidence exists without a next-plan decision", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-missing-"));
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "node_complete",
        game: "monster-stampede",
        activityId: "monster-stampede",
        targetResults: [{ target: "ahead", correct: false }],
      }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.adaptationDecision.status).toBe("missing");
    expect(packet.adaptationDecision.reason).toContain("No next-plan decision");
    expect(packet.trustworthiness.missingEvidence).toContain("No normalized activity readings were written for raw trace evidence.");
  });

  it("normalizes activity ids and separates recovered targets from unresolved misses", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-normalized-ids-"));
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "activities", "spell-check.ndjson"),
      [
        JSON.stringify({
          type: "activity_reading",
          activityId: "Spell Check",
          target: "climb",
          targetPurpose: "spell_from_memory",
          result: { status: "missed", correct: false },
          quality: { status: "clean", reasons: [] },
        }),
        JSON.stringify({
          type: "activity_reading",
          activityId: "spell-check",
          target: "climb",
          targetPurpose: "spell_from_memory",
          result: { status: "correct", correct: true },
          quality: { status: "clean", reasons: [] },
        }),
      ].join("\n"),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);
    const spellCheck = packet.activityReports.find((row) => row.activityId === "spell-check");

    expect(packet.activityReports.filter((row) => /spell/i.test(row.activityId))).toHaveLength(1);
    expect(spellCheck).toMatchObject({
      correctTargets: [],
      missedTargets: [],
      recoveredTargets: ["climb"],
    });
    expect(packet.targetEvidence).toContainEqual(expect.objectContaining({
      target: "climb",
      recoveredCount: 1,
      missedCount: 0,
      correctCount: 0,
      lastStatus: "recovered",
    }));
  });

  it("keeps word-driven adaptation when a later non-word mystery event stays unchanged", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-post-session-word-driven-"));
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "activities", "word-radar.ndjson"),
      JSON.stringify({
        type: "activity_reading",
        activityId: "word-radar",
        target: "slowly",
        result: { status: "missed", correct: false },
        quality: { status: "clean", reasons: [] },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "node_complete",
          game: "word-radar",
          activityId: "word-radar",
          targetResults: [{ target: "slowly", correct: false }],
        }),
        JSON.stringify({
          type: "next_plan_changed",
          game: "word-radar",
          activityId: "word-radar",
          changedNodeIds: ["n-monster-stampede"],
          nextTargets: ["slowly"],
          reason: "future practice retargeted from word-radar evidence",
        }),
        JSON.stringify({
          type: "next_plan_unchanged",
          game: "mystery",
          activityId: "monster-stampede",
          changedNodeIds: [],
          nextTargets: [],
          reason: "completed node was not a word-driven homework activity",
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "adaptation-diff.json"),
      JSON.stringify({
        status: "changed",
        reason: "future practice retargeted from word-radar evidence",
        changedNodeIds: ["n-monster-stampede"],
      }),
      "utf8",
    );

    const packet = writePostSessionTruthPacket(dir);

    expect(packet.adaptationDecision.status).toBe("changed");
    expect(packet.adaptationDecision.reason).toContain("word-radar evidence");
  });
});
