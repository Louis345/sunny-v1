import { afterEach, expect, it, vi } from "vitest";
import { setCompanionSpeechMuted } from "./companionItemHelp";

// Lab invariant (Saori 11/22–11/25): Ila and Reina muted their companions 64–91% of several sessions, and the companion
// kept talking: 60 of 62 replies went unheard, many answering adults at the table ("Hello, James", an 852-character
// story). The human caught it watching Ila leave Elli muted; the logs had every mute press and every reply but nothing
// joined them; the lab never played a muted session or a room with adults in it. The companion is given two facts,
// not rules: whether she can hear her, and that the microphone hears everyone and cannot tell who spoke.
const cycle = { childId: "ila-lab", homeworkId: "hw-math", domain: "math", lifecycle: "baseline_ready", boards: [], observations: [], decisionHistory: [],
  nodes: [{ nodeId: "quest", title: "Quest", role: "baseline", state: "ready", evidenceIds: [], openingScreen: { purpose: "Rounding" }, evidenceContract: { itemContracts: {} } }] };
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle, homework: { waterfall: { current: { testDate: null } } } }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(), readCompanionCareMemoryForPrompt: () => null }));

const snapshot = { childId: "ila-lab", sessionId: "s", nodeId: "quest", game: "generated-game", targetIsSpeakable: true, answerVisibility: "hidden", allowedActivities: [], updatedAt: "2026-11-25T23:34:00.000Z" } as never;

async function context() {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  return buildActivityCompanionContext({ childId: "ila-lab", companionId: "Elli", presence: "summoned", snapshot });
}

afterEach(() => setCompanionSpeechMuted("ila-lab", false, "test"));

it("tells her companion when her voice is muted on the child's screen, and when it is not", async () => {
  setCompanionSpeechMuted("ila-lab", true);
  expect(await context()).toMatch(/\[Hearing\]\nShe has your voice muted on her screen: she cannot hear what you say\./);
  setCompanionSpeechMuted("ila-lab", false);
  expect(await context()).not.toMatch(/voice muted/);
});

it("tells her companion the microphone hears everyone near the kiosk and cannot tell who spoke", async () => {
  expect(await context()).toMatch(/hears everyone near the kiosk.*cannot tell who spoke/s);
});
