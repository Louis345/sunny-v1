import { describe, expect, it } from "vitest";
import { ilaLikeIntrospectionCycle } from "../scripts/fixtures/ilaLikeIntrospectionCycle";
import { experimentLedgerSection, scorePlannerCalls } from "./plannerIntrospection";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import { parseCanonicalProgressionDecision } from "./learningCycleRuntime";
import type { LearningCycleRecordV2 } from "./learningCycleRepository";

// Owner 2026-11-24 (design v4, reviewed by Fable): the tutor runs its own experiments toward her goal and reality
// grades them, not the tutor. Rounding was 5/6 with the hill picture and 2/6 without; the tutor's self-review and
// read-back graded its own theories, and a bet was scored by whatever answer came next, even on a later board after a
// different experiment. The owner caught it by asking "it can't grade its own experiment, isn't that a big issue?";
// no log was wrong (each score was computed as written); the lab never asked which board a bet belonged to.

/** Ila-like spelling cycle with bets on decisions 1 (board 3: import, dormant, pardon) and 2 (board 4: import, pardon, ornament). */
function bettingCycle(): LearningCycleRecordV2 {
  const cycle = ilaLikeIntrospectionCycle();
  const [first, second] = cycle.decisionHistory;
  Object.assign(first, {
    expectations: [{ itemId: "w-import", onHerOwn: false }, { itemId: "w-ornament", onHerOwn: true }, { itemId: "w-charge", onHerOwn: true }],
    experiment: { trying: "A picture of lips closing for the m in import.", why: "She writes n for m.", conclusionOnLast: "First experiment." },
  });
  Object.assign(second, {
    expectations: [{ itemId: "w-import", onHerOwn: true }, { itemId: "w-pardon", onHerOwn: true }],
    experiment: { trying: "Another Radar round on import.", why: "Reps may fix it.", conclusionOnLast: "The picture did not carry to her own tries." },
  });
  return cycle;
}

describe("bets are scored only on the board they were made for", () => {
  it("scores a bet by her first try on her own on that decision's board, never by a later board", () => {
    const calls = scorePlannerCalls(bettingCycle());
    const of = (decision: number, itemId: string) => calls.find(call => call.decision.decisionId.endsWith(decision === 1 ? "r20" : "r30") && call.itemId === itemId)!;
    // Board 3 had import: she wrote "inport" on her own; the bet "not yet" came true.
    expect(of(1, "w-import")).toMatchObject({ board: 3, hit: true, answer: { childResponse: "inport" } });
    // ornament was not on board 3; her right answer on board 4 belongs to decision 2's experiment, not this bet.
    expect(of(1, "w-ornament").answer).toBeUndefined();
    expect(of(1, "w-ornament").hit).toBeUndefined();
    expect(of(1, "w-charge").answer).toBeUndefined();
    // Board 4: her first try on import was "impot", so the bet "right" missed.
    expect(of(2, "w-import")).toMatchObject({ board: 4, hit: false, answer: { childResponse: "impot" } });
    expect(of(2, "w-pardon")).toMatchObject({ board: 4, hit: true });
  });
});

describe("the experiment ledger opens every board", () => {
  it("lists each experiment in the tutor's words beside the bets code scored on its board, with a running tally", () => {
    const section = experimentLedgerSection(bettingCycle(), "School test: Friday 2026-11-07, 1 day from today.");
    expect(section).toContain("Your experiments, and what reality said (bets scored by code only on the board each experiment built):");
    expect(section).toContain(`- Board 3 (decided 2026-11-03): trying "A picture of lips closing for the m in import."; why "She writes n for m."`);
    expect(section).toContain(`  Your conclusion on the one before: "First experiment."`);
    expect(section).toContain(`  Bets: import not yet -> came true ("inport"); ornament right -> not enough evidence (not on this board on her own); charge right -> not enough evidence (not on this board on her own)`);
    expect(section).toContain(`  Bets: import right -> missed ("impot"); pardon right -> came true`);
    expect(section).toContain("- All experiments: 2 of 3 scored bets came true; 2 not enough evidence.");
    expect(section).not.toMatch(/self-review|read-back/i);
  });

  it("caps the ledger to the latest experiments so it never grows the cost of every board", () => {
    const cycle = bettingCycle();
    const template = cycle.decisionHistory[1];
    cycle.decisionHistory = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(template), decisionId: `${cycle.homeworkId}:decision:r${100 + index}`,
      createdAt: `2026-11-${String(10 + index).padStart(2, "0")}T08:00:00Z`, experiment: { trying: `Experiment ${index + 1}.`, why: "Why.", conclusionOnLast: "Last." } }));
    const section = experimentLedgerSection(cycle, "");
    expect(section).not.toContain(`"Experiment 3."`);
    expect(section).toContain(`"Experiment 4."`);
    expect(section).toContain(`"Experiment 8."`);
    expect(section).toContain("- 3 earlier experiments are counted in the tally; read_record decisions has each one.");
  });

  it("shows the distance to her goal: her latest try on her own per word, and the days to the test", () => {
    const section = experimentLedgerSection(bettingCycle(), "School test: Friday 2026-11-07, 1 day from today.");
    expect(section).toContain("Distance to the goal (counted by code from her first tries on her own):");
    // Latest first try on her own: import impot(board 4 first try), dormant right, ornament right, pardon right, charge right, carnivore right.
    expect(section).toContain("- Her words: 5 of 6 right on her latest try on her own (missed: import).");
    expect(section).toContain("- School test: Friday 2026-11-07, 1 day from today.");
  });

  it("for math, counts problems she had not seen, on her own, per concept the tutor named", () => {
    const section = experimentLedgerSection(mathCycle(), "School test: not recorded.");
    expect(section).toContain("- Rounding to tens: 1 of 3 right on problems she had not seen, on her own.");
    expect(section).not.toContain("Other problems");
  });
});

