import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyWordBank } from "../context/schemas/wordBank";
import {
  assertChildAllowedForContextRoot,
  resolveChildContextDir,
  resolveContextRoot,
} from "../utils/contextRoot";
import { appendAttemptLine } from "../utils/attempts";
import { initializeLearningProfile, readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { appendNodeRating } from "../utils/nodeRatingIO";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";

describe("context root sandboxing", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-context-root-"));
    roots.push(root);
    return root;
  }

  it("defaults to the repo src/context directory", () => {
    expect(resolveContextRoot()).toBe(path.resolve(process.cwd(), "src", "context"));
  });

  it("resolves child directories through SUNNY_CONTEXT_ROOT", () => {
    const root = tempRoot();
    const contextRoot = path.join(root, ".sunny-sandbox", "context");
    vi.stubEnv("SUNNY_CONTEXT_ROOT", contextRoot);

    expect(resolveContextRoot()).toBe(contextRoot);
    expect(resolveChildContextDir("demo_adaptive")).toBe(path.join(contextRoot, "demo_adaptive"));
  });

  it("routes profile, word-bank, attempts, and rating IO through the sandbox context root", async () => {
    const root = tempRoot();
    const contextRoot = path.join(root, ".sunny-sandbox", "context");
    vi.stubEnv("SUNNY_CONTEXT_ROOT", contextRoot);
    vi.stubEnv("SUNNY_MODE", "real");
    vi.stubEnv("SUNNY_PREVIEW_MODE", "");

    const profile = initializeLearningProfile({
      childId: "demo_adaptive",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: ["spelling"],
    });
    writeLearningProfile("demo_adaptive", profile);
    writeWordBank("demo_adaptive", createEmptyWordBank("demo_adaptive"));
    appendAttemptLine("demo_adaptive", { word: "above", correct: true, domain: "spelling" });
    await appendNodeRating({
      childId: "demo_adaptive",
      nodeType: "word-radar",
      word: "above",
      rating: "like",
      theme: "practice",
      sessionDate: "2026-05-15T12:00:00.000Z",
      completionTime_ms: 12_000,
      accuracy: 1,
      abandonedEarly: false,
    });

    expect(readLearningProfile("demo_adaptive")?.childId).toBe("demo_adaptive");
    expect(readWordBank("demo_adaptive").childId).toBe("demo_adaptive");
    expect(fs.existsSync(path.join(contextRoot, "demo_adaptive", "learning_profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(contextRoot, "demo_adaptive", "word_bank.json"))).toBe(true);
    expect(fs.readdirSync(path.join(contextRoot, "demo_adaptive", "attempts"))[0]).toMatch(/\.ndjson$/);
    expect(fs.readdirSync(path.join(contextRoot, "demo_adaptive", "ratings"))).toContain("2026-05-15.ndjson");
  });

  it("blocks protected real children when SUNNY_CONTEXT_ROOT is set without override", () => {
    const root = tempRoot();
    vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(root, ".sunny-sandbox", "context"));

    expect(() => assertChildAllowedForContextRoot("ila")).toThrow(/protected_child_context_root/);
    expect(() => assertChildAllowedForContextRoot("reina")).toThrow(/protected_child_context_root/);

    vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
    expect(() => assertChildAllowedForContextRoot("ila")).not.toThrow();
  });
});
