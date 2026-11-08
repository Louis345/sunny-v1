import type { Express, Request, Response } from "express";
import { nodeChestKind } from "../engine/companionCareEngine";
import {
  creatureHistoryOf,
  creatureStateOf,
  denStateOf,
  dismissPlanSidekick,
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
import type { CompanionCarePlan, PendingCreatureEncounter } from "../shared/companionCareTypes";
import type { DenFoodId } from "../shared/creatureDenRules";
import type { CreatureScene } from "../shared/creatureEncounters";
import { kioskSkyClockInput, seasonOf, skyMoodForTime } from "../shared/skyClock";

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

/** A finished board counts once toward milestone creatures. Never blocks her completion. */
export function countBoardForCreatures(cycle: LearningCycleRecordV2, nodeId: string): void {
  try {
    save(cycle.childId, (plan) => recordBoardFinishedForCreatures(plan, boardIdFor(cycle, nodeId)));
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [creature-board] [deferred] ${error instanceof Error ? error.message : String(error)}`);
  }
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
