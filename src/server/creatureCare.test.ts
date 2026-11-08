import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStarterCompanionCarePlan } from "../engine/companionCareEngine";
import { creatureHistoryOf, denStateOf } from "../engine/creatureCareEngine";
import type { CompanionCarePlan } from "../shared/companionCareTypes";

const saved: CompanionCarePlan[] = [];
vi.mock("../profiles/childChart", () => ({
  getChildChart: vi.fn(() => ({
    childId: "demo-pashley",
    companionCare: { plan: saved.at(-1) ?? createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" }) },
  })),
}));
vi.mock("../profiles/companionCarePlan", () => ({
  saveCompanionCarePlan: vi.fn((_chart, plan) => saved.push(plan)),
  mirrorCompanionCareToLearningProfile: vi.fn(),
  loadCompanionCarePlanForChart: vi.fn(),
}));
import { awardCreatureEncounterOnCompletion, countBoardForCreatures } from "./creatureCare";
import { setupRoutes } from "./routes";

const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => {
  saved.length = 0;
  servers.splice(0).forEach((server) => server.close());
  vi.clearAllMocks();
});

async function call(method: "GET" | "POST", url: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  setupRoutes(app);
  const server = app.listen(0);
  servers.push(server);
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: (await response.json()) as any };
}

const cycle = (marked: boolean, state = "completed") =>
  ({
    childId: "demo-pashley",
    homeworkId: "hw",
    nodes: [
      { nodeId: "hw:n1", role: "baseline", state, ...(marked ? { creatureEncounter: { reason: "three words near mastery" } } : {}) },
      { nodeId: "hw:n2", role: "baseline", state: "completed" },
    ],
  }) as never;

describe("creature encounter at a finished stop", () => {
  // Owner, 2026-11-08: the Planner chooses the moment; code caps one per board and rolls once.
  it("rolls only for a finished stop the Planner marked, once, and shows the same creature on replay", () => {
    expect(awardCreatureEncounterOnCompletion(cycle(false), "hw:n1")).toBeUndefined();
    expect(awardCreatureEncounterOnCompletion(cycle(true, "active"), "hw:n1")).toBeUndefined();
    expect(saved).toHaveLength(0);
    const first = awardCreatureEncounterOnCompletion(cycle(true), "hw:n1");
    expect(first).toMatchObject({ creatureId: "lumipuff", isNew: true, reason: "starter", charges: 3 });
    expect(awardCreatureEncounterOnCompletion(cycle(true), "hw:n1")).toEqual(first);
    expect(saved).toHaveLength(1);
  });

  it("counts a finished board once toward milestone creatures", () => {
    countBoardForCreatures(cycle(false), "hw:n1");
    countBoardForCreatures(cycle(false), "hw:n2");
    expect(creatureHistoryOf(saved.at(-1)!).boardsCompleted).toBe(1);
  });
});

describe("creature routes", () => {
  it("reads her creatures: den, food, what she has seen, and any encounter waiting", async () => {
    awardCreatureEncounterOnCompletion(cycle(true), "hw:n1");
    const { status, body } = await call("GET", "/api/creatures/demo-pashley");
    expect(status).toBe(200);
    expect(body.pending).toEqual([expect.objectContaining({ creatureId: "lumipuff" })]);
    expect(body.history.seenIds).toContain("lumipuff");
    expect(body.den.food.apple_bite).toBeGreaterThan(0);
    expect(body.scene).toMatchObject({ season: expect.any(String), timeOfDay: expect.any(String) });
  });

  it("records her catch once, then she can recall, rename and feed it", async () => {
    const encounter = awardCreatureEncounterOnCompletion(cycle(true), "hw:n1")!;
    expect((await call("POST", "/api/creatures/encounter", { childId: "demo-pashley", encounterId: encounter.encounterId, outcome: "caught" })).body).toMatchObject({ ok: true, duplicate: false });
    expect((await call("POST", "/api/creatures/encounter", { childId: "demo-pashley", encounterId: encounter.encounterId, outcome: "caught" })).body).toMatchObject({ ok: true, duplicate: true });
    expect(denStateOf(saved.at(-1)!).creatures).toHaveLength(1);

    expect((await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "recall", creatureId: "lumipuff" })).body).toMatchObject({ ok: true });
    expect(denStateOf(saved.at(-1)!).sidekickId).toBe("lumipuff");
    await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "rename", creatureId: "lumipuff", name: "Bubbles" });
    expect(denStateOf(saved.at(-1)!).creatures[0].nickname).toBe("Bubbles");
    const fed = await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "feed", creatureId: "lumipuff", foodId: "apple_bite" });
    expect(fed.body).toMatchObject({ ok: true, bondGained: 3 });
    await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "dismiss" });
    expect(denStateOf(saved.at(-1)!).sidekickId).toBeNull();
  });

  it("starts a session for her creatures and reports a sidekick that ran home", async () => {
    const { status, body } = await call("POST", "/api/creatures/session-start", { childId: "demo-pashley" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, ranAwayId: null });
  });

  it("refuses malformed requests before touching her chart", async () => {
    expect((await call("POST", "/api/creatures/encounter", { childId: "demo-pashley", encounterId: "x", outcome: "kept_forever" })).status).toBe(400);
    expect((await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "sell" })).status).toBe(400);
    expect((await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "feed", creatureId: "lumipuff", foodId: "gold_bar" })).status).toBe(400);
    expect(saved).toHaveLength(0);
  });
});
