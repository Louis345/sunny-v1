import { describe, expect, it } from "vitest";
import {
  auditActivityEvidenceContracts,
  evidenceContractForActivityMode,
  plannerEvidenceFieldsForActivity,
} from "./activityEvidenceContract";
import { listActivityToolContracts } from "./activityToolCatalog";

describe("activity evidence contract", () => {
  it("declares mode-level spelling evidence roles", () => {
    expect(evidenceContractForActivityMode("word-radar", "visible_read")).toMatchObject({
      evidenceRole: "recognition_fluency",
      proofStrength: "practice",
      masteryEligible: false,
    });
    expect(evidenceContractForActivityMode("word-radar", "hidden_word_recall")).toMatchObject({
      evidenceRole: "clean_spelling_recall",
      proofStrength: "clean_recall_candidate",
      masteryEligible: "requires_captured_response",
      requiresCapturedResponse: true,
    });
    expect(evidenceContractForActivityMode("spell-check", "cold_recall_spell")).toMatchObject({
      evidenceRole: "spelling_production",
      proofStrength: "mastery_candidate",
      requiresPerTargetEvidence: true,
      requiresCapturedResponse: true,
    });
    expect(evidenceContractForActivityMode("letter-rush", "mastery_run")).toMatchObject({
      evidenceRole: "pressure_mastery_candidate",
      proofStrength: "mastery_candidate",
      requiresCapturedResponse: true,
    });
  });

  it("exports planner-facing truth fields for activity cards", () => {
    expect(plannerEvidenceFieldsForActivity("spell-check")).toMatchObject({
      evidenceRole: "spelling_production",
      proofStrength: "diagnostic",
    });
    expect(plannerEvidenceFieldsForActivity("word-radar").modeEvidenceNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hidden_word_recall",
          role: "clean_spelling_recall",
          strength: "clean_recall_candidate",
        }),
      ]),
    );
  });

  it("keeps launchable spelling activities covered by onboarding rules", () => {
    const audit = auditActivityEvidenceContracts(listActivityToolContracts());

    expect(audit.blockers).toEqual([]);
    expect(audit.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("spelling-recall:not_launchable_in_board_contract"),
        expect.stringContaining("wordle:blocked_for_real_child_sessions"),
      ]),
    );
  });

  it("blocks new launchable spelling activities without a truth-table row", () => {
    const audit = auditActivityEvidenceContracts([
      ...listActivityToolContracts(),
      {
        id: "fake-spelling-game",
        label: "Fake Spelling Game",
        nodeType: "fake-spelling-game",
        gameIds: ["fake-spelling-game"],
        configSource: "query-params",
        domains: ["spelling"],
        capabilityModes: [],
      },
    ]);

    expect(audit.blockers).toContain("fake-spelling-game:missing_evidence_contract");
  });

  it("blocks mastery candidates without per-target captured evidence", () => {
    const audit = auditActivityEvidenceContracts([], [
      {
        activityId: "bad-master-game",
        modeId: "default",
        evidenceRole: "spelling_production",
        proofStrength: "mastery_candidate",
        bestFor: [],
        weakFor: [],
        contaminationRisks: [],
        requiresPerTargetEvidence: false,
        requiresCapturedResponse: false,
        masteryEligible: true,
        notes: [],
      },
    ]);

    expect(audit.blockers).toEqual([
      "bad-master-game/default:mastery_requires_per_target_evidence",
      "bad-master-game/default:mastery_requires_captured_response",
    ]);
  });
});
