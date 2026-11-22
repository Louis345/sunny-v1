import type { Express, Request, Response } from "express";
import { nodeChestKind } from "../engine/companionCareEngine";
import {
  creatureHistoryOf,
  creatureStateOf,
  denStateOf,
  dismissPlanSidekick,
  giveBirthdayGift,
  feedPlanCreature,
  recallPlanSidekick,
  recordBoardFinishedForCreatures,
  renamePlanCreature,
  resolveCreatureEncounter,
  rollPlacedCreatureEncounter,
  startCreatureSession,
} from "../engine/creatureCareEngine";
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import { mirrorCompanionCareToLearningProfile, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import type { CompanionCarePlan, GiftQuestion, PendingCreatureEncounter } from "../shared/companionCareTypes";
import { canRecall, denRoster, type DenFoodId } from "../shared/creatureDenRules";
import type { CreatureScene } from "../shared/creatureEncounters";
import { kioskSkyClockInput, seasonOf, skyMoodForTime } from "../shared/skyClock";
import { familyDay } from "../utils/familyCalendar";

/**
 * Her creatures on the server (owner, 2026-11-08). The companion plan is the one place they are saved;
 * every change loads her chart, applies the creature engine, and saves. A failure is logged and never
 * blocks her completion. Rewards follow the learning: nothing here writes learning evidence.
 */

/** What is out right now, from the kiosk's own clock and calendar (the same sky clock the screens use). */
export function creatureSceneNow(at: Date = new Date()): CreatureScene {
  return { season: seasonOf(at), timeOfDay: skyMoodForTime(kioskSkyClockInput(at)) };
}

/** Distinct items of the marked stop she got right in her latest answers: each one is a throw. */
function correctItemsOnStop(cycle: LearningCycleRecordV2, nodeId: string, itemIds: readonly string[]): number {
  const latest = new Map<string, boolean>();
  for (const row of cycle.observations ?? []) {
    if (!row.sourceId.startsWith(`activity:${nodeId}`)) continue;
    if (itemIds.length && !itemIds.includes(row.itemId)) continue;
    latest.set(row.itemId, row.result?.correct === true);
  }
  return [...latest.values()].filter(Boolean).length;
}

function boardIdFor(cycle: LearningCycleRecordV2, nodeId: string): string {
  return cycle.boards?.find((board) => board.nodeIds.includes(nodeId))?.boardId ?? `cycle-board:${cycle.homeworkId}`;
}

function save(childId: string, update: (plan: CompanionCarePlan) => CompanionCarePlan | null): CompanionCarePlan {
  const chart = getChildChart(childId);
  const before = chart.companionCare.plan;
  const next = update(before);
  if (next && next !== before) {
    saveCompanionCarePlan(chart, next);
    mirrorCompanionCareToLearningProfile(chart, next);
  }
  return next ?? before;
}

/** Roll the encounter the Planner placed on a finished stop: once per stop, at most one per board. */
export function awardCreatureEncounterOnCompletion(
  cycle: LearningCycleRecordV2,
  nodeId: string,
  opts: { roll?: () => number; now?: Date } = {},
): PendingCreatureEncounter | undefined {
  const node = cycle.nodes.find((row) => row.nodeId === nodeId);
  if (!node?.creatureEncounter || node.state !== "completed") return undefined;
  try {
    const now = opts.now ?? new Date();
    let encounter: PendingCreatureEncounter | null = null;
    save(cycle.childId, (plan) => {
      const rolled = rollPlacedCreatureEncounter(plan, {
        boardId: boardIdFor(cycle, nodeId),
        stopId: nodeId,
        plannerPlaced: true,
        stopKind: nodeChestKind(node),
        scene: creatureSceneNow(now),
        nowIso: now.toISOString(),
        roll: opts.roll,
        earnedCharges: correctItemsOnStop(cycle, nodeId, node.creatureEncounter?.itemIds ?? []),
      });
      encounter = rolled.encounter;
      return rolled.plan;
    });
    const found = encounter as PendingCreatureEncounter | null;
    console.log(` 🎮 [learning-cycle-route] [creature-encounter] [${found ? "rolled" : "none"}] child=${cycle.childId} node=${nodeId}${found ? ` creature=${found.creatureId} new=${found.isNew}` : ""}`);
    return found ?? undefined;
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [creature-encounter] [deferred] ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const GIFT_QUESTION_LIMIT = 6;

/** The finished stop's own questions, ready to ask again in the orb game: words to spell, or problems with one answer. */
function giftQuestionsFor(node: LearningCycleRecordV2["nodes"][number]): GiftQuestion[] {
  const contract = node.evidenceContract ?? ({} as Partial<LearningCycleRecordV2["nodes"][number]["evidenceContract"]>);
  const words: GiftQuestion[] = Object.values(contract.spellingItems ?? {})
    .filter((item) => item.word)
    .map((item) => ({ id: item.id, kind: "spelling", prompt: item.word, answer: item.word }));
  const problems: GiftQuestion[] = Object.values(contract.itemContracts ?? {}).flatMap((item): GiftQuestion[] => {
    if (item.response.mode === "numeric") return [{ id: item.id, kind: "math", prompt: item.prompt, answer: String(item.response.expected) }];
    if (item.response.mode === "selection") {
      const right = item.response.options.find((option) => option.correct);
      return right ? [{ id: item.id, kind: "math", prompt: item.prompt, answer: right.label, choices: item.response.options.map((option) => option.label) }] : [];
    }
    return [];
  });
  return [...words, ...problems].slice(0, GIFT_QUESTION_LIMIT);
}

/**
 * Her birthday gift (owner, 2026-11-21): on her birthday, the first stop she finishes opens Orb Catcher with that
 * stop's questions and a Starwhal to catch, once. A stop where the Planner placed its own creature keeps that one.
 */
/** A child who does not play on her birthday still gets the present on her first finished stop this many days after. */
const BELATED_BIRTHDAY_DAYS = 7;

export function awardBirthdayGiftOnCompletion(
  cycle: LearningCycleRecordV2,
  nodeId: string,
  opts: { now?: Date; birthDate?: string } = {},
): PendingCreatureEncounter | undefined {
  try {
    const node = cycle.nodes.find((row) => row.nodeId === nodeId);
    if (!node || node.state !== "completed" || node.creatureEncounter) return undefined;
    const now = opts.now ?? new Date();
    const birthDate = "birthDate" in opts ? opts.birthDate : getChildChart(cycle.childId).demographics?.birthDate;
    const today = familyDay(now);
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return undefined;
    // Her birthday, or her first finished stop in the week after when she did not play that day (owner 11/22).
    const birthdayThisYear = Date.UTC(Number(today.slice(0, 4)), Number(birthDate.slice(5, 7)) - 1, Number(birthDate.slice(8, 10)));
    const daysAfter = Math.round((Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))) - birthdayThisYear) / 86_400_000);
    if (daysAfter < 0 || daysAfter > BELATED_BIRTHDAY_DAYS) return undefined;
    let encounter: PendingCreatureEncounter | null = null;
    save(cycle.childId, (plan) => {
      const given = giveBirthdayGift(plan, {
        year: Number(today.slice(0, 4)),
        boardId: boardIdFor(cycle, nodeId),
        stopId: nodeId,
        questions: giftQuestionsFor(node),
        nowIso: now.toISOString(),
      });
      encounter = given.encounter;
      return given.plan;
    });
    const found = encounter as PendingCreatureEncounter | null;
    console.log(` 🎮 [learning-cycle-route] [birthday-gift] [${found ? "given" : "already-played"}] child=${cycle.childId} node=${nodeId}`);
    return found ?? undefined;
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [birthday-gift] [deferred] ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** A finished board counts once toward milestone creatures. Never blocks her completion. */
export function countBoardForCreatures(cycle: LearningCycleRecordV2, nodeId: string): void {
  try {
    save(cycle.childId, (plan) => recordBoardFinishedForCreatures(plan, boardIdFor(cycle, nodeId)));
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [creature-board] [deferred] ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Her pet by voice (owner 2026-11-22): the companion's `pet` tool. Finds the pet she named by nickname or kind, then
 * uses the den's own recall/dismiss rules. The result is what the companion tells her.
 */
export function summonPetForChild(childId: string, input: { action: "bring" | "dismiss"; name?: string }):
  { ok: boolean; pet?: string; reason?: string; pets: string[] } {
  const plan = getChildChart(childId).companionCare.plan;
  const roster = denRoster(denStateOf(plan));
  const pets = roster.map((row) => row.creature.nickname || row.species.defaultNickname);
  const nameOf = (creatureId: string | null | undefined) => roster.find((row) => row.species.id === creatureId)?.creature.nickname
    ?? roster.find((row) => row.species.id === creatureId)?.species.defaultNickname;
  if (input.action === "dismiss") {
    const current = denStateOf(plan).sidekickId;
    if (!current) return { ok: false, reason: "no_pet_out", pets };
    save(childId, (before) => dismissPlanSidekick(before));
    console.log(` 🎮 [pet] [dismiss] [done] child=${childId} pet=${nameOf(current)}`);
    return { ok: true, pet: nameOf(current), pets };
  }
  if (!roster.length) return { ok: false, reason: "no_pets_yet", pets };
  const key = (value: string) => value.trim().toLowerCase();
  const asked = key(input.name ?? "");
  const match = !asked && roster.length === 1 ? roster[0]
    : roster.find((row) => [row.creature.nickname, row.species.defaultNickname, row.species.speciesName].some((name) => name && key(name) === asked))
      ?? roster.find((row) => asked && [row.creature.nickname, row.species.speciesName].some((name) => name && (key(name).includes(asked) || asked.includes(key(name)))));
  if (!match) {
    console.log(` 🎮 [pet] [bring] [unknown] child=${childId} asked=${JSON.stringify(input.name ?? "")} pets=${pets.join(",")}`);
    return { ok: false, reason: asked ? "no_pet_by_that_name" : "which_pet", pets };
  }
  const pet = match.creature.nickname || match.species.defaultNickname;
  if (!canRecall(match.creature)) {
    console.log(` 🎮 [pet] [bring] [refused] child=${childId} pet=${pet} reason=needs_more_bond bond=${match.creature.bond}`);
    return { ok: false, pet, reason: "needs_more_bond_feed_it_in_her_den", pets };
  }
  save(childId, (before) => recallPlanSidekick(before, match.species.id));
  console.log(` 🎮 [pet] [bring] [done] child=${childId} pet=${pet}`);
  return { ok: true, pet, pets };
}

export function creatureSnapshotForChild(childId: string) {
  const plan = getChildChart(childId).companionCare.plan;
  const state = creatureStateOf(plan);
  return { den: denStateOf(plan), history: creatureHistoryOf(plan), pending: state.pending, scene: creatureSceneNow() };
}

const FOODS = new Set<DenFoodId>(["apple_bite", "star_candy", "mystery_snack"]);
const childIdOf = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function registerCreatureRoutes(app: Express): void {
  app.get("/api/creatures/:childId", (req: Request, res: Response) => {
    const childId = childIdOf(req.params.childId);
    if (!childId) return res.status(400).json({ error: "childId required" });
    return res.json(creatureSnapshotForChild(childId));
  });

  app.post("/api/creatures/encounter", (req: Request, res: Response) => {
    const childId = childIdOf(req.body?.childId);
    const encounterId = typeof req.body?.encounterId === "string" ? req.body.encounterId.trim() : "";
    const outcome = req.body?.outcome;
    if (!childId || !encounterId || (outcome !== "caught" && outcome !== "let_go")) {
      return res.status(400).json({ ok: false, error: "creature_encounter_request_invalid" });
    }
    let result: { duplicate: boolean; missing?: true } = { duplicate: false };
    save(childId, (plan) => {
      const resolved = resolveCreatureEncounter(plan, { encounterId, outcome, nowIso: new Date().toISOString() });
      result = resolved;
      return resolved.duplicate || resolved.missing ? null : resolved.plan;
    });
    if (result.missing) return res.status(404).json({ ok: false, error: "creature_encounter_missing" });
    return res.json({ ok: true, duplicate: result.duplicate });
  });

  app.post("/api/creatures/den", (req: Request, res: Response) => {
    const childId = childIdOf(req.body?.childId);
    const action = req.body?.action;
    const creatureId = typeof req.body?.creatureId === "string" ? req.body.creatureId : "";
    const foodId = req.body?.foodId as DenFoodId;
    const valid =
      childId &&
      (action === "dismiss" ||
        action === "ack_ran_away" ||
        (action === "recall" && creatureId) ||
        (action === "rename" && creatureId && typeof req.body?.name === "string") ||
        (action === "feed" && creatureId && FOODS.has(foodId)));
    if (!valid) return res.status(400).json({ ok: false, error: "creature_den_request_invalid" });
    const nowIso = new Date().toISOString();
    let bondGained: number | undefined;
    let refused: string | undefined;
    const plan = save(childId, (current) => {
      switch (action) {
        case "recall":
          return recallPlanSidekick(current, creatureId);
        case "dismiss":
          return dismissPlanSidekick(current);
        case "rename":
          return renamePlanCreature(current, creatureId, String(req.body.name));
        case "ack_ran_away": {
          const state = creatureStateOf(current);
          return { ...current, creatures: { ...state, den: { ...state.den, ranAwayId: null } } };
        }
        case "feed": {
          const fed = feedPlanCreature(current, { creatureId, foodId, nowIso });
          if (!fed.ok) {
            refused = fed.reason;
            return null;
          }
          bondGained = fed.bondGained;
          return fed.plan;
        }
        default:
          return null;
      }
    });
    console.log(` 🎮 [creatures] [den] [${refused ? "refused" : "done"}] child=${childId} action=${action}${refused ? ` reason=${refused}` : ""}`);
    if (refused) return res.json({ ok: false, reason: refused });
    return res.json({ ok: true, ...(bondGained !== undefined ? { bondGained } : {}), den: denStateOf(plan) });
  });

  // Run once when her session starts: bond fades for days away; a neglected sidekick runs home.
  app.post("/api/creatures/session-start", (req: Request, res: Response) => {
    const childId = childIdOf(req.body?.childId);
    if (!childId) return res.status(400).json({ ok: false, error: "childId required" });
    let ranAwayId: string | null = null;
    save(childId, (plan) => {
      const started = startCreatureSession(plan, new Date().toISOString());
      ranAwayId = started.ranAwayId;
      return started.plan;
    });
    console.log(` 🎮 [creatures] [session-start] [done] child=${childId} ranAway=${ranAwayId ?? "none"}`);
    return res.json({ ok: true, ranAwayId });
  });
}
