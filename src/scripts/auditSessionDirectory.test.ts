import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { auditSessionDirectory, renderAuditMarkdown } from "./auditSessionDirectory";

describe("auditSessionDirectory", () => {
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
});
