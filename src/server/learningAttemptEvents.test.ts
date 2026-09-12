import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLearningAttemptEvent, recordLearningAttempt } from "./learningAttemptEvents";
import * as charts from "../profiles/childChart";
import * as facts from "../engine/factBankRecorder";
import * as attempts from "../utils/attempts";
import * as runtime from "../shared/runtimeConfig";
import * as engine from "../engine/learningEngine";
import * as repository from "../engine/learningCycleRepository";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function seedChild(rootDir: string, childId: string): void {
  const base = path.join(rootDir, "src", "context", childId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(
    path.join(base, "child_profile.json"),
    JSON.stringify({
      childId,
      identity: { displayName: "Demo", ttsName: "Demo" },
      chartLinks: {
        learningProfile: "learning_profile.json",
        wordBank: "word_bank.json",
        factBank: "fact_bank.json",
        currentHomework: "homework/current.json",
        currentSessionPlan: "plans/active_session_plan.json",
        currentCarePlan: "care_plan/current.json",
        contentCatalog: "content_catalog.json",
      },
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(base, "learning_profile.json"), JSON.stringify({ childId }), "utf8");
  fs.writeFileSync(path.join(base, "word_bank.json"), JSON.stringify({ childId, version: 1, words: [] }), "utf8");
  fs.writeFileSync(path.join(base, "fact_bank.json"), JSON.stringify({ childId, version: 1, lastUpdated: "", facts: [] }), "utf8");
}

describe("recordLearningAttempt math branch", () => {
  it.each(["spelling", "reading"])("defers frozen spelling claims even when the game declares %s", domain => {
    const legacy = vi.spyOn(engine, "recordAttempt").mockReturnValue(undefined as never);
    const append = vi.spyOn(attempts, "appendAttemptLine").mockImplementation(() => {});
    vi.spyOn(charts, "getChildChart").mockReturnValue({ learningCycle: { domain: "spelling", nodes: [{ nodeId: "practice", evidenceContract: { spellingItems: { "frozen-night": {} } } }] } } as never);
    expect(recordLearningAttempt({ childId: "lab", domain, target: "frozen-night", attemptedValue: "nite", correct: true }).skipped).toBe(true);
    expect(legacy).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled();
  });
  it.each([true, false])("keeps a canonical math instrument's claimed %s out of legacy learning stores", (correct) => {
    vi.spyOn(charts, "getChildChart").mockReturnValue({ learningCycle: { domain: "math", homeworkId: "hw-graph", nodes: [{nodeId: "logbook", evidenceContract: {itemContracts: {"explanation-item": {}}}}] } } as never);
    const recordFact = vi.spyOn(facts, "recordFactAttempt").mockReturnValue({factId: "unused", skipped: false});
    const append = vi.spyOn(attempts, "appendAttemptLine").mockImplementation(() => {});
    const result = recordLearningAttempt({childId: "lab", domain: "math", target: "explanation-item", attemptedValue: "Because I counted", correct});
    expect(result.skipped).toBe(true);
    expect(recordFact).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("uses the server session child instead of a conflicting iframe child", () => {
    expect(normalizeLearningAttemptEvent({childId: "other-child",domain: "math",target: "q",correct: true}, "session-child").childId).toBe("session-child");
  });

  it("recognizes frozen math item ownership despite a claimed reading domain", () => {
    const record=vi.spyOn(engine,"recordAttempt").mockReturnValue(undefined as never);
    vi.spyOn(charts, "getChildChart").mockReturnValue({learningCycle: {domain: "math",nodes: [{nodeId: "logbook",evidenceContract: {itemContracts: {"explanation-item": {}}}}]}} as never);
    const append = vi.spyOn(attempts,"appendAttemptLine").mockImplementation(() => {});
    expect(recordLearningAttempt({childId: "lab",domain: "reading",target: "explanation-item",correct: true}).skipped).toBe(true);
    expect(append).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("does not turn an unknown item in a server-configured math homework session into legacy evidence", () => {
    const record=vi.spyOn(engine,"recordAttempt").mockReturnValue(undefined as never);
    vi.spyOn(attempts,"appendAttemptLine").mockImplementation(() => {});
    vi.spyOn(runtime,"resolveSunnyRuntimeConfig").mockReturnValue({subject: "homework",homeworkDomain: "math",childId: "lab",persistenceMode: "live"} as never);
    vi.spyOn(charts, "getChildChart").mockReturnValue({learningCycle: {domain: "math",nodes: []}} as never);
    expect(recordLearningAttempt({childId: "lab",domain: "reading",target: "unknown-item",correct: true}).skipped).toBe(true);
    expect(record).not.toHaveBeenCalled();
  });

  it("preserves an unrelated legacy math instrument when a math assignment happens to be selected", () => {
    vi.spyOn(runtime,"resolveSunnyRuntimeConfig").mockReturnValue({subject: "clocks",homeworkDomain: null,childId: "lab",persistenceMode: "live"} as never);
    vi.spyOn(charts,"getChildChart").mockReturnValue({learningCycle: {domain: "math",nodes: [{nodeId: "logbook",evidenceContract: {itemContracts: {q: {}}}}]}} as never);
    const fact=vi.spyOn(facts,"recordFactAttempt").mockReturnValue({factId: "5x2",skipped: false});
    vi.spyOn(attempts,"appendAttemptLine").mockImplementation(() => {});
    expect(recordLearningAttempt({childId: "lab",domain: "math",target: "5 x 2",attemptedValue: "10",correct: true}).skipped).toBe(false);
    expect(fact).toHaveBeenCalledTimes(1);
  });

  it("retains canonical ownership when another homework domain is selected", () => {
    vi.spyOn(runtime,"resolveSunnyRuntimeConfig").mockReturnValue({subject: "homework",homeworkDomain: "reading",childId: "lab",persistenceMode: "live"} as never);
    vi.spyOn(charts,"getChildChart").mockReturnValue({learningCycle: {domain: "reading"},homework: {activeByDomain: {math: {homeworkId: "graph"}}}} as never);
    vi.spyOn(repository,"getLearningCycle").mockReturnValue({domain: "math",nodes: [{nodeId: "logbook",evidenceContract: {itemContracts: {q: {}}}}]} as never);
    expect(recordLearningAttempt({childId: "lab",domain: "reading",target: "q",correct: true}).skipped).toBe(true);
  });

  it("blocks legacy HTTP-recorder writes in preview before reading a child chart", () => {
    vi.stubEnv("SUNNY_MODE","as-child");
    const chart=vi.spyOn(charts,"getChildChart").mockImplementation(()=>{throw Error("preview_must_not_access_learning");});
    expect(recordLearningAttempt({childId: "lab",domain: "math",target: "5 x 2",correct: true}).skipped).toBe(true);
    expect(chart).not.toHaveBeenCalled();
  });
  it("accepts the generated-math targetId alias without losing target identity", () => {
    const recorded = normalizeLearningAttemptEvent({
      childId: "reina",
      domain: "math",
      targetId: "item-5x4",
      attemptedValue: "20",
      correct: true,
    });

    expect(recorded.attempt.word).toBe("item-5x4");
    expect(recorded.attempt.attemptedValue).toBe("20");
  });

  it("routes math domain attempts to fact bank instead of word bank", () => {
    vi.spyOn(attempts, "appendAttemptLine").mockImplementation(() => {});
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-attempt-math-"));
    tempDirs.push(rootDir);
    seedChild(rootDir, "demo-pashley");

    const recorded = recordLearningAttempt(
      {
        childId: "demo-pashley",
        attemptId: `test-math-attempt-${Date.now()}`,
        target: "5 x 2",
        domain: "math",
        correct: true,
        quality: 5,
        attemptedValue: "10",
      },
      undefined,
      { rootDir },
    );

    expect(recorded.skipped).toBe(false);
    const bank = JSON.parse(
      fs.readFileSync(path.join(rootDir, "src", "context", "demo-pashley", "fact_bank.json"), "utf8"),
    );
    expect(bank.facts.some((fact: { prompt: string }) => fact.prompt === "5 x 2")).toBe(true);
  });
});
