import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { auditSessionDirectory, renderAuditMarkdown } from "./auditSessionDirectory";

describe("auditSessionDirectory", () => {
  const realFixture = (relative: string) => path.join(process.cwd(), relative);

  it("keeps the Reina b2343c escaped session as an immutable high-severity regression fixture", () => {
    const dir = realFixture("src/fixtures/sessions/reina-b2343c-bad");
    expect(fs.existsSync(dir)).toBe(true);

    const report = auditSessionDirectory(dir);
    const codes = report.issues
      .filter((issue) => issue.severity === "high")
      .map((issue) => issue.code);

    expect(codes).toEqual(expect.arrayContaining([
      "off_assignment_target_launched",
      "target_purpose_missing",
      "stale_current_target",
      "duplicate_narration_request",
      "companion_false_mastery_claim",
      "pronunciation_accuracy_denominator_mismatch",
      "summary_target_contradiction",
      "activity_accuracy_missing_target_truth",
      "missing_psychologist_adaptation_decision",
    ]));
  });

  it("keeps the Reina b2343c golden fixture free of high-severity readiness issues", () => {
    const dir = realFixture("src/fixtures/sessions/reina-b2343c-golden");
    expect(fs.existsSync(dir)).toBe(true);

    const report = auditSessionDirectory(dir);
    const highIssues = report.issues.filter((issue) => issue.severity === "high");

    expect(highIssues).toEqual([]);
  });

  it("flags hidden Word Radar recall when the session records it as ordinary practice", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-word-radar-mode-contract-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "game_complete",
        game: "word-radar",
        activityId: "word-radar",
        recallMode: "hidden_word_recall",
        evidenceTier: "practice",
        targetResults: [
          {
            target: "among",
            correct: false,
            mode: "hidden_word_recall",
            evidenceTier: "practice",
            masteryEligible: false,
          },
        ],
      }),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("word_radar_mode_contract_violation");
  });

  it("flags runtime mode or target drift from the launched session-plan contract", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-session-plan-drift-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        {
          type: "node_launched",
          activityId: "word-radar",
          nodeId: "node-highfreq",
          plannedTargets: ["among", "building"],
          launchedTargets: ["among", "building"],
          wordRadarConfig: { recallMode: "visible_read" },
        },
        {
          type: "game_complete",
          activityId: "word-radar",
          nodeId: "node-highfreq",
          recallMode: "hidden_word_recall",
          targetResults: [{ target: "sign", correct: true, mode: "hidden_word_recall" }],
        },
      ].map((row) => JSON.stringify(row)).join("\n"),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("session_plan_drift");
  });

  it("flags missing game traces as a high-trust audit blocker", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-missing-trace-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");

    const report = auditSessionDirectory(dir);

    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: "high",
      code: "missing_game_trace",
    }));
  });

  it("flags missing first-principles truth taxonomy and missing next-plan diffs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-missing-truth-taxonomy-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "node_complete",
        game: "spell-check",
        activityId: "spell-check",
        targetResults: [{ target: "ahead", correct: false }],
      }),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("missing_system_log");
    expect(codes).toContain("missing_adventure_log");
    expect(codes).toContain("missing_activity_readings");
    expect(codes).toContain("missing_post_session_truth_packet");
    expect(codes).toContain("missing_next_plan_diff");
  });

  it("flags impossible Word Radar mentions, hidden Wheel answers, and zero-attempt summaries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-session-"));
    fs.writeFileSync(
      path.join(dir, "transcript.md"),
      "**assistant:** You did Word Radar. The answer was above.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "summary.md"),
      "  🎮 [engine] session finalized: 0 attempts, 0% accuracy\n",
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "game_state_update",
          game: "Wheel of Fortune",
          phase: "playing",
          currentWord: "above",
          answerVisibility: "hidden",
        }),
        JSON.stringify({
          type: "node_complete",
          game: "pronunciation",
          phase: "complete",
          totalWords: 5,
          hitEvents: 40,
          uniqueTargetsAttempted: 5,
        }),
      ].join("\n"),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("impossible_activity_mention");
    expect(codes).toContain("hidden_answer_leak_risk");
    expect(codes).toContain("zero_attempt_summary_mismatch");
    expect(codes).toContain("pronunciation_hit_inflation");
    expect(renderAuditMarkdown(report)).toContain("Sunny Session Audit");
  });

  it("flags the compact engine zero-attempt summary format used in live session logs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-compact-zero-attempt-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "summary.md"),
      "- +118s engine.session_finalized totalAttempts=0 accuracy=0\n",
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "node_complete",
        game: "spell-check",
        activityId: "spell-check",
        targetResults: [{ target: "ahead", correct: true, attempts: 1 }],
      }),
      "utf8",
    );

    const report = auditSessionDirectory(dir);

    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: "high",
      code: "zero_attempt_summary_mismatch",
    }));
  });

  it("flags suppressed help requests as high-trust blockers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-suppressed-help-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      JSON.stringify({
        type: "transcript_suppressed",
        game: "spell-check",
        reason: "spell-check_active_game",
        transcript: "What word is it?",
      }),
      "utf8",
    );

    const report = auditSessionDirectory(dir);

    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: "high",
      code: "suppressed_help_request",
    }));
  });

  it("flags Word Radar answer visibility and suspicious pronunciation background scoring", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-visible-word-radar-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "node_launched",
          game: "word-radar",
          answerVisibility: "visible",
          currentWord: "machine",
        }),
        JSON.stringify({
          type: "game_state_update",
          game: "word-radar",
          phase: "response",
          answerVisibility: "visible",
          currentTarget: "machine",
        }),
        JSON.stringify({
          type: "game_state_update",
          game: "pronunciation",
          phase: "hit",
          lastOutcomeWord: "government",
          lastHeard: "movie talk unrelated government then more background words",
        }),
      ].join("\n"),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("word_radar_answer_visible");
    expect(codes).toContain("pronunciation_background_hit_risk");
  });

  it("flags target-purpose mismatches, homophone misses, duplicate narration, stale targets, false boss claims, and contaminated Word Radar evidence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-source-truth-"));
    fs.writeFileSync(
      path.join(dir, "transcript.md"),
      "**assistant:** Word Radar was 100% perfect and the boss is unlocked.\n",
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "node_launched",
          game: "word-radar",
          activityId: "word-radar",
          activityIntent: {
            purpose: "recognition_recall_scan",
            acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory"],
          },
          targetSelectorDecision: {
            targetReasons: [
              { target: "machine", targetPurpose: "recognize", reasons: ["high-frequency word target"] },
            ],
          },
          expectedTargets: ["machine"],
        }),
        JSON.stringify({
          type: "pronunciation_miss",
          game: "pronunciation",
          word: "pair",
          lastHeard: "Pear",
        }),
        JSON.stringify({
          type: "narration_request",
          game: "monster-stampede",
          text: "ago.",
          word: "ago",
          reason: "repeat_word",
          timestamp: 1000,
        }),
        JSON.stringify({
          type: "narration_request",
          game: "monster-stampede",
          text: "ago.",
          word: "ago",
          reason: "repeat_word",
          timestamp: 1200,
        }),
        JSON.stringify({
          type: "game_state_update",
          game: "monster-stampede",
          currentWord: "ago",
          promptedWord: "above",
        }),
        JSON.stringify({
          type: "node_complete",
          game: "word-radar",
          accuracy: 0.57,
          evidenceTier: "practice",
          targetResults: [
            {
              target: "wait",
              attemptedValue: "Ellie Ellie, you're there? W a i t",
              correct: true,
            },
          ],
        }),
        JSON.stringify({
          type: "next_plan_unchanged",
          game: "monster-stampede",
          reason: "completed node was not a word-driven homework activity",
          targetResults: [{ target: "ahead", correct: false }],
        }),
      ].join("\n"),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("target_purpose_activity_mismatch");
    expect(codes).toContain("pronunciation_homophone_marked_miss");
    expect(codes).toContain("duplicate_narration_request");
    expect(codes).toContain("stale_current_target");
    expect(codes).toContain("companion_false_mastery_claim");
    expect(codes).toContain("companion_false_boss_unlock_claim");
    expect(codes).toContain("word_radar_contaminated_attempt");
    expect(codes).toContain("adaptation_ignored_word_evidence");
  });

  it("flags the exact source-of-truth failures emitted by the latest Ila spelling session shape", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-ila-source-truth-"));
    fs.mkdirSync(path.join(dir, "game-summaries"));
    fs.writeFileSync(
      path.join(dir, "transcript.md"),
      "**assistant:** YES! You just crushed that Word Radar with 100% accuracy — five words, zero mistakes! The boss level is unlocked.\n",
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "events.ndjson"),
      [
        JSON.stringify({
          ts: "2026-05-17T21:48:01.000Z",
          component: "game_narration",
          action: "speak",
          activityId: "monster-stampede",
          reason: "repeat_word",
          text: "ago.",
          word: "ago",
        }),
        JSON.stringify({
          ts: "2026-05-17T21:48:01.250Z",
          component: "game_narration",
          action: "speak",
          activityId: "monster-stampede",
          reason: "repeat_word",
          text: "ago.",
          word: "ago",
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "game_state_update",
          game: "pronunciation",
          phase: "miss",
          currentWord: "pair",
          lastHeard: "Pear",
        }),
        JSON.stringify({
          type: "game_state_update",
          game: "word-radar",
          phase: "response",
          answerVisibility: "hidden",
          activityIntent: {
            activityId: "word-radar",
            evidenceTier: "clean_recall",
            selectedTargets: [{ target: "machine" }],
          },
          targetSelectorDecision: {
            selectedTargets: ["machine", "pair"],
            traceSummary: "Word Radar selected \"machine\", \"pair\" because recent miss, homework target.",
          },
        }),
        JSON.stringify({
          type: "game_state_update",
          game: "monster-stampede",
          currentWord: "ago",
          wordLength: 5,
          wordIdx: 0,
          itemIndex: 1,
        }),
        JSON.stringify({
          type: "node_complete",
          game: "word-radar",
          accuracy: 0.57,
          evidenceTier: "practice",
          targetResults: [
            {
              target: "wait",
              attemptedValue: "Ellie Ellie, you're there? W a i t",
              correct: true,
            },
          ],
        }),
        JSON.stringify({
          type: "next_plan_unchanged",
          game: "monster-stampede",
          activityId: "monster-stampede",
          reason: "completed node was not a word-driven homework activity",
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "game-summaries", "word-radar.json"),
      JSON.stringify(
        {
          game: "word-radar",
          activityId: "word-radar",
          activityIntent: {
            activityId: "word-radar",
            evidenceTier: "clean_recall",
            masteryEligible: true,
            selectedTargets: [
              {
                target: "machine",
                reasons: ["recent miss", "homework target"],
                evidenceTypes: ["recent_miss", "homework_target"],
              },
            ],
          },
          targetSelectorDecision: {
            selectedTargets: ["machine", "pair"],
            traceSummary:
              "Word Radar selected \"machine\", \"pair\" because recent miss, fragile target, homework target.",
          },
          targetsShown: ["machine", "pair"],
          accuracy: 0.57,
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("target_purpose_missing");
    expect(codes).toContain("word_radar_narration_request_missing");
    expect(codes).toContain("pronunciation_homophone_marked_miss");
    expect(codes).toContain("duplicate_narration_request");
    expect(codes).toContain("stale_current_target");
    expect(codes).toContain("companion_false_mastery_claim");
    expect(codes).toContain("companion_false_boss_unlock_claim");
    expect(codes).toContain("word_radar_contaminated_attempt");
    expect(codes).toContain("adaptation_ignored_word_evidence");
  });

  it("flags opener/game mismatches and synthetic prompt leakage into game state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-opener-mismatch-"));
    fs.writeFileSync(
      path.join(dir, "transcript.md"),
      "First map node: spell-check\nFirst node words: alone, alike\n",
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "node_launched",
          game: "pronunciation",
        }),
        JSON.stringify({
          type: "game_state_update",
          game: "pronunciation",
          lastHeard: "[Session start — homework map mounted]\nFirst map node: spell-check",
        }),
      ].join("\n"),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("opener_game_mismatch");
    expect(codes).toContain("synthetic_prompt_in_game_state");
  });

  it("flags planned path skips and launched target count mismatches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-audit-board-truth-"));
    fs.writeFileSync(path.join(dir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "summary.md"), "", "utf8");
    fs.writeFileSync(path.join(dir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(
      path.join(dir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "node_launched",
          game: "spell-check",
          plannedNodeId: "n-spell-check",
          launchedNodeId: "n-spell-check",
          plannedNodeIndex: 0,
          plannedTargets: ["sign", "know", "write", "thumb", "comb", "gnat"],
          launchedTargets: ["sign", "know", "write"],
        }),
        JSON.stringify({
          type: "node_complete",
          game: "spell-check",
          completedNodeId: "n-spell-check",
          plannedNodeIndex: 0,
          nextNodeId: "n-pronunciation",
          expectedNextNodeId: "n-monster-stampede",
          progressionStatus: "advanced",
        }),
      ].join("\n"),
      "utf8",
    );

    const report = auditSessionDirectory(dir);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("launched_target_count_mismatch");
    expect(codes).toContain("planned_node_skipped");
  });
});
