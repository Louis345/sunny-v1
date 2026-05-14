import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  SessionDebugRecorder,
  buildSessionLogFolderName,
  finalizeSessionDebugPacket,
} from "../server/session-debug-recorder";

describe("SessionDebugRecorder", () => {
  it("writes an AI-ready session packet with structured events and summary", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-session-logs-"));
    const startedAt = new Date("2026-05-04T15:32:10.000Z");
    const recorder = new SessionDebugRecorder({
      rootDir: root,
      sessionId: "a8f31c",
      childName: "Ila",
      subject: "reading",
      mode: "diag",
      startedAt,
      command: "npm run sunny:mode:diag:reading",
      gitCommit: "abc123",
      envFlags: { TTS_ENABLED: "true", ADVENTURE_MAP: "true" },
    });

    recorder.recordEvent("session", "start", { turnState: "IDLE" });
    recorder.recordTranscript("user", "I read the first word.");
    recorder.recordTranscript("assistant", "Nice work.");
    recorder.recordError("Deepgram failed once", "Error: websocket closed");
    recorder.finalize({
      endedAt: new Date("2026-05-04T15:34:10.000Z"),
      result: "completed",
      finalState: {
        turnState: "IDLE",
        activeGame: null,
        pendingTranscript: false,
      },
      artifacts: {
        sessionNotesWritten: true,
        attemptsRecorded: 2,
      },
    });

    const folder = recorder.sessionDir;
    expect(folder).toContain(
      path.join(
        "2026",
        "05",
        "2026-05-04T15-32-10_ila_reading_a8f31c",
      ),
    );
    expect(fs.existsSync(path.join(folder, "summary.md"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "events.ndjson"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "transcript.md"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "errors.log"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "final-state.json"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "artifacts.json"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "upload-status.json"))).toBe(true);

    const summary = fs.readFileSync(path.join(folder, "summary.md"), "utf8");
    expect(summary).toContain("sessionId: a8f31c");
    expect(summary).toContain("child: Ila");
    expect(summary).toContain("subject: reading");
    expect(summary).toContain("result: completed");
    expect(summary).toContain("Deepgram failed once");
    expect(summary).toContain("Session saved locally. Upload not configured yet.");

    const events = fs
      .readFileSync(path.join(folder, "events.ndjson"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({
      sessionId: "a8f31c",
      child: "Ila",
      component: "session",
      action: "start",
      turnState: "IDLE",
    });

    const transcript = fs.readFileSync(
      path.join(folder, "transcript.md"),
      "utf8",
    );
    expect(transcript).toContain("**user:** I read the first word.");
    expect(transcript).toContain("**assistant:** Nice work.");
  });

  it("normalizes session folder names for safe git storage", () => {
    expect(
      buildSessionLogFolderName({
        startedAt: new Date("2026-05-04T15:32:10.000Z"),
        childName: "Ila",
        subject: "reading / homework",
        sessionId: "a8f31c-bbbb",
      }),
    ).toBe("2026-05-04T15-32-10_ila_reading-homework_a8f31c");
  });

  it("does not write a session packet when debug recording is disabled for preview", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-session-logs-disabled-"));
    const recorder = new SessionDebugRecorder({
      rootDir: root,
      sessionId: "preview-1",
      childName: "Reina",
      subject: "homework",
      mode: "as-child",
      enabled: false,
    });
    recorder.recordEvent("session", "start", { turnState: "IDLE" });
    recorder.recordTranscript("assistant", "Preview only.");
    recorder.recordError("Preview error that should not be written");
    recorder.finalize({
      result: "completed",
      finalState: { turnState: "IDLE" },
      artifacts: { preview: true },
    });

    expect(recorder.sessionDir).toBe("");
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("finalizeSessionDebugPacket skips packet save logging when recorder is disabled", () => {
    const recorder = new SessionDebugRecorder({
      sessionId: "preview-2",
      childName: "Reina",
      subject: "homework",
      mode: "as-child",
      enabled: false,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const session = {
      debugPacketFinalized: false,
      debugRecorder: recorder,
      turnSM: { getState: () => "IDLE" },
      roundNumber: 0,
      isEnding: false,
      childName: "Reina",
      sessionId: "preview-2",
      currentCanvasState: null,
      pendingGameStart: null,
      wbActive: false,
      wbRound: 0,
      spellCheckSessionActive: false,
      activeSpellCheckWord: "",
      conversationHistory: [],
      rewardEngine: { getRewardLog: () => [] },
    };

    finalizeSessionDebugPacket(session, "completed", { preview: true });

    expect(session.debugPacketFinalized).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      "  🎮 [debug] [preview-skip] session packet not written",
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("session packet saved"),
    );
    logSpy.mockRestore();
  });

  it("enqueues upload with seven-day local retention, not immediate deletion", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "session-debug-recorder.ts"),
      "utf8",
    );

    expect(source).not.toContain('"--delete-local"');
    expect(source).toContain('"--delete-local-after-days=7"');
  });
});
