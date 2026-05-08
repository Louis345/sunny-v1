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
});
