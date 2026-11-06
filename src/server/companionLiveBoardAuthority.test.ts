import { describe, expect, it, vi } from "vitest";
import { expandJourneySequence } from "../shared/adventureBoardDefinition";

/**
 * Lab invariant (child session 2026-11-05, Ila + Elli): Ila asked "where did I
 * leave off?" and Elli answered "Word Island: Trophy Hunt, Round 7", then told
 * her to tap a Word Island icon that was not on her board. Ila caught it
 * because she went looking for a game that does not exist ("Ellie, you're
 * bad"). Logs showed a normal companion turn: nothing compared Elli's answer
 * with the live board. The lab missed it because no test built Elli's per-turn
 * context with old memory AND a board screen: on the board, the context said
 * only "The board is showing", so the remembered round was the only position
 * she had. Live board = where she is; memory = who she is.
 */
const BOARD_ID = "hw-lab:board:9";
const nodes = [
  { nodeId: "arcade", title: "Arcade Warm-Up", role: "practice" },
  { nodeId: "monster", title: "Monster Dash Warm-Up", role: "practice" },
  { nodeId: "quest", title: "Spelling Quest", role: "quest" },
];
const definition = expandJourneySequence({
  title: "Spelling Quest Trail",
  opening: [],
  choice: {
    purpose: "Which warm-up do you want?",
    label: "Warm-Up Pick",
    options: [
      { id: "arcade", label: "Arcade Warm-Up", hypothesis: "speed", nodeIds: ["arcade"] },
      { id: "monster", label: "Monster Dash Warm-Up", hypothesis: "chase", nodeIds: ["monster"] },
    ],
  },
  closing: ["quest"],
  endpointLabel: "Finish",
}, nodes.map((node) => ({ id: node.nodeId, title: node.title })));

const cycle = {
  childId: "ila-lab",
  homeworkId: "hw-lab",
  domain: "spelling",
  lifecycle: "board_ready",
  createdAt: "2026-11-05T00:00:00.000Z",
  boards: [{
    boardId: BOARD_ID, kind: "teaching", definition, predecessorBoardId: null, plannerDecisionId: null,
    evidenceIds: [], nodeIds: nodes.map((node) => node.nodeId), topologyHash: "h", publishedAt: "2026-11-05T00:00:00.000Z",
  }],
  nodes: nodes.map((node) => ({ ...node, state: "ready", artifactBinding: { validationStatus: "passed" } })),
  decisionHistory: [],
};

vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle }) }));
vi.mock("./companionInteractionMemory", () => ({
  maybeCompactCompanionInteractionMemory: vi.fn(),
  recordCompanionInteractionEvent: vi.fn(),
  readCompanionCareMemoryForPrompt: () => ({
    lastSessionSummary: "Ila and Elli played Word Island: Trophy Hunt and she reached Round 7. They laughed a lot.",
    relationshipFacts: ["Ila's favorite color is green", "Ila left off at Word Island: Trophy Hunt on Round 7"],
    favoriteMoments: ["Ila's cookie joke landing perfectly"],
  }),
}));

describe("Elli's live board is the only source of where Ila is", () => {
  it("presents the live Quest board as current and never the remembered Word Island round", async () => {
    const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
    const { normalizeScreenReport } = await import("./screenReport");
    const context = buildActivityCompanionContext({
      snapshot: null,
      childId: "ila-lab",
      companionId: "Elli",
      presence: "summoned",
      childSpeech: "Ellie, so do remember where I left off. Can we do that again where I left off?",
      screenReport: normalizeScreenReport({ screen: "board", boardId: BOARD_ID, boardTitle: "Spelling Quest Trail" }),
    });

    // The live board, its choice, the locked Quest and the next step are present.
    expect(context).toContain("Spelling Quest Trail");
    expect(context).toMatch(/Warm-Up Pick.*Arcade Warm-Up.*Monster Dash Warm-Up/s);
    expect(context).toMatch(/Spelling Quest.*locked/);
    expect(context).toMatch(/Next step:.*Warm-Up Pick/);
    expect(context).toMatch(/where she left off/i);
    // Remembered position facts never reach her.
    expect(context).not.toContain("Word Island");
    expect(context).not.toMatch(/Round 7/i);
    // Personality and personal details from memory stay.
    expect(context).toContain("favorite color is green");
    expect(context).toContain("They laughed a lot");
  });
});
