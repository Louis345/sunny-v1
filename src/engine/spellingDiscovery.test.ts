import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle, buildSpellingDiscoveryPlan } from "./learningCycleIngest";
import { publishDiscoveryExperience, buildDiscoveryEvidenceSummary, completeDiscoveryEvaluation } from "./adaptiveMathDiscovery";
import { recordSpellingDiscoveryAttempt, scoreSpellingRecall } from "./learningCycleRuntime";
import { getLearningCycle } from "./learningCycleRepository";

describe("authoritative spelling recall contracts", () => {
  const input = {
    homeworkId: "assignment-one",
    words: ["night", "light", "can't"],
    evidenceIds: ["assignment:source-one"],
    measurementRole: "fresh_checkpoint" as const,
  };

  it("offers every assigned word with stable identities and a frozen source link", () => {
    const items = buildSpellingRecallItems(input);
    expect(items.map(item => item.word)).toEqual(input.words);
    expect(new Set(items.map(item => item.id)).size).toBe(3);
    expect(buildSpellingRecallItems(input)).toEqual(items);
    expect(items.every(item => item.domain === "spelling"
      && item.lineage.sourceEvidenceIds[0] === input.evidenceIds[0]
      && item.response.mode === "spelling_letters")).toBe(true);
    expect(buildSpellingRecallItems({ ...input, homeworkId: "another-assignment" })[0].id).not.toBe(items[0].id);
  });

  it("rejects empty or duplicate assignment targets instead of inventing coverage", () => {
    expect(() => buildSpellingRecallItems({ ...input, words: [] })).toThrow("spelling_targets_missing");
    expect(() => buildSpellingRecallItems({ ...input, words: ["night", "NIGHT"] })).toThrow("spelling_target_duplicate");
    expect(() => buildSpellingRecallItems({ ...input, evidenceIds: [] })).toThrow("spelling_source_evidence_missing");
  });

  it("scores captured letters from the frozen contract, preserving spelling distinctions", () => {
    const items = buildSpellingRecallItems(input);
    expect(scoreSpellingRecall(items[0], " NIGHT ")).toEqual({ correct: true, score: 1 });
    expect(scoreSpellingRecall(items[0], "nite")).toEqual({ correct: false, score: 0 });
    expect(scoreSpellingRecall(items[2], "cant")).toEqual({ correct: false, score: 0 });
    expect(scoreSpellingRecall(items[2], "can't")).toEqual({ correct: true, score: 1 });
  });

  it("does not grade missing capture or Not sure as a spelling error", () => {
    const item = buildSpellingRecallItems(input)[0];
    expect(scoreSpellingRecall(item, "")).toEqual({ observedErrorType: "response_not_captured" });
    expect(scoreSpellingRecall(item, "", { skipped: true })).toEqual({ observedErrorType: "not_sure" });
    expect(scoreSpellingRecall(undefined, "night")).toEqual({ observedErrorType: "answer_contract_missing" });
  });

  it("treats a spoken homophone spelling as instrument ambiguity, not a conceptual miss", () => {
    const [item] = buildSpellingRecallItems({
      ...input,
      words: ["know"],
    });
    expect(scoreSpellingRecall(item, "no")).toEqual({
      observedErrorType: "instrument_ambiguous",
    });
  });

  it("keeps apostrophe-different homophones instrument-ambiguous", () => {
    const [item] = buildSpellingRecallItems({
      ...input,
      words: ["we'll"],
    });
    expect(scoreSpellingRecall(item, "wheel")).toEqual({
      observedErrorType: "instrument_ambiguous",
    });
  });

  it("uses the pronunciation lexicon beyond a hand-written homophone list", () => {
    const [item] = buildSpellingRecallItems({ ...input, words: ["sea"] });
    expect(scoreSpellingRecall(item, "see")).toEqual({
      observedErrorType: "instrument_ambiguous",
    });
    expect(scoreSpellingRecall(buildSpellingRecallItems(input)[0], "nite")).toEqual({
      correct: false,
      score: 0,
    });
  });

  it("does not treat informal CMU spellings or letter shortcuts as valid homophones", () => {
    const cases: Array<[string, string]> = [
      ["through", "thru"],
      ["cool", "kool"],
      ["you", "u"],
      ["are", "r"],
      ["night", "nite"],
    ];
    for (const [target, response] of cases) {
      const [item] = buildSpellingRecallItems({ ...input, words: [target] });
      expect(scoreSpellingRecall(item, response)).toEqual({
        correct: false,
        score: 0,
      });
    }
  });

  it("retains prior teaching exposure on a later fresh response opportunity", () => {
    const items = buildSpellingRecallItems({ ...input, exposure: "practiced" as const, occasionId: "exit" });
    expect(items.every(item => item.lineage.exposure === "practiced")).toBe(true);
    expect(items[0].id).not.toBe(buildSpellingRecallItems(input)[0].id);
    expect(items[0].wordId).toBe(buildSpellingRecallItems(input)[0].wordId);
  });
});

