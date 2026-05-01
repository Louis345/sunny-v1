import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendAttemptLine } from "./attempts";

const tempRoots: string[] = [];

vi.mock("./runtimeMode", () => ({
  shouldPersistSessionData: () => true,
  shouldLoadPersistedHistory: () => true,
}));

describe("attempt NDJSON schema", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes attemptedValue and errorSignal while preserving old fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-attempts-"));
    tempRoots.push(root);
    vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(root, "src", "context"));

    appendAttemptLine("Ila", {
      word: "blister",
      attemptedValue: "blster",
      correct: false,
      domain: "spelling",
      sessionId: "session-1",
      errorSignal: {
        errorType: "spelling:vowel_omission",
        positions: [2],
        domain: "spelling",
      },
    });

    const attemptsDir = path.join(root, "src", "context", "ila", "attempts");
    const file = fs.readdirSync(attemptsDir)[0];
    const line = fs.readFileSync(path.join(attemptsDir, file), "utf-8").trim();
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      word: "blister",
      attemptedValue: "blster",
      correct: false,
      domain: "spelling",
      sessionId: "session-1",
      errorSignal: {
        errorType: "spelling:vowel_omission",
        positions: [2],
        domain: "spelling",
      },
    });
    expect(typeof parsed.timestamp).toBe("string");
  });
});
