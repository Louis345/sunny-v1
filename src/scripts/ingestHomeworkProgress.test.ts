import { describe, expect, it } from "vitest";
import { createIngestProgress } from "../utils/ingestOutput";
import { childFacingMathNodeTitle, classifyMathRouteTreatment, ensureUniqueMathNodeTitles } from "./ingestHomework";

describe("ingest progress", () => {
  it("uses the route experiment when comparable arms share every academic target", () => {
    const targets = ["5x2", "Mrs. K puts 5 pencils in each of 4 boxes"];
    expect(classifyMathRouteTreatment("route-speed-facts", "Speed Facts Sprint", targets)).toBe("speed");
    expect(classifyMathRouteTreatment("route-story-problems", "Story Problems Path", targets)).toBe("story");
  });

  it("gives each math board node a distinct child-facing title", () => {
    const titles = [
      childFacingMathNodeTitle({ id: "node-baseline-facts", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "node-baseline-word-problems", activityId: "generated-baseline", type: "generated-baseline", targets: ["pencils-boxes-word-problem"] }),
      childFacingMathNodeTitle({ id: "node-vault-facts-arm", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "node-clock-transfer-arm", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "node-mystery", activityId: "mystery", type: "mystery", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "node-quest", activityId: "quest", type: "quest", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "node-boss", activityId: "boss", type: "boss", targets: [] }),
    ];

    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).toEqual([
      "Fact Blaster",
      "Story Solver",
      "Vault Cracker",
      "Array Transfer",
      "Mystery Challenge",
      "Multiplication Quest",
      "Multiplication Boss",
    ]);
  });

  it("keeps the current Pashley node titles unique", () => {
    const nodes = [
      childFacingMathNodeTitle({ id: "baseline-facts-x2", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "baseline-facts-x5-x10", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x5", "5x10"] }),
      childFacingMathNodeTitle({ id: "baseline-word-problems", activityId: "generated-baseline", type: "generated-baseline", targets: ["pencils-word-problem"] }),
      childFacingMathNodeTitle({ id: "route-arcade-facts-x2", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] }),
      childFacingMathNodeTitle({ id: "route-story-word-problems", activityId: "generated-baseline", type: "generated-baseline", targets: ["pencils-word-problem"] }),
    ];

    const titles = [...ensureUniqueMathNodeTitles([
      { id: "baseline-facts-x2", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] },
      { id: "baseline-facts-x5-x10", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x5", "5x10"] },
      { id: "baseline-word-problems", activityId: "generated-baseline", type: "generated-baseline", targets: ["pencils-word-problem"] },
      { id: "route-arcade-facts-x2", activityId: "generated-baseline", type: "generated-baseline", targets: ["5x2"] },
      { id: "route-story-word-problems", activityId: "generated-baseline", type: "generated-baseline", targets: ["pencils-word-problem"] },
    ]).values()];
    expect(nodes.length).toBe(5);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("renders the five stages as readable lines in non-interactive mode", () => {
    const output: string[] = [];
    const progress = createIngestProgress({
      interactive: false,
      write: (text) => output.push(text),
    });

    progress.update(1, "Reading homework");
    progress.update(2, "Planning learning path");
    progress.update(5, "Finishing and syncing");
    progress.finish();

    expect(output.join("")).toContain("[██░░░░░░░░] 1/5  Reading homework\n");
    expect(output.join("")).toContain("[████░░░░░░] 2/5  Planning learning path\n");
    expect(output.join("")).toContain("[██████████] 5/5  Finishing and syncing\n");
  });

  it("updates one terminal line in interactive mode and finishes cleanly", () => {
    const output: string[] = [];
    const progress = createIngestProgress({
      interactive: true,
      write: (text) => output.push(text),
    });

    progress.update(3, "Saving child evidence");
    progress.finish();
    progress.update(4, "Building learning activities");

    expect(output[0]).toContain("\r[██████░░░░] 3/5  Saving child evidence");
    expect(output[1]).toBe("\n");
    expect(output).toHaveLength(2);
  });
});
