import { describe, expect, it } from "vitest";
import { assignmentPlannerToolJsonSchema, validateAssignmentPlannerOutput, type AssignmentPlannerOutput, type AssignmentActivityCard } from "./assignmentPlanner";

function activityIds(schema: Record<string, unknown>): string[] {
  const properties = schema.properties as Record<string, any>;
  return properties.activeSessionPlan.properties.nodePlan.items.properties.activityId.enum;
}

describe("spelling Planner tool agrees with the launchable packet catalog", () => {
  const catalog = [
    { activityId: "word-radar", launchable: true },
    { activityId: "wheel-of-fortune", launchable: true },
    { activityId: "quest", launchable: true },
    { activityId: "wordle", launchable: false },
    { activityId: "generated-baseline", launchable: false },
  ];

  it("offers all and only available activity identities without prescribing a plan", () => {
    expect(activityIds(assignmentPlannerToolJsonSchema(true, catalog))).toEqual(["word-radar", "wheel-of-fortune", "quest"]);
  });

  it("changes with actual capability availability, not a hardcoded game list", () => {
    expect(activityIds(assignmentPlannerToolJsonSchema(true, catalog.map(card => ({ ...card, launchable: card.activityId === "wordle" }))))).toEqual(["wordle"]);
  });

  it("stops before a paid call when no usable activity is available", () => {
    expect(() => assignmentPlannerToolJsonSchema(true, [])).toThrow("assignment_planner_launchable_catalog_empty");
  });

  it("leaves the existing non-Discovery contract unchanged", () => {
    expect(assignmentPlannerToolJsonSchema(false, catalog)).toEqual(assignmentPlannerToolJsonSchema());
  });

  it("binds both activity identity and renderer to the same launchable capability", () => {
    const schema = assignmentPlannerToolJsonSchema(true, catalog) as any;
    const node = schema.properties.activeSessionPlan.properties.nodePlan.items;
    expect(node.properties.type.enum).toEqual(["word-radar", "wheel-of-fortune", "quest"]);
    expect(node.anyOf).toEqual(catalog.filter(card => card.launchable).map(card => ({
      properties: { activityId: { const: card.activityId }, type: { const: card.activityId } },
    })));
  });

  it.each(["wordle", "wheel-of-fortune"])("rejects an allowed identity paired with the wrong %s renderer", type => {
    const output = {
      capturedContent: { sourceDocuments: [{ filename: "school-words.txt" }], wordGroups: [] }, homeworkWords: [],
      assignmentInterpretation: { wordGroups: [{ id: "school", label: "School words", words: ["night"], purpose: "spell" }] },
      activeSessionPlan: { nodePlan: [{ id: "practice", activityId: "word-radar", type: "word-radar", targets: ["night"], wordRadarConfig: { recallMode: "hidden_word_recall" } }] },
      plannedMeasurements: [{ id: "measure-practice" }],
    } as unknown as AssignmentPlannerOutput;
    const options = { extraction: {} as never, activityCatalog: catalog as AssignmentActivityCard[], requireCatalogBinding: true };
    expect(validateAssignmentPlannerOutput(output, options)).toEqual([]);
    output.activeSessionPlan.nodePlan[0].type = type as typeof output.activeSessionPlan.nodePlan[number]["type"];
    const issues = validateAssignmentPlannerOutput(output, options);
    expect(issues).toContainEqual(expect.objectContaining({ code: "activity_renderer_mismatch", severity: "error", message: expect.stringContaining(`practice`) }));
  });

  it("uses an explicitly registered renderer mapping instead of assuming identical IDs", () => {
    const schema = assignmentPlannerToolJsonSchema(true, [{ activityId: "speed-catcher", nodeType: "concept-check", launchable: true }]) as any;
    expect(schema.properties.activeSessionPlan.properties.nodePlan.items.anyOf).toEqual([
      { properties: { activityId: { const: "speed-catcher" }, type: { const: "concept-check" } } },
    ]);
  });
});
