import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  auditActivityToolContracts,
  buildInstructionalActivityPlan,
  getActivityToolContract,
  listActivityToolContracts,
} from "./activityToolCatalog";

describe("activity tool catalog", () => {
  it("marks Word Radar as scaffolded practice instead of mastery evidence", () => {
    const wordRadar = getActivityToolContract("word-radar");

    expect(wordRadar.label).toMatch(/word radar/i);
    expect(wordRadar.purposes).toEqual(expect.arrayContaining(["practice", "vocabulary-familiarity"]));
    expect(wordRadar.domains).toEqual(expect.arrayContaining(["spelling", "vocabulary", "reading", "science"]));
    expect(wordRadar.scaffolds).toEqual(expect.arrayContaining([
      "visible-word",
      "letter-tiles",
      "stt-match",
      "retry",
    ]));
    expect(wordRadar.weakFor).toEqual(expect.arrayContaining([
      "independent-recall",
      "initial-teaching",
    ]));
    expect(wordRadar.evidence.writesPracticeEvidence).toBe(true);
    expect(wordRadar.evidence.writesMasteryEvidence).toBe(false);
    expect(wordRadar.evidence.requiresPerTargetResult).toBe(true);
  });

  it("exposes Word Radar's honest recall-mode capability ladder to the planner", () => {
    const wordRadar = getActivityToolContract("word-radar");

    expect(wordRadar.capabilityModes.map((mode) => mode.id)).toEqual([
      "visible_read",
      "partial_visual_recall",
      "hidden_word_recall",
    ]);
    expect(wordRadar.capabilityModes[0]).toMatchObject({
      id: "visible_read",
      difficulty: 1,
      purpose: "practice",
      masteryEligible: false,
      config: {
        recallMode: "visible_read",
        hideWordDuringResponse: false,
      },
    });
    expect(wordRadar.capabilityModes[1]).toMatchObject({
      id: "partial_visual_recall",
      difficulty: 2,
      masteryEligible: false,
      config: {
        recallMode: "partial_visual_recall",
        hideWordDuringResponse: true,
      },
    });
    expect(wordRadar.capabilityModes[2]).toMatchObject({
      id: "hidden_word_recall",
      difficulty: 3,
      purpose: "independent-retrieval",
      masteryEligible: "requires_captured_response",
      config: {
        recallMode: "hidden_word_recall",
        hideWordDuringResponse: true,
        requiresCapturedResponse: true,
      },
    });
    expect(wordRadar.capabilityModes[2]?.measurementRisks.join(" ")).toMatch(/speech|capture|visual/i);
  });

  it("audits the five priority baseline activities for planner-facing measurement guidance", () => {
    const priorityIds = [
      "word-radar",
      "pronunciation",
      "spell-check",
      "monster-stampede",
      "wheel-of-fortune",
    ];

    for (const id of priorityIds) {
      const contract = getActivityToolContract(id);
      expect(contract.measures.length, `${id} measures`).toBeGreaterThan(0);
      expect(contract.configKnobs.length, `${id} config knobs`).toBeGreaterThan(0);
      expect(contract.realDifficultyLevels.length, `${id} difficulty levels`).toBeGreaterThan(0);
      expect(contract.signalsEmitted.length, `${id} emitted signals`).toBeGreaterThan(0);
      expect(contract.signalsMissing.length, `${id} missing signals`).toBeGreaterThan(0);
      expect(contract.psychologistGuidance.length, `${id} guidance`).toBeGreaterThan(0);
      expect(contract.capabilityModes.length, `${id} capability modes`).toBeGreaterThan(0);
    }

    const pronunciation = getActivityToolContract("pronunciation");
    expect(pronunciation.configKnobs.join(" ")).toMatch(/replay|dosage|support|sfx/i);
    expect(pronunciation.signalsEmitted.join(" ")).toMatch(/miss|hit|support|completion/i);

    const spellCheck = getActivityToolContract("spell-check");
    expect(spellCheck.signalsMissing.join(" ")).toMatch(/visible|retry|hint|independent/i);

    const monster = getActivityToolContract("monster-stampede");
    expect(monster.psychologistGuidance.join(" ")).toMatch(/not.*mastery|practice/i);

    const wheel = getActivityToolContract("wheel-of-fortune");
    expect(wheel.psychologistGuidance.join(" ")).toMatch(/reward|mystery|not.*mastery/i);
  });

  it("plans science homework as evaluate, teach visually, then practice vocabulary", () => {
    const plan = buildInstructionalActivityPlan({
      childId: "ila",
      homeworkId: "hw-erosion",
      practiceDomain: "reading",
      contentDomain: "science",
      primarySkill: "reading_comprehension",
      topic: "Erosion",
      learnerState: "unknown",
      concepts: ["erosion", "weathering", "deposition"],
      words: ["erosion", "soil", "wear away"],
      questionCount: 6,
    });

    expect(plan.childId).toBe("ila");
    expect(plan.homeworkId).toBe("hw-erosion");
    expect(plan.domainSummary).toContain("science");
    expect(plan.steps[0]).toMatchObject({
      toolId: "concept-check",
      purpose: "evaluate",
      writesMasteryEvidence: true,
    });
    expect(plan.steps[1]).toMatchObject({
      toolId: "visual-explainer",
      purpose: "teach",
      writesMasteryEvidence: false,
    });
    expect(plan.steps[0]?.toolId).not.toBe("word-radar");

    const wordRadarStep = plan.steps.find((step) => step.toolId === "word-radar");
    expect(wordRadarStep).toMatchObject({
      purpose: "practice",
      writesMasteryEvidence: false,
    });
    expect(wordRadarStep?.reason).toMatch(/after|vocabulary|practice/i);
  });

  it("plans spelling homework as independent recall before scaffolded practice", () => {
    const plan = buildInstructionalActivityPlan({
      childId: "reina",
      homeworkId: "hw-spelling",
      practiceDomain: "spelling",
      contentDomain: "spelling",
      primarySkill: "spelling_recall",
      topic: "Week 5 spelling",
      learnerState: "unknown",
      words: ["again", "because", "right", "where"],
      questionCount: 0,
    });

    expect(plan.domainSummary).toContain("spelling");
    expect(plan.steps[0]).toMatchObject({
      toolId: "spelling-recall",
      purpose: "evaluate",
      writesMasteryEvidence: true,
    });

    const wordRadarStep = plan.steps.find((step) => step.toolId === "word-radar");
    expect(wordRadarStep).toMatchObject({
      purpose: "practice",
      writesMasteryEvidence: false,
    });
    expect(wordRadarStep?.reason).toMatch(/miss|target|practice/i);
  });

  it("catalogs Letter Rush as a config-driven spelling engine with mastery guarded by mode", () => {
    const letterRush = getActivityToolContract("letter-rush");

    expect(letterRush.label).toBe("Letter Rush");
    expect(letterRush.nodeType).toBe("letter-rush");
    expect(letterRush.domains).toEqual(expect.arrayContaining(["spelling", "vocabulary"]));
    expect(letterRush.purposes).toEqual(expect.arrayContaining([
      "evaluate",
      "practice",
      "fluency",
      "independent-retrieval",
    ]));
    expect(letterRush.goodFitWhen.join(" ")).toMatch(/config mode/i);
    expect(letterRush.badFitWhen.join(" ")).toMatch(/visible word|letter bank|retry/i);
    expect(letterRush.evidence.writesPracticeEvidence).toBe(true);
    expect(letterRush.evidence.writesMasteryEvidence).toBe(true);
    expect(letterRush.evidence.requiresPerTargetResult).toBe(true);
    expect(letterRush.evidence.contaminationRisks).toEqual(expect.arrayContaining([
      "visible-word",
      "letter-tiles",
      "retry",
      "companion-coaching",
    ]));
  });

  it("catalogs Monster Stampede as whole-cohort practice, not mastery evidence", () => {
    const monsterStampede = getActivityToolContract("monster-stampede");

    expect(monsterStampede.label).toBe("Monster Stampede");
    expect(monsterStampede.nodeType).toBe("monster-stampede");
    expect(monsterStampede.domains).toEqual(expect.arrayContaining(["spelling", "vocabulary"]));
    expect(monsterStampede.purposes).toEqual(expect.arrayContaining(["practice", "fluency", "reward"]));
    expect(monsterStampede.weakFor).toEqual(expect.arrayContaining([
      "initial-baseline",
      "mastery-gating",
    ]));
    expect(monsterStampede.evidence.writesPracticeEvidence).toBe(true);
    expect(monsterStampede.evidence.writesMasteryEvidence).toBe(false);
    expect(monsterStampede.evidence.requiresPerTargetResult).toBe(false);
  });

  it("exposes lightweight traits for every activity so preference can learn why a child likes it", () => {
    const pronunciation = getActivityToolContract("pronunciation");

    expect(pronunciation.traits).toMatchObject({
      friction: "low",
      pacing: "fast",
      scaffoldLevel: "medium",
      evidenceType: "practice",
    });
    expect(pronunciation.traits.skillTargets).toEqual(expect.arrayContaining([
      "read_fluently",
      "pronounce",
      "auditory_retrieval",
    ]));
    expect(pronunciation.traits.inputModes).toEqual(expect.arrayContaining(["voice"]));
    expect(pronunciation.traits.preferenceDimensions).toEqual(expect.arrayContaining([
      "voice",
      "speed",
      "low-writing-load",
      "confidence",
    ]));

    for (const contract of listActivityToolContracts()) {
      expect(contract.traits.skillTargets.length, contract.id).toBeGreaterThan(0);
      expect(contract.traits.inputModes.length, contract.id).toBeGreaterThan(0);
      expect(contract.traits.preferenceDimensions.length, contract.id).toBeGreaterThan(0);
    }
  });

  it("audits every contract so scaffolded tools cannot write mastery", () => {
    const audit = auditActivityToolContracts();
    const contracts = listActivityToolContracts();

    expect(contracts.some((contract) => contract.id === "word-radar")).toBe(true);
    expect(audit.blockers).toEqual([]);

    for (const contract of contracts) {
      if (!contract.evidence.writesMasteryEvidence) continue;
      expect(contract.scaffolds).not.toContain("visible-word");
      expect(contract.scaffolds).not.toContain("letter-tiles");
      expect(contract.evidence.requiresPerTargetResult).toBe(true);
    }

    const wordRadarRow = audit.rows.find((row) => row.id === "word-radar");
    expect(wordRadarRow?.evidencePolicy).toContain("practice-only");
    expect(wordRadarRow?.issues).toContain("scaffolded-practice-not-mastery");
  });

  it("documents the required protocol for adding new activities", () => {
    const doc = fs.readFileSync(
      path.join(process.cwd(), "docs", "activity-tool-protocol.md"),
      "utf8",
    );

    expect(doc).toContain("No orphan activities");
    expect(doc).toContain("src/engine/activityToolCatalog.ts");
    expect(doc).toContain("writesMasteryEvidence");
    expect(doc).toContain("requiresPerTargetResult");
    expect(doc).toContain("scaffolds");
    expect(doc).toContain("goodFitWhen");
    expect(doc).toContain("badFitWhen");
    expect(doc).toContain("Every new activity");
  });

  it("keeps a readable audit snapshot for the five priority baseline activities", () => {
    const doc = fs.readFileSync(
      path.join(process.cwd(), "docs", "activity-capability-audit.md"),
      "utf8",
    );

    for (const label of [
      "Word Radar",
      "Pronunciation",
      "Spell Check",
      "Monster Stampede",
      "Wheel of Fortune",
    ]) {
      expect(doc).toContain(label);
    }
    expect(doc).toContain("src/engine/activityToolCatalog.ts");
    expect(doc).toContain("not mastery");
  });
});