describe("the tutor writes its experiment and no longer grades itself", () => {
  const facts = (overrides: Partial<SuccessorFacts> = {}): SuccessorFacts => ({
    builtIns: [{ nodeId: "act-1", title: "Radar", implementationType: "word-radar", wordIds: ["w-import"], responseMode: "spelling_letters", checkpoint: false }],
    activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }],
    rerunnable: () => true, evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "next", ...overrides,
  });
  const decideInput = { status: "revised", reason: "import is still inport.", progression_action: "generate_support" };

  it("offers experiment and bets on a new question, without self_review or read_back, and saves the experiment", () => {
    const kit = spellingSuccessorToolkit(facts({ experiment: true, readBack: { evidenceIds: ["note:1"] } }));
    const decide = kit.tools.find(row => row.name === "decide")!;
    const shape = (decide.schema as any).shape;
    expect(Object.keys(shape.experiment.unwrap().shape)).toEqual(["trying", "why", "conclusion_on_last"]);
    expect(shape.self_review).toBeUndefined();
    expect(shape.read_back).toBeUndefined();
    expect(shape.expect_on_her_own).toBeDefined();
    const state = kit.initialState();
    const input = decide.schema.parse({ ...decideInput, experiment: { trying: "A hill picture, then the same problem without it.", why: "5/6 with it, 2/6 without.", conclusion_on_last: "The picture did the work." } });
    expect(decide.run(state, input)).toMatchObject({ ok: true });
    expect(state.decision?.experiment).toEqual({ trying: "A hill picture, then the same problem without it.", why: "5/6 with it, 2/6 without.", conclusionOnLast: "The picture did the work." });
  });

  it("keeps an older frozen question's tools exactly as asked", () => {
    const decide = spellingSuccessorToolkit(facts({ selfReview: true, readBack: { evidenceIds: [] } })).tools.find(row => row.name === "decide")!;
    const shape = (decide.schema as any).shape;
    expect(shape.self_review).toBeDefined();
    expect(shape.read_back).toBeDefined();
    expect(shape.experiment).toBeUndefined();
  });

  it("parses a saved experiment with the decision", () => {
    const saved = { status: "inconclusive", reason: "Saved.", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
      experiment: { trying: "T.", why: "W.", conclusionOnLast: "C." } };
    expect(parseCanonicalProgressionDecision(saved).experiment).toEqual({ trying: "T.", why: "W.", conclusionOnLast: "C." });
  });
});

/** A small math list: three rounding problems the tutor tagged, all unseen, two missed on her own and one right. */
function mathCycle(): LearningCycleRecordV2 {
  const homeworkId = "hw-math-lab";
  const problem = (id: string) => ({ id, prompt: `Round ${id}`, lineage: { sourceEvidenceIds: [], exposure: "unseen", measurementRole: "fresh_checkpoint" }, response: { mode: "numeric", expected: 40 } });
  const node = { nodeId: "b1", role: "baseline", title: "Hill Hop", state: "completed", implementationType: "generated-game", mechanic: "generated-game",
    academicTarget: { domain: "math", skill: "rounding", targets: [] }, evidenceContract: { itemContracts: { p1: problem("p1"), p2: problem("p2"), p3: problem("p3") } }, evidenceIds: [] };
  const answer = (itemId: string, correct: boolean, n: number) => ({ observationId: `obs-${n}`, sourceId: "activity:b1:answer", itemId, childResponse: correct ? "40" : "30", constructLinks: [],
    result: { correct }, assistance: { status: "unassisted", scaffolds: [] }, exposure: "unseen", provenance: "independent_probe", observedAt: `2026-11-20T16:0${n}:00Z`, confounds: [] });
  return { schemaVersion: 2, revision: 5, childId: "lab-math", homeworkId, domain: "math", lifecycle: "baseline_evaluating",
    assignment: { title: "Rounding", contentFingerprint: "lab", capturedEvidenceIds: [], targets: [] }, nodes: [node],
    boards: [{ boardId: `${homeworkId}:board:1`, kind: "probe", predecessorBoardId: null, plannerDecisionId: null, evidenceIds: [], nodeIds: ["b1"], topologyHash: "", publishedAt: "2026-11-20T15:00:00Z" }],
    observations: [answer("p1", true, 1), answer("p2", false, 2), answer("p3", false, 3)],
    decisionHistory: [{ decisionId: `${homeworkId}:decision:r4`, eventType: "theory_decided", status: "inconclusive", reason: "R.", nextAction: "generate_support", evidenceIds: [],
      fromLifecycle: "baseline_evaluating", toLifecycle: "baseline_generating", createdAt: "2026-11-20T17:00:00Z",
      readyOnPaper: [{ concept: "Rounding to tens", chance: 0.4, why: "W.", proof: "P.", items: ["p1", "p2", "p3"] }] }],
    academicTheory: { theoryId: "t", revision: 1, hypothesis: "", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
    evidence: { academic: [], engagement: [], companionObservations: [] }, evidenceSources: [], academicPredictions: [], assumptions: [], predictionEvaluations: [],
    createdAt: "2026-11-20T15:00:00Z", updatedAt: "2026-11-20T17:00:00Z" } as unknown as LearningCycleRecordV2;
}
