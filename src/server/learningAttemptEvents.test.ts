import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readWordBank } from "../utils/wordBankIO";
import { recordLearningAttempt } from "./learningAttemptEvents";

describe("learning attempt event persistence", () => {
  const childId = "attemptcontract";
  const ctxDir = path.join(process.cwd(), "src", "context", childId);

  afterEach(() => {
    fs.rmSync(ctxDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("records one normalized attempt into SM-2 and the NDJSON diagnostics log", () => {
    const out = recordLearningAttempt({
      childId,
      domain: "spelling",
      target: "Blister",
      attemptedValue: "blster",
      correct: false,
      quality: 1,
      scaffoldLevel: 0,
      sessionId: "session-1",
    });

    expect(out.attempt.word).toBe("blister");
    const bank = readWordBank(childId);
    const word = bank.words.find((w) => w.word === "blister");
    expect(word?.tracks.spelling?.history).toHaveLength(1);
    expect(word?.tracks.spelling?.history[0]?.attemptedValue).toBe("blster");

    const attemptsDir = path.join(ctxDir, "attempts");
    const file = fs.readdirSync(attemptsDir)[0];
    const line = fs.readFileSync(path.join(attemptsDir, file), "utf-8").trim();
    expect(JSON.parse(line)).toMatchObject({
      word: "blister",
      domain: "spelling",
      correct: false,
      attemptedValue: "blster",
      sessionId: "session-1",
    });
  });

  it("does not double-record the same browser attempt event id", () => {
    const event = {
      attemptId: "attempt-1",
      childId,
      domain: "spelling",
      target: "Cluster",
      attemptedValue: "clster",
      correct: false,
      quality: 1,
      scaffoldLevel: 0,
      sessionId: "session-1",
    };

    const first = recordLearningAttempt(event);
    const second = recordLearningAttempt(event);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    const attemptsDir = path.join(ctxDir, "attempts");
    const file = fs.readdirSync(attemptsDir)[0];
    const lines = fs
      .readFileSync(path.join(attemptsDir, file), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
  });
});
