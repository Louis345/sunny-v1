import { afterAll, beforeAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeLearningProfile } from "../../utils/learningProfileIO";
import { createEmptyWordBank } from "../../context/schemas/wordBank";

/** For suites that intentionally use the checked-in child configuration.
 * All learning records are invented and live outside the checkout. Do not use
 * this in suites that already pass their own per-test rootDir overrides. */
export function useSyntheticProfileContext(): void {
  let root: string;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-profile-fixtures-"));
    for (const childId of ["ila", "reina", "creator", "qa_map"]) {
      const directory = path.join(root, childId);
      fs.mkdirSync(directory);
      const profile = initializeLearningProfile({ childId, age: 8, grade: 3, diagnoses: [], learningGoals: [] });
      profile.companion = { ...profile.companion, idleFrequency_ms: 45_000 };
      fs.writeFileSync(path.join(directory, "learning_profile.json"), JSON.stringify(profile));
      fs.writeFileSync(path.join(directory, "word_bank.json"), JSON.stringify(createEmptyWordBank(childId)));
      fs.writeFileSync(path.join(directory, `${childId}_context.md`), "Fictional learner context for profile tests.");
    }
    vi.stubEnv("SUNNY_CONTEXT_ROOT", root);
    vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });
}
