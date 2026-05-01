import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectErrorPatterns,
  readAttemptLogRecords,
  scanChildErrorPatterns,
} from "./patternDetector";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-patterns-"));
  tempRoots.push(root);
  return root;
}

function writeNdjson(root: string, childId: string, date: string, rows: unknown[]) {
  const dir = path.join(root, "src", "context", childId, "attempts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${date}.ndjson`),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf-8",
  );
}

describe("pattern detector", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads old and new NDJSON records without crashing", () => {
    const root = makeTempRoot();
    writeNdjson(root, "ila", "2026-04-27", [
      { word: "legacy", correct: false, timestamp: "2026-04-27T12:00:00.000Z" },
      {
        word: "blister",
        attemptedValue: "blster",
        correct: false,
        domain: "spelling",
        timestamp: "2026-04-27T12:01:00.000Z",
        sessionId: "s1",
      },
    ]);

    const rows = readAttemptLogRecords("ila", { rootDir: root });
    expect(rows).toHaveLength(2);
    expect(rows[0].attemptedValue).toBeUndefined();
    expect(rows[1].attemptedValue).toBe("blster");
  });

  it("confirms a pattern only after 3+ occurrences across 2+ sessions", () => {
    const patterns = detectErrorPatterns([
      row("s1", "2026-04-27T10:00:00.000Z", "blister", "blster"),
      row("s2", "2026-04-28T10:00:00.000Z", "cluster", "clster"),
      row("s3", "2026-04-29T10:00:00.000Z", "monster", "mnster"),
    ]);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      errorType: "spelling:vowel_omission",
      frequency: 3,
      sessionCount: 3,
      domain: "spelling",
    });
    expect(patterns[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("filters one bad day even with repeated same-session errors", () => {
    const patterns = detectErrorPatterns([
      row("same-day", "2026-04-29T10:00:00.000Z", "blister", "blster"),
      row("same-day", "2026-04-29T10:01:00.000Z", "cluster", "clster"),
      row("same-day", "2026-04-29T10:02:00.000Z", "monster", "mnster"),
    ]);

    expect(patterns).toEqual([]);
  });

  it("skips records that do not have attemptedValue", () => {
    const patterns = detectErrorPatterns([
      {
        word: "blister",
        correct: false,
        domain: "spelling",
        timestamp: "2026-04-29T10:00:00.000Z",
        sessionId: "s1",
      },
    ]);

    expect(patterns).toEqual([]);
  });

  it("scans child files and returns Sonnet-safe error signals", () => {
    const root = makeTempRoot();
    writeNdjson(root, "ila", "2026-04-27", [
      row("s1", "2026-04-27T10:00:00.000Z", "blister", "blster"),
    ]);
    writeNdjson(root, "ila", "2026-04-28", [
      row("s2", "2026-04-28T10:00:00.000Z", "cluster", "clster"),
      row("s3", "2026-04-29T10:00:00.000Z", "monster", "mnster"),
    ]);

    const result = scanChildErrorPatterns("ila", { rootDir: root });
    expect(result.patterns[0]).toMatchObject({
      errorType: "spelling:vowel_omission",
      exampleTargets: ["blister", "cluster", "monster"],
      positions: [2, 1],
    });
    expect(result.skippedMissingAttemptedValue).toBe(0);
  });
});

function row(
  sessionId: string,
  timestamp: string,
  word: string,
  attemptedValue: string,
) {
  return {
    word,
    attemptedValue,
    correct: false,
    domain: "spelling",
    timestamp,
    sessionId,
  };
}
