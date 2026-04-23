/**
 * Phase 2 tests: ingestHomework surgery
 * These must be RED before refactoring, GREEN after.
 */
import { describe, test, expect } from "vitest";
import * as ingestModule from "../scripts/ingestHomework";
import { buildPendingHomeworkPayload, buildCycleStub } from "../scripts/ingestHomework";

describe("ingestHomework Phase 2: buildPsychologistHomeworkPlanUserMessage removed", () => {
  test("buildPsychologistHomeworkPlanUserMessage is NOT exported (Psychologist owns planning)", () => {
    expect("buildPsychologistHomeworkPlanUserMessage" in ingestModule).toBe(false);
  });
});

describe("ingestHomework Phase 2: buildPendingHomeworkPayload includes homeworkId", () => {
  test("buildPendingHomeworkPayload stores homeworkId from cycle", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: null,
      wordList: ["cat", "dog"],
      homeworkId: "hw-spelling_test-abc12345",
      nodes: [],
    });
    expect((pending as { homeworkId?: string }).homeworkId).toBe("hw-spelling_test-abc12345");
  });
});

describe("ingestHomework Phase 2: buildCycleStub creates HomeworkCycle", () => {
  test("buildCycleStub returns a valid HomeworkCycle skeleton", () => {
    const stub = buildCycleStub({
      homeworkId: "hw-spelling_test-abc12345",
      subject: "spelling_test",
      wordList: ["cat", "dog"],
      ingestedAt: "2026-04-21",
      testDate: "2026-04-25",
    });
    expect(stub.homeworkId).toBe("hw-spelling_test-abc12345");
    expect(stub.subject).toBe("spelling_test");
    expect(stub.wordList).toEqual(["cat", "dog"]);
    expect(stub.assumptions).toBeNull();
    expect(stub.scanResult).toBeNull();
    expect(stub.delta).toBeNull();
    expect(stub.metrics).toBeNull();
  });
});
