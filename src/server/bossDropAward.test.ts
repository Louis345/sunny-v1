import { afterEach, expect, it, vi } from "vitest";
import { createStarterCompanionCarePlan } from "../engine/companionCareEngine";
import { awardBossDropOnCompletion } from "./bossDropAward";

const saved: unknown[] = [];
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn(() => ({ companionCare: { plan: saved.at(-1) ?? createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" }) } })) }));
vi.mock("../profiles/companionCarePlan", () => ({ saveCompanionCarePlan: vi.fn((_chart, plan) => saved.push(plan)), mirrorCompanionCareToLearningProfile: vi.fn() }));
afterEach(() => { saved.length = 0; vi.clearAllMocks(); });

const cycle = (role: string, state = "completed") => ({ childId: "demo-pashley", homeworkId: "hw", nodes: [{ nodeId: "hw:b9:boss", role, state }] }) as never;

// Owner, 2026-11-05: beating the Boss drops loot; it is saved once and shown again on replay.
it("drops loot once when she finishes a Boss, and the same card on replay", () => {
  const first = awardBossDropOnCompletion(cycle("boss"), "hw:b9:boss", () => 0.9);
  expect(first).toMatchObject({ tier: "epic", coins: 60, bossNodeId: "hw:b9:boss" });
  expect(awardBossDropOnCompletion(cycle("boss"), "hw:b9:boss", () => 0)).toEqual(first);
  expect(saved).toHaveLength(1);
});

it("drops nothing for a Quest, an ordinary stop, or an unfinished Boss", () => {
  expect(awardBossDropOnCompletion(cycle("quest"), "hw:b9:boss")).toBeUndefined();
  expect(awardBossDropOnCompletion(cycle("baseline"), "hw:b9:boss")).toBeUndefined();
  expect(awardBossDropOnCompletion(cycle("boss", "ready"), "hw:b9:boss")).toBeUndefined();
  expect(saved).toHaveLength(0);
});