describe("canonical spelling Discovery evidence", () => {
  function fixture() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-discovery-"));
    const items = buildSpellingRecallItems({ homeworkId: "hw-spelling", words: ["night", "light"], evidenceIds: ["source:one"], measurementRole: "fresh_checkpoint" });
    const cycle = createSpellingDiscoveryCycle({ childId: "lab-child", homeworkId: "hw-spelling", title: "School words", contentFingerprint: "fingerprint", items }, { rootDir });
    return { rootDir, items, cycle };
  }

  it("creates only an evaluation contract, not a speculative teaching plan", () => {
    const { rootDir, cycle } = fixture();
    try {
      expect(cycle.lifecycle).toBe("evaluation_ready");
      expect(cycle.domain).toBe("spelling");
      expect(cycle.nodes.map(node => node.role)).toEqual(["evaluation"]);
      expect(cycle.academicPredictions).toEqual([]);
      expect(Object.keys(cycle.nodes[0].evidenceContract.spellingItems ?? {})).toHaveLength(2);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("publishes native Discovery through the same assignment projection and preserves other domains", () => {
    const { rootDir, items, cycle } = fixture();
    try {
      const child = path.join(rootDir, "src/context/lab-child");
      const homeworkFile = path.join(child, "homework/current.json");
      fs.mkdirSync(path.dirname(homeworkFile), { recursive: true });
      fs.writeFileSync(homeworkFile, JSON.stringify({ activeByDomain: { math: { homeworkId: "preserved-math" } } }));
      const plan = buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } });
      expect(plan.nodePlan.map(node => node.activityId)).toEqual(["word-radar"]);
      expect(plan.nodePlan[0].targets).toEqual(["night", "light"]);
      expect(plan.companionPolicy.openingLinePolicy).toBe("silent");
      const input = { rootDir, childId: cycle.childId, homeworkId: cycle.homeworkId, spellingItems: items, activeSessionPlan: plan, assignment: cycle.assignment };
      publishDiscoveryExperience(input);
      const projected = JSON.parse(fs.readFileSync(homeworkFile, "utf8"));
      expect(projected.selectedDomain).toBe("spelling");
      expect(projected.activeByDomain.math.homeworkId).toBe("preserved-math");
      expect(projected.current.wordList).toEqual(["night", "light"]);
      expect(projected.current.nodes).toHaveLength(1);
      publishDiscoveryExperience(input);
      expect(getLearningCycle(cycle.childId, cycle.homeworkId, { rootDir })!.observations).toEqual([]);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("includes untested words in the factual summary and does not call an early exit complete", () => {
    const { rootDir, cycle, items } = fixture();
    try {
      recordSpellingDiscoveryAttempt({ childId: cycle.childId, homeworkId: cycle.homeworkId, attempt: { attemptId: "a1", itemId: items[0].id, attemptedValue: "night", observedAt: "2026-09-08T12:00:00Z" } }, { rootDir });
      const current = getLearningCycle(cycle.childId, cycle.homeworkId, { rootDir })!;
      const summary = buildDiscoveryEvidenceSummary(current);
      expect(summary.constructs.map(row => row.constructId)).toContain(items[1].constructId);
      expect(summary.coverage).toEqual({ assigned: 2, attempted: 1, untestedItemIds: [items[1].id], complete: false });
      expect(() => completeDiscoveryEvaluation({ rootDir, childId: cycle.childId, homeworkId: cycle.homeworkId, completedAt: "2026-09-08T12:05:00Z" })).toThrow("spelling_discovery_coverage_incomplete");
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("maps ten assigned words to six independent successes and four independent misses for the Planner", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-target-summary-"));
    const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
    const missed = words.slice(6);
    try {
      const items = buildSpellingRecallItems({
        homeworkId: "hw-ten",
        words,
        evidenceIds: ["source:ten"],
        measurementRole: "fresh_checkpoint",
      });
      createSpellingDiscoveryCycle({
        childId: "lab-child",
        homeworkId: "hw-ten",
        title: "Ten school words",
        contentFingerprint: "fingerprint-ten",
        items,
      }, { rootDir });
      items.forEach((item, index) => {
        recordSpellingDiscoveryAttempt({
          childId: "lab-child",
          homeworkId: "hw-ten",
          attempt: {
            attemptId: `attempt-${index + 1}`,
            itemId: item.id,
            attemptedValue: index < 6 ? item.word : `${item.word}x`,
            observedAt: `2026-09-12T12:${String(index).padStart(2, "0")}:00Z`,
          },
          support: { status: "unassisted", scaffolds: [] },
        }, { rootDir });
      });

      const summary = buildDiscoveryEvidenceSummary(getLearningCycle("lab-child", "hw-ten", { rootDir })!);
      expect(summary.spellingTargets?.filter((target) => target.independentCorrect === 1).map((target) => target.word))
        .toEqual(words.slice(0, 6));
      expect(summary.spellingTargets?.filter((target) => target.independentIncorrect === 1).map((target) => target.word))
        .toEqual(missed);
      expect(summary.spellingTargets?.every((target) => target.observationIds.length === 1)).toBe(true);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("resolves correctness and identity on the server and keeps retransmissions idempotent", () => {
    const { rootDir, items } = fixture();
    try {
      const input = { childId: "lab-child", homeworkId: "hw-spelling", attempt: { attemptId: "attempt-1", itemId: items[0].id, attemptedValue: "night", observedAt: "2026-09-08T12:00:00Z" }, support: { status: "unassisted" as const, scaffolds: [] } };
      const first = recordSpellingDiscoveryAttempt(input, { rootDir });
      expect(first.observations[0]).toMatchObject({ itemId: items[0].id, result: { correct: true }, assistance: { status: "unassisted" }, provenance: "independent_probe" });
      expect(recordSpellingDiscoveryAttempt(input, { rootDir })).toEqual(first);
      expect(() => recordSpellingDiscoveryAttempt({ ...input, attempt: { ...input.attempt, attemptedValue: "nite" } }, { rootDir })).toThrow("spelling_attempt_identity_conflict");
      expect(() => recordSpellingDiscoveryAttempt({ ...input, attempt: { ...input.attempt, attemptId: "unknown", itemId: "invented" } }, { rootDir })).toThrow("spelling_item_not_in_contract");
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("keeps a homophone response out of independent spelling evidence", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-homophone-"));
    try {
      const items = buildSpellingRecallItems({
        homeworkId: "hw-homophone",
        words: ["know"],
        evidenceIds: ["source:one"],
        measurementRole: "fresh_checkpoint",
      });
      createSpellingDiscoveryCycle({
        childId: "lab-child",
        homeworkId: "hw-homophone",
        title: "School words",
        contentFingerprint: "fingerprint",
        items,
      }, { rootDir });
      const cycle = recordSpellingDiscoveryAttempt({
        childId: "lab-child",
        homeworkId: "hw-homophone",
        attempt: {
          attemptId: "attempt-homophone",
          itemId: items[0].id,
          attemptedValue: "no",
          observedAt: "2026-09-10T12:00:00Z",
        },
        support: { status: "unassisted", scaffolds: [] },
      }, { rootDir });
      expect(cycle.observations[0]).toMatchObject({
        result: { observedErrorType: "instrument_ambiguous" },
        provenance: "practice",
      });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps help, unknown assistance, repeats, and Not sure out of independent evidence", () => {
    const { rootDir, items } = fixture();
    try {
      const input = { childId: "lab-child", homeworkId: "hw-spelling", attempt: { attemptId: "first", itemId: items[0].id, attemptedValue: "night", observedAt: "2026-09-08T12:00:00Z" } };
      recordSpellingDiscoveryAttempt(input, { rootDir });
      recordSpellingDiscoveryAttempt({ ...input, attempt: { ...input.attempt, attemptId: "repeat" }, support: { status: "unassisted", scaffolds: [] } }, { rootDir });
      recordSpellingDiscoveryAttempt({ ...input, attempt: { ...input.attempt, attemptId: "skip", itemId: items[1].id, attemptedValue: "", skipped: true }, support: { status: "assisted", scaffolds: ["support:letters"] } }, { rootDir });
      const observed = getLearningCycle("lab-child", "hw-spelling", { rootDir })!.observations;
      expect(observed.map(row => row.provenance)).toEqual(["practice", "practice", "practice"]);
      expect(observed[0].assistance.status).toBe("unknown");
      expect(observed[1].exposure).toBe("previously_practiced");
      expect(observed[2].result).toEqual({ observedErrorType: "not_sure" });
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
});
