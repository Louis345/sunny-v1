import { describe, expect, it, vi } from "vitest";
import { buildSpellingIntakePrompt, parseSpellingIntake, planSpellingIntakeFromSource } from "./assignmentPlanner";
import type { AssignmentPlanningPacket } from "./assignmentPlanner";

const packet = {
  childId: "lab-child", sourceDocument: { filename: "school.txt", sourcePath: "/missing/school.txt", mediaType: "text/plain", sourceKind: "text_assignment", extractionMethod: "text", fullText: "Spelling\nnight\nlight\ncan't", fileHash: "source-hash", pages: [{ pageNumber: 1, text: "Spelling\nnight\nlight\ncan't" }], warnings: [] },
  childChart: { childId: "lab-child", displayName: "Lab child", recentEvidence: [] },
} as unknown as AssignmentPlanningPacket;
const intake = { title: "School spelling", words: [{ word: "night", pageNumber: 1 }, { word: "light", pageNumber: 1 }, { word: "can't", pageNumber: 1 }], uncertainty: [] };

describe("spelling intake is the opening phase of the existing Planner", () => {
  it("keeps source notes separate from actionable uncertainty about assigned words", async () => {
    const draft = { ...intake, sourceNotes: ["The handwritten name is unclear; it is not an assigned word.", "All assigned words are legible. The second page repeats them."] };
    const result = await planSpellingIntakeFromSource(packet, { callPlannerModel: async () => ({ draft }) });
    expect(result.output).toEqual(draft);
    expect(buildSpellingIntakePrompt(packet)).toContain("sourceNotes");
  });
  it("requires word-scoped, page-resolved uncertainty from new provider responses", async () => {
    const issue = { kind: "ambiguous_word", pageNumber: 1, detail: "The second assigned word could be light or tight." };
    await expect(planSpellingIntakeFromSource(packet, { callPlannerModel: async () => ({ draft: { ...intake, uncertainty: [issue] } }) })).resolves.toMatchObject({ output: { uncertainty: [issue] } });
    for (const uncertainty of [["All assigned words are clearly legible."], [{ ...issue, pageNumber: 9 }], [{ ...issue, kind: "header_note" }]]) {
      await expect(planSpellingIntakeFromSource(packet, { callPlannerModel: async () => ({ draft: { ...intake, uncertainty } }) })).rejects.toThrow();
    }
  });
  it("leaves legacy saved warnings readable and unresolved instead of guessing their meaning", () => {
    const legacy = { ...intake, uncertainty: ["All assigned words are legible."] };
    expect(parseSpellingIntake(legacy, packet)).toEqual(legacy);
  });
  it("requests assignment capture, not a teaching board before current evidence", async () => {
    const callPlannerModel = vi.fn(async () => ({ draft: intake }));
    const result = await planSpellingIntakeFromSource(packet, { callPlannerModel });
    expect(result.output).toEqual(intake);
    expect(callPlannerModel).toHaveBeenCalledOnce();
    expect(buildSpellingIntakePrompt(packet)).toContain("Do not prescribe a teaching board");
    expect(buildSpellingIntakePrompt(packet)).toContain("every assigned spelling word");
    expect(result.output).not.toHaveProperty("activeSessionPlan");
  });
  it("rejects invented source pages, duplicate targets, and empty capture", async () => {
    for (const words of [[], [{ word: "night", pageNumber: 9 }], [{ word: "night", pageNumber: 1 }, { word: "NIGHT", pageNumber: 1 }]]) {
      await expect(planSpellingIntakeFromSource(packet, { callPlannerModel: async () => ({ draft: { ...intake, words } }) })).rejects.toThrow();
    }
  });
  it("rejects a speculative board instead of silently discarding paid work", async () => {
    await expect(planSpellingIntakeFromSource(packet, { callPlannerModel: async () => ({ draft: { ...intake, activeSessionPlan: { nodePlan: [] } } }) })).rejects.toThrow();
  });
});
