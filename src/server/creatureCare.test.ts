import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { awardBirthdayGiftOnCompletion, awardCreatureEncounterOnCompletion, countBoardForCreatures, summonPetForChild } from "./creatureCare";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
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
    expect(first).toMatchObject({ creatureId: "lumipuff", isNew: true, reason: "starter", charges: 1 }); // no answers recorded: one throw
    expect(awardCreatureEncounterOnCompletion(cycle(true), "hw:n1")).toEqual(first);
    expect(saved).toHaveLength(1);
  });

  it("counts a finished board once toward milestone creatures", () => {
    countBoardForCreatures(cycle(false), "hw:n1");
    countBoardForCreatures(cycle(false), "hw:n2");
    expect(creatureHistoryOf(saved.at(-1)!).boardsCompleted).toBe(1);
  });
});

describe("charges come from the words she got right on that stop (owner, 2026-11-08)", () => {
  const scored = (correct: boolean[]) =>
    ({
      childId: "demo-pashley",
      homeworkId: "hw",
      nodes: [{ nodeId: "hw:n1", role: "baseline", state: "completed", creatureEncounter: { reason: "near secure", itemIds: ["i1", "i2", "i3", "i4"] } }],
      observations: correct.map((ok, index) => ({ observationId: `o${index}`, sourceId: "activity:hw:n1:recall", itemId: `i${index + 1}`, result: { correct: ok } })),
    }) as never;

  it("one charge per word right, capped by the creature's rarity", () => {
    expect(awardCreatureEncounterOnCompletion(scored([true, true, false, false]), "hw:n1")?.charges).toBe(2);
  });

  it("caps at the rarity's charges and always gives at least one throw", () => {
    saved.length = 0;
    expect(awardCreatureEncounterOnCompletion(scored([true, true, true, true]), "hw:n1")?.charges).toBe(3);
    saved.length = 0;
    expect(awardCreatureEncounterOnCompletion(scored([false, false, false, false]), "hw:n1")?.charges).toBe(1);
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

describe("birthday gift: Orb Catcher with the words she just practiced (owner, 2026-11-21)", () => {
  const BIRTHDAY = new Date("2026-11-21T15:00:00Z");
  const spellingStop = (marked = false) =>
    ({
      childId: "demo-pashley",
      homeworkId: "hw",
      nodes: [{
        nodeId: "hw:n1", role: "baseline", state: "completed",
        ...(marked ? { creatureEncounter: { reason: "near secure" } } : {}),
        evidenceContract: { spellingItems: {
          a: { domain: "spelling", id: "a", wordId: "w1", word: "carnival" },
          b: { domain: "spelling", id: "b", wordId: "w2", word: "pardon" },
        } },
      }],
    }) as never;
  const mathStop = () =>
    ({
      childId: "demo-pashley",
      homeworkId: "hw",
      nodes: [{
        nodeId: "hw:n1", role: "baseline", state: "completed",
        evidenceContract: { itemContracts: {
          m1: { id: "m1", prompt: "Half of $8?", response: { mode: "numeric", expected: 4, unit: "$" } },
          m2: { id: "m2", prompt: "Which is half of 10?", response: { mode: "selection", options: [{ id: "x", label: "5", correct: true }, { id: "y", label: "2", correct: false }] } },
          m3: { id: "m3", prompt: "Explain why", response: { mode: "explanation", rubric: ["r"] } },
        } },
      }],
    }) as never;
  const opts = { now: BIRTHDAY, birthDate: "2017-11-21" };
  beforeEach(() => vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "America/New_York"));
  afterEach(() => vi.unstubAllEnvs());

  it("on her birthday, the stop she finishes opens a gift: a Starwhal and her own words to load the orbs", () => {
    const gift = awardBirthdayGiftOnCompletion(spellingStop(), "hw:n1", opts);
    expect(gift).toMatchObject({ encounterId: "birthday:2026", creatureId: "starwhal", gift: "birthday" });
    expect(gift?.questions).toEqual([
      { id: "a", kind: "spelling", prompt: "carnival", answer: "carnival" },
      { id: "b", kind: "spelling", prompt: "pardon", answer: "pardon" },
    ]);
    expect(creatureHistoryOf(saved.at(-1)!).seenIds).toContain("starwhal");
  });

  it("only once: it waits until she plays it, and never comes back after", async () => {
    const first = awardBirthdayGiftOnCompletion(spellingStop(), "hw:n1", opts);
    expect(awardBirthdayGiftOnCompletion(spellingStop(), "hw:n1", opts)).toEqual(first);
    const done = await call("POST", "/api/creatures/encounter", { childId: "demo-pashley", encounterId: "birthday:2026", outcome: "caught" });
    expect(done.body).toEqual({ ok: true, duplicate: false });
    expect(denStateOf(saved.at(-1)!).creatures.map((creature) => creature.creatureId)).toContain("starwhal");
    expect(awardBirthdayGiftOnCompletion(spellingStop(), "hw:n1", opts)).toBeUndefined();
  });

  it("no gift on any other day, without a birthday on file, or where the Planner placed its own creature", () => {
    expect(awardBirthdayGiftOnCompletion(spellingStop(), "hw:n1", { ...opts, now: new Date("2026-11-22T15:00:00Z") })).toBeUndefined();
    expect(awardBirthdayGiftOnCompletion(spellingStop(), "hw:n1", { ...opts, birthDate: undefined })).toBeUndefined();
    expect(awardBirthdayGiftOnCompletion(spellingStop(true), "hw:n1", opts)).toBeUndefined();
    expect(saved).toHaveLength(0);
  });

  it("a math stop gives its own problems: a number answer, or the choices she saw", () => {
    expect(awardBirthdayGiftOnCompletion(mathStop(), "hw:n1", opts)?.questions).toEqual([
      { id: "m1", kind: "math", prompt: "Half of $8?", answer: "4" },
      { id: "m2", kind: "math", prompt: "Which is half of 10?", answer: "5", choices: ["5", "2"] },
    ]);
  });
});


// Owner 11/22: "Elli, bring out Sparky" / "Elli, dismiss Sparky": one companion tool, the same for every companion.
// The den already had a sidekick (recall/dismiss by tapping); only her voice could not reach it.
describe("her companion brings out or sends home her pet by voice", () => {
  async function caughtAndNamed(name: string) {
    const encounter = awardCreatureEncounterOnCompletion(cycle(true), "hw:n1")!;
    await call("POST", "/api/creatures/encounter", { childId: "demo-pashley", encounterId: encounter.encounterId, outcome: "caught" });
    await call("POST", "/api/creatures/den", { childId: "demo-pashley", action: "rename", creatureId: "lumipuff", name });
  }

  it("brings out the pet she names, by its nickname or its kind, and sends it home", async () => {
    await caughtAndNamed("Sparky");
    expect(summonPetForChild("demo-pashley", { action: "bring", name: "sparky" })).toMatchObject({ ok: true, pet: "Sparky" });
    expect(denStateOf(saved.at(-1)!).sidekickId).toBe("lumipuff");
    expect(summonPetForChild("demo-pashley", { action: "dismiss" })).toMatchObject({ ok: true, pet: "Sparky" });
    expect(denStateOf(saved.at(-1)!).sidekickId).toBeNull();
    expect(summonPetForChild("demo-pashley", { action: "bring", name: "Lumipuff" })).toMatchObject({ ok: true, pet: "Sparky" });
  });

  it("tells the companion her pets' names when it cannot tell which one she means", async () => {
    await caughtAndNamed("Sparky");
    expect(summonPetForChild("demo-pashley", { action: "bring", name: "Rex" })).toMatchObject({ ok: false, reason: "no_pet_by_that_name", pets: ["Sparky"] });
  });

  it("says so when she has no pets yet", () => {
    expect(summonPetForChild("demo-pashley", { action: "bring", name: "Sparky" })).toMatchObject({ ok: false, reason: "no_pets_yet", pets: [] });
  });

  it("is one capability every companion can use", () => {
    const pet = COMPANION_CAPABILITIES.get("pet");
    expect(pet?.payloadSchema.safeParse({ action: "bring", name: "Sparky" }).success).toBe(true);
    expect(pet?.payloadSchema.safeParse({ action: "dismiss" }).success).toBe(true);
    expect(pet?.payloadSchema.safeParse({ action: "dance" }).success).toBe(false);
  });
});

describe("the call companion is not offered a pet it cannot show", () => {
  it("leaves pet out of the FaceTime tool, keeps it for homework sessions", async () => {
    const { getShowroomCompanionActTools } = await import("./companionShowroomTalk");
    const tool = getShowroomCompanionActTools()[0] as { input_schema: { properties: { type: { enum: string[] } } } };
    expect(tool.input_schema.properties.type.enum).not.toContain("pet");
    expect(COMPANION_CAPABILITIES.has("pet")).toBe(true);
  });
});
