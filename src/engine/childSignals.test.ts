import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildActivityTraitSignalSummary,
  readChildSignals,
  recordChildSignal,
} from "./childSignals";

let root: string;

describe("child signals", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-child-signals-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("records bounded child-scoped micro-probe signals as append-only NDJSON", () => {
    const result = recordChildSignal({
      childId: "Reina",
      activityId: "pronunciation",
      domain: "spelling",
      signalType: "stated_preference",
      dimension: "voice",
      valence: "positive",
      confidence: 0.72,
      evidenceText: "child said: 'I like saying them fast'",
      source: "companion_micro_probe",
      sessionId: "session-1",
      nodeId: "n-pronunciation",
      choiceSetId: "choice-1",
      createdAt: "2026-05-12T20:00:00.000Z",
    }, { rootDir: root });

    expect(result.persisted).toBe(true);
    expect(result.record).toMatchObject({
      type: "child_signal",
      version: 1,
      childId: "reina",
      activityId: "pronunciation",
      dimension: "voice",
      source: "companion_micro_probe",
    });
    const rows = readChildSignals("reina", { rootDir: root });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.childSignalId).toMatch(/^child_signal_/);
  });

  it("rejects invalid dimensions and out-of-range confidence instead of writing vague memory", () => {
    expect(() =>
      recordChildSignal({
        childId: "reina",
        activityId: "monster-stampede",
        domain: "spelling",
        signalType: "engagement",
        dimension: "chaos" as never,
        valence: "positive",
        confidence: 0.8,
        evidenceText: "child smiled",
        source: "observed_behavior",
      }, { rootDir: root }),
    ).toThrow(/invalid_dimension/);

    expect(() =>
      recordChildSignal({
        childId: "reina",
        activityId: "monster-stampede",
        domain: "spelling",
        signalType: "engagement",
        dimension: "speed",
        valence: "positive",
        confidence: 1.4,
        evidenceText: "child smiled",
        source: "observed_behavior",
      }, { rootDir: root }),
    ).toThrow(/invalid_confidence/);
  });

  it("supports preview logging without persistence", () => {
    const result = recordChildSignal({
      childId: "ila",
      activityId: "word-radar",
      domain: "reading",
      signalType: "avoidance",
      dimension: "typing",
      valence: "negative",
      confidence: 0.6,
      evidenceText: "child asked to switch activities",
      source: "observed_behavior",
      createdAt: "2026-05-12T20:05:00.000Z",
    }, { rootDir: root, skipPersistence: true });

    expect(result.persisted).toBe(false);
    expect(readChildSignals("ila", { rootDir: root })).toEqual([]);
  });

  it("accepts urgent learning signals for help, autonomy, and reading struggle", () => {
    const result = recordChildSignal({
      childId: "ila",
      activityId: "pronunciation",
      domain: "reading",
      signalType: "help_needed",
      dimension: "help",
      valence: "negative",
      confidence: 0.9,
      evidenceText: "child asked Elli for help while stuck on able",
      source: "observed_behavior",
      createdAt: "2026-05-13T21:03:46.000Z",
    }, { rootDir: root });

    expect(result.record).toMatchObject({
      signalType: "help_needed",
      dimension: "help",
    });

    expect(() =>
      recordChildSignal({
        childId: "ila",
        activityId: "pronunciation",
        domain: "reading",
        signalType: "reading_struggle",
        dimension: "reading",
        valence: "negative",
        confidence: 0.85,
        evidenceText: "parent observed visible reading frustration",
        source: "parent_comment",
      }, { rootDir: root }),
    ).not.toThrow();
  });

  it("summarizes stated preference as weaker than observed behavior for trait learning", () => {
    recordChildSignal({
      childId: "reina",
      activityId: "pronunciation",
      domain: "spelling",
      signalType: "stated_preference",
      dimension: "voice",
      valence: "positive",
      confidence: 0.8,
      evidenceText: "child said she likes saying words out loud",
      source: "companion_micro_probe",
      createdAt: "2026-05-12T20:00:00.000Z",
    }, { rootDir: root });
    recordChildSignal({
      childId: "reina",
      activityId: "pronunciation",
      domain: "spelling",
      signalType: "engagement",
      dimension: "voice",
      valence: "positive",
      confidence: 0.8,
      evidenceText: "child replayed pronunciation twice",
      source: "observed_behavior",
      createdAt: "2026-05-12T20:01:00.000Z",
    }, { rootDir: root });

    const summary = buildActivityTraitSignalSummary("reina", { rootDir: root });
    expect(summary.preferredDimensions[0]).toContain("voice");
    expect(summary.byDimension.voice.positiveWeight).toBeGreaterThan(1);
    expect(summary.byActivity.pronunciation.preferredDimensions).toContain("voice");
  });
});
