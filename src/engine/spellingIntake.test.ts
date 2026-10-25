import { describe, expect, it } from "vitest";
import { parseSpellingIntake } from "./assignmentPlanner";
import type { AssignmentPlanningPacket } from "./assignmentPlanner";
import { spellingDiscoveryToolkit } from "./spellingDiscoveryTools";
import { buildSpellingIntakeToolPrompt } from "./spellingIntakeWithTools";

// 2026-10-24: the intake's single form was retired for small locked tools. These rules moved with it:
// they are now enforced by record_words and finish_intake inside the conversation.
const packet = {
  childId: "lab-child", sourceDocument: { filename: "school.txt", sourcePath: "/missing/school.txt", mediaType: "text/plain", sourceKind: "text_assignment", extractionMethod: "text", fullText: "Spelling\nnight\nlight\ncan't", fileHash: "source-hash", pages: [{ pageNumber: 1, text: "Spelling\nnight\nlight\ncan't" }] },
  childChart: { childId: "lab-child", displayName: "Lab child", recentEvidence: [] },
  spellingDiagnostics: { version: 1, instruments: [], observations: [], evidenceIds: ["assignment:source-hash"], device: { status: "unknown" } },
} as unknown as AssignmentPlanningPacket;
const words = [{ word: "night", page_number: 1 }, { word: "light", page_number: 1 }, { word: "can't", page_number: 1 }];
function recordWords(input: Record<string, unknown>) {
  const kit = spellingDiscoveryToolkit(packet), state = kit.initialState();
  const tool = kit.tools.find(row => row.name === "record_words")!;
  const parsed = tool.schema.safeParse({ words, uncertainty: [], source_notes: [], ...input });
  return { state, outcome: parsed.success ? tool.run(state, parsed.data) : { ok: false as const, error: "schema" } };
}

describe("spelling intake is the opening phase of the existing Planner", () => {
  it("keeps source notes separate from actionable uncertainty about assigned words", () => {
    const notes = ["The handwritten name is unclear; it is not an assigned word.", "All assigned words are legible. The second page repeats them."];
    const { state, outcome } = recordWords({ source_notes: notes });
    expect(outcome.ok).toBe(true);
    expect(state.capture).toMatchObject({ sourceNotes: notes, uncertainty: [] });
    expect(buildSpellingIntakeToolPrompt(packet)).toContain("source_notes");
  });
  it("requires word-scoped, page-resolved uncertainty", () => {
    const issue = { kind: "ambiguous_word", page_number: 1, detail: "The second assigned word could be light or tight." };
    expect(recordWords({ uncertainty: [issue] }).outcome.ok).toBe(true);
    for (const uncertainty of [["All assigned words are clearly legible."], [{ ...issue, page_number: 9 }], [{ ...issue, kind: "header_note" }]]) {
      expect(recordWords({ uncertainty }).outcome.ok).toBe(false);
    }
  });
  it("leaves legacy saved warnings readable and unresolved instead of guessing their meaning", () => {
    const legacy = { title: "School spelling", words: words.map(row => ({ word: row.word, pageNumber: row.page_number })), uncertainty: ["All assigned words are legible."] };
    expect(parseSpellingIntake(legacy, { ...packet, spellingDiagnostics: undefined } as AssignmentPlanningPacket)).toEqual(legacy);
  });
  it("asks for assignment capture, not a teaching board before current evidence", () => {
    const prompt = buildSpellingIntakeToolPrompt(packet);
    expect(prompt).toContain("Do not prescribe a teaching board");
    expect(prompt).toContain("every assigned spelling word");
    expect(recordWords({ activeSessionPlan: { nodePlan: [] } }).outcome.ok).toBe(false);
  });
  it("rejects invented source pages, duplicate targets, and empty capture", () => {
    for (const rows of [[], [{ word: "night", page_number: 9 }], [{ word: "night", page_number: 1 }, { word: "NIGHT", page_number: 1 }]]) {
      expect(recordWords({ words: rows }).outcome.ok).toBe(false);
    }
  });
});
