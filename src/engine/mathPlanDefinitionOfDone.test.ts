import { describe, expect, it } from "vitest";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import { normalizeLearningRoutesForPlan } from "./assignmentPlanner";
import { buildAssignmentPlanningPacket } from "./assignmentPlanner";
import { getChildChart } from "../profiles/childChart";
import type { AssignmentSourceExtraction } from "./assignmentSourceExtraction";

/** Lab invariant: rich math plans render agency forks and concept-sized spines. */
describe("math plan definition of done", () => {
  const fractionsPlan = {
    planId: "plan-demo-pashley-fractions",
    childId: "demo-pashley",
    domain: "math",
    nodePlan: [
      {
        id: "node-baseline-shade-thirds",
        type: "generated-baseline",
        activityId: "generated-baseline",
        targets: ["shade one third of the rectangle"],
        targetLane: "fractions",
        difficulty: 1,
        locked: false,
      },
      {
        id: "node-baseline-shade-fourths",
        type: "generated-baseline",
        activityId: "generated-baseline",
        targets: ["shade one fourth of the circle"],
        targetLane: "fractions",
        difficulty: 1,
        locked: false,
      },
      {
        id: "node-baseline-compare",
        type: "concept-check",
        activityId: "concept-check",
        targets: ["which is larger: 1/3 or 1/4"],
        targetLane: "fractions",
        difficulty: 1,
        locked: false,
      },
      {
        id: "node-route-a-visual",
        type: "generated-baseline",
        activityId: "generated-baseline",
        targets: ["shade one third of the rectangle", "shade one fourth of the circle"],
        targetLane: "fractions",
        difficulty: 2,
        locked: false,
      },
      {
        id: "node-route-b-compare",
        type: "concept-check",
        activityId: "concept-check",
        targets: ["which is larger: 1/3 or 1/4"],
        targetLane: "fractions",
        difficulty: 2,
        locked: false,
      },
      {
        id: "node-mystery",
        type: "mystery",
        activityId: "mystery",
        targets: ["shade one third of the rectangle", "which is larger: 1/3 or 1/4"],
        choiceMode: "choice_lab",
        difficulty: 1,
        locked: false,
      },
      {
        id: "node-quest",
        type: "quest",
        activityId: "quest",
        targets: ["shade one third of the rectangle", "which is larger: 1/3 or 1/4"],
        difficulty: 2,
        locked: true,
      },
      {
        id: "node-boss",
        type: "boss",
        activityId: "boss",
        targets: [],
        difficulty: 3,
        locked: true,
      },
    ],
    learningRoutes: [
      {
        id: "route-visual-first",
        label: "Picture It First",
        rationale: "Build unit-fraction visuals before comparing sizes.",
        nodeIds: ["node-baseline-shade-thirds", "node-baseline-shade-fourths", "node-route-a-visual", "node-mystery", "node-quest", "node-boss"],
      },
      {
        id: "route-compare-first",
        label: "Compare First",
        rationale: "Probe magnitude reasoning before shading practice.",
        nodeIds: ["node-baseline-compare", "node-route-b-compare", "node-mystery", "node-quest", "node-boss"],
      },
    ],
  };

  it("renders a fork with several teaching nodes and destinations", () => {
    const normalized = normalizeLearningRoutesForPlan(
      fractionsPlan.learningRoutes,
      fractionsPlan.nodePlan,
    );
    expect(normalized.warnings).toEqual([]);
    expect(normalized.routes.length).toBe(2);

    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: { ...fractionsPlan, learningRoutes: normalized.routes },
      boardId: "board-fractions-dod",
      theme: {
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
        palette: {
          path: "#ffffff",
          completed: "#1f8f68",
          available: "#7c3aed",
          locked: "#aeb7c2",
          current: "#f59e0b",
          preview: "#d5dde5",
          text: "#ffffff",
          panel: "rgba(15, 23, 42, 0.84)",
        },
      },
    });

    const teachingNodes = board.nodes.filter((node) =>
      node.kind === "activity" && !["quest", "boss", "mystery"].includes(node.activityId ?? ""),
    );
    expect(teachingNodes.length).toBeGreaterThanOrEqual(3);
    expect(board.nodes.some((node) => node.id === "choose-path")).toBe(true);
    expect(board.choiceSets?.some((set) => set.id === "baseline-route-options")).toBe(true);
    expect(board.nodes.some((node) => node.kind === "mystery")).toBe(true);
    expect(board.nodes.some((node) => node.kind === "quest")).toBe(true);
    expect(board.nodes.some((node) => node.kind === "boss")).toBe(true);
  });

  it("drops cosmetic identical routes so the trace explains missing forks", () => {
    const out = normalizeLearningRoutesForPlan(
      [
        { id: "route-a", nodeIds: ["node-baseline-shade-thirds", "node-mystery", "node-quest"] },
        { id: "route-b", nodeIds: ["node-baseline-shade-thirds", "node-mystery", "node-quest"] },
      ],
      fractionsPlan.nodePlan,
    );
    expect(out.routes).toEqual([]);
    expect(out.warnings[0]).toContain("learning_routes_dropped_identical_node_sets");
  });

  it("spelling ingest catalog stays rich compared to a single-instrument math stub", () => {
    const spellingExtraction: AssignmentSourceExtraction = {
      filename: "spelling-test.pdf",
      sourcePath: "/tmp/spelling-test.pdf",
      sourceKind: "embedded_text_pdf" as const,
      mediaType: "application/pdf",
      fileHash: "spelling-hash",
      extractionMethod: "unpdf" as const,
      warnings: [],
      pages: [],
      fullText: "Benchmark Advance Spelling Unit 9\nSilent Letters\nsign know\nHigh-Frequency Words\nabout again",
    };
    const mathExtraction: AssignmentSourceExtraction = {
      ...spellingExtraction,
      filename: "pashley-math-3-fractions.pdf",
      sourcePath: "/tmp/pashley-math-3-fractions.pdf",
      fileHash: "math-fractions-hash",
      fullText: "Unit 5: Fractions\nShade one third of the rectangle.\nWhich is larger: 1/3 or 1/4?",
    };
    const spellingPacket = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: spellingExtraction,
      childChart: getChildChart("reina"),
    });
    const mathPacket = buildAssignmentPlanningPacket({
      childId: "demo-pashley",
      extraction: mathExtraction,
      childChart: getChildChart("demo-pashley"),
    });
    const spellingLaunchable = spellingPacket.activityCatalog.filter((card) => card.launchable);
    const mathLaunchable = mathPacket.activityCatalog.filter((card) => card.launchable);
    expect(spellingPacket.activityCatalog.some((card) => card.activityId === "spell-check")).toBe(true);
    expect(spellingPacket.activityCatalog.some((card) => card.activityId === "word-radar")).toBe(true);
    expect(spellingLaunchable.length).toBeGreaterThanOrEqual(5);
    expect(mathPacket.activityCatalog.some((card) => card.activityId === "generated-baseline")).toBe(true);
    expect(mathPacket.activityCatalog.some((card) => card.activityId === "concept-check")).toBe(true);
    expect(mathLaunchable.some((card) => card.activityId === "generated-baseline")).toBe(true);
  });
});
