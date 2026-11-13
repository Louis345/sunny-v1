import { expect, it } from "vitest";
import { itemIntakeToolkit } from "./itemIntakeTools";

// 2026-11-09 Reina: "How many more sweaters were sold in January than March?" was saved without the table that
// sat above it on the worksheet (only problem 10's text carried it), so every game showed it with no numbers.
// The human caught it ("it says nothing"); the logs held the saved prompt; the lab never asked whether a saved
// problem stands on its own. The intake form says so as a fact: she sees each problem alone.
it("tells the intake Planner that each problem is shown alone, with any shared table or story it needs", () => {
  const kit = itemIntakeToolkit({ sourceDocument: { fileHash: "h", pages: [{ pageNumber: 1 }] }, childChart: {}, activityCatalog: [] } as never);
  const record = kit.tools.find(row => row.name === "record_items")!;
  const json = JSON.stringify((record.schema as any).shape.items.element.shape.problem.description);
  expect(json).toMatch(/shown alone/);
  expect(json).toMatch(/table/);
});
