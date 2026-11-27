import { expect, it, vi } from "vitest";

// Ila 11/22: "When I got my pet, I didn't get to name her." The homework companion is told, every turn, which pets she
// has not named yet (a fact, no line to say), so it can ask her and save her answer with the pet tool.
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: undefined, homework: {} }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(), readCompanionCareMemoryForPrompt: () => null }));
vi.mock("./creatureCare", () => ({ unnamedPetFacts: (childId: string) => (childId === "ila-lab" ? "[Her pets she has not named yet]\n- A Starwhal" : "") }));

it("puts her unnamed pets in the companion's live facts", async () => {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  const context = buildActivityCompanionContext({ childId: "ila-lab", companionId: "Elli", presence: "summoned", snapshot: null });
  expect(context).toContain("[Her pets she has not named yet]");
  expect(buildActivityCompanionContext({ childId: "other-lab", companionId: "Elli", presence: "summoned", snapshot: null })).not.toContain("not named yet");
});
