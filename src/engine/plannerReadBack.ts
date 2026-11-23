/**
 * The Planner's forced read-back (docs/specs/child-knowledge-store.md, metacognition loop; owner 2026-11-22). Before
 * each next board it reads its last theory back, grades it against the new evidence citing ids, states one belief about
 * how she thinks (not her score, game order or mood) and a competing explanation, and says how the board tells them
 * apart. Code owns the shape only: the fields exist and the grade cites real evidence ids. A grade citing nothing real,
 * or no read-back at all, is saved as "unclear" and logged; the board is never stopped for it. Substance is the model's.
 */
import type { LearningCycleRecordV2, PlannerReadBack } from "./learningCycleRepository";

export const READ_BACK_GRADES = ["supported", "revised", "falsified", "unclear"] as const;
export type ReadBackGrade = typeof READ_BACK_GRADES[number];

export type ReadBackInput = { previous_theory: string; grade: ReadBackGrade; why: string; evidence_ids: string[];
  how_she_thinks: string; competing_explanation: string; board_tells_apart: string };

const clip = (text: string, max = 400) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

/** What the Planner reads back: its current theory, its last belief about her thinking and what it said it would test. */
export function theoryReadBackSection(cycle: Pick<LearningCycleRecordV2, "academicTheory" | "decisionHistory">): string {
  const last = [...(cycle.decisionHistory ?? [])].reverse().find(row => row.eventType === "theory_decided");
  const belief = [...(cycle.decisionHistory ?? [])].reverse().find(row => row.eventType === "theory_decided" && row.readBack?.howSheThinks && !row.readBack.missing);
  return [
    "Your theory going into this board (read it back and grade it in decide's read_back before anything else):",
    `- Theory (revision ${cycle.academicTheory?.revision ?? 0}): "${clip(cycle.academicTheory?.hypothesis ?? "none recorded")}"`,
    belief?.readBack ? `- Your last belief about how she thinks (${belief.createdAt.slice(0, 10)}): "${clip(belief.readBack.howSheThinks)}"; competing explanation then: "${clip(belief.readBack.competingExplanation, 240)}"; the board was to tell them apart by: "${clip(belief.readBack.boardTellsApart, 240)}"`
      : "- Your last belief about how she thinks: none recorded yet.",
    `- What you said you would test next: ${(last?.testNext ?? []).map(line => `"${clip(line, 200)}"`).join(" | ") || "(nothing listed)"}`,
    "read_back.how_she_thinks is one belief about how she thinks about the skill, from her words, her wrong answers and what needed help; not her score, the order of games or her mood. Design the board so its problems come out differently under that belief and under your competing explanation.",
  ].join("\n");
}

/** Code's part: keep only evidence ids that were offered; a grade with none of them is "unclear". */
export function settleReadBack(input: ReadBackInput | undefined, offered: ReadonlySet<string>): PlannerReadBack {
  if (!input) return missingReadBack();
  const cited = [...new Set(input.evidence_ids.map(id => id.trim()).filter(Boolean))];
  const evidenceIds = cited.filter(id => offered.has(id)), unknownEvidenceIds = cited.filter(id => !offered.has(id));
  const grounded = evidenceIds.length > 0;
  return {
    previousTheory: input.previous_theory.trim(), grade: grounded ? input.grade : "unclear",
    ...(!grounded && input.grade !== "unclear" ? { claimedGrade: input.grade } : {}),
    why: input.why.trim(), evidenceIds, ...(unknownEvidenceIds.length ? { unknownEvidenceIds } : {}),
    howSheThinks: input.how_she_thinks.trim(), competingExplanation: input.competing_explanation.trim(), boardTellsApart: input.board_tells_apart.trim(),
  };
}

/** The Planner gave no read-back: recorded as unclear, never a reason to stop the board. */
export function missingReadBack(): PlannerReadBack {
  return { previousTheory: "", grade: "unclear", why: "The Planner gave no read-back.", evidenceIds: [], howSheThinks: "", competingExplanation: "", boardTellsApart: "", missing: true };
}
