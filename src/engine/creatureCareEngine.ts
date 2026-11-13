import { CREATURE_CATALOG, type CreatureStopKind } from "../shared/capturedMonsterCatalog";
import {
  DEN_STARTING_BOND,
  MAX_BOND,
  dismissSidekick,
  feedDenCreature,
  recallSidekick,
  renameDenCreature,
  startDenSession,
  type DenFoodId,
  type DenState,
} from "../shared/creatureDenRules";
import {
  rollCreatureEncounter,
  type CreatureEncounterHistory,
  type CreatureScene,
} from "../shared/creatureEncounters";
import type { CompanionCarePlan, CreaturePlanState, PendingCreatureEncounter } from "../shared/companionCareTypes";

/**
 * Her creatures inside the companion plan (owner, 2026-11-08): the one place the den, what she has seen,
 * milestones and try lockouts are kept. Pure functions; the server saves the plan. Rewards follow the
 * learning: nothing here chooses an educational step or writes learning evidence.
 */

/** Catching a friend she already has again builds bond instead of a duplicate. */
export const FAMILIAR_CATCH_BOND = 5;
/** Law 2: receipt lists are capped so the saved plan cannot grow without bound. */
const RECEIPTS_KEPT = 200;

const EMPTY: CreaturePlanState = {
  den: { creatures: [], sidekickId: null },
  seenIds: [],
  boardsCompleted: 0,
  countedBoardIds: [],
  encounterBoardIds: [],
  lastTryAt: {},
  pending: [],
  resolvedEncounterIds: [],
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/** A saved creature section, cleaned up on load (unknown fields dropped, numbers clamped). */
export function normalizeCreatureState(raw: unknown): CreaturePlanState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<CreaturePlanState>;
  const den = (value.den ?? {}) as Partial<CreaturePlanState["den"]>;
  const lastTryAt: Record<string, string> = {};
  for (const [id, iso] of Object.entries(value.lastTryAt ?? {})) if (typeof iso === "string") lastTryAt[id] = iso;
  return {
    den: {
      creatures: (Array.isArray(den.creatures) ? den.creatures : [])
        .filter((entry) => entry && typeof entry.creatureId === "string")
        .map((entry) => ({
          creatureId: entry.creatureId,
          nickname: String(entry.nickname ?? ""),
          bond: Math.max(0, Math.min(MAX_BOND, Math.round(Number(entry.bond) || 0))),
          caughtAt: String(entry.caughtAt ?? ""),
        })),
      sidekickId: typeof den.sidekickId === "string" ? den.sidekickId : null,
      ...(typeof den.lastVisitAt === "string" ? { lastVisitAt: den.lastVisitAt } : {}),
      ...(typeof den.ranAwayId === "string" ? { ranAwayId: den.ranAwayId } : {}),
    },
    seenIds: strings(value.seenIds),
    boardsCompleted: Math.max(0, Math.floor(Number(value.boardsCompleted) || 0)),
    countedBoardIds: strings(value.countedBoardIds),
    encounterBoardIds: strings(value.encounterBoardIds),
    lastTryAt,
    pending: (Array.isArray(value.pending) ? value.pending : []).filter(
      (entry): entry is PendingCreatureEncounter => Boolean(entry) && typeof entry.encounterId === "string" && typeof entry.creatureId === "string",
    ).map((entry) => ({ ...entry })),
    resolvedEncounterIds: strings(value.resolvedEncounterIds),
  };
}

export function creatureStateOf(plan: CompanionCarePlan): CreaturePlanState {
  return normalizeCreatureState(plan.creatures) ?? structuredClone(EMPTY);
}

function withCreatures(plan: CompanionCarePlan, creatures: CreaturePlanState, nowIso?: string): CompanionCarePlan {
  return { ...plan, creatures, ...(nowIso ? { updatedAt: nowIso } : {}) };
}

const keep = (ids: string[], id: string) => (ids.includes(id) ? ids : [...ids, id].slice(-RECEIPTS_KEPT));

/** The den as the shared den rules see it: her creatures plus the store food she owns. */
export function denStateOf(plan: CompanionCarePlan): DenState {
  const state = creatureStateOf(plan);
  const food: DenState["food"] = {};
  for (const item of plan.inventory.food) {
    if (item.id === "apple_bite" || item.id === "star_candy" || item.id === "mystery_snack") food[item.id] = Math.max(0, item.quantity);
  }
  return { ...state.den, food };
}

function withDen(plan: CompanionCarePlan, den: DenState): CompanionCarePlan {
  const state = creatureStateOf(plan);
  const { food: _food, ...saved } = den;
  return withCreatures(plan, { ...state, den: { ...saved, sidekickId: saved.sidekickId ?? null } });
}

export function creatureHistoryOf(plan: CompanionCarePlan): CreatureEncounterHistory {
  const state = creatureStateOf(plan);
  return {
    seenIds: state.seenIds,
    caughtIds: state.den.creatures.map((creature) => creature.creatureId),
    boardsCompleted: state.boardsCompleted,
    encountersThisBoard: 0,
    lastTryAt: state.lastTryAt,
  };
}

/** Roll the encounter the Planner placed on a stop: once per stop, at most one per board. */
export function rollPlacedCreatureEncounter(
  plan: CompanionCarePlan,
  input: {
    boardId: string;
    stopId: string;
    plannerPlaced: boolean;
    stopKind: CreatureStopKind;
    scene: CreatureScene;
    nowIso: string;
    roll?: () => number;
    /** Words she got right on this stop: one throw each, capped by the creature's rarity, at least one. */
    earnedCharges?: number;
  },
): { plan: CompanionCarePlan; encounter: PendingCreatureEncounter | null } {
  if (!input.plannerPlaced) return { plan, encounter: null };
  const state = creatureStateOf(plan);
  const encounterId = `${input.boardId}:${input.stopId}`;
  const prior = state.pending.find((entry) => entry.encounterId === encounterId);
  if (prior) return { plan, encounter: { ...prior } };
  if (state.encounterBoardIds.includes(input.boardId) || state.resolvedEncounterIds.includes(encounterId)) {
    return { plan, encounter: null };
  }
  const result = rollCreatureEncounter({
    plannerPlaced: true,
    stopKind: input.stopKind,
    scene: input.scene,
    nowIso: input.nowIso,
    history: creatureHistoryOf(plan),
    roll: input.roll,
  });
  if (!result.appeared || !result.creature) {
    console.log(` 🎮 [creature-care] [encounter] [none] board=${input.boardId} reason=${result.reason}`);
    return { plan: withCreatures(plan, { ...state, lastTryAt: result.tries }, input.nowIso), encounter: null };
  }
  const encounter: PendingCreatureEncounter = {
    encounterId,
    boardId: input.boardId,
    stopId: input.stopId,
    creatureId: result.creature.id,
    charges: input.earnedCharges === undefined
      ? result.charges ?? 3
      : Math.max(1, Math.min(result.charges ?? 3, Math.floor(input.earnedCharges))),
    isNew: result.isNew,
    reason: result.reason,
    rolledAt: input.nowIso,
  };
  console.log(` 🎮 [creature-care] [encounter] [rolled] board=${input.boardId} creature=${encounter.creatureId} reason=${result.reason} new=${result.isNew}`);
  return {
    encounter,
    plan: withCreatures(
      plan,
      {
        ...state,
        lastTryAt: result.tries,
        seenIds: keep(state.seenIds, encounter.creatureId),
        encounterBoardIds: keep(state.encounterBoardIds, input.boardId),
        pending: [...state.pending, encounter],
      },
      input.nowIso,
    ),
  };
}

/** Her catch or let-go for a rolled encounter, recorded once. */
export function resolveCreatureEncounter(
  plan: CompanionCarePlan,
  input: { encounterId: string; outcome: "caught" | "let_go"; nowIso: string },
): { plan: CompanionCarePlan; duplicate: boolean; missing?: true } {
  const state = creatureStateOf(plan);
  if (state.resolvedEncounterIds.includes(input.encounterId)) return { plan, duplicate: true };
  const encounter = state.pending.find((entry) => entry.encounterId === input.encounterId);
  if (!encounter) {
    console.warn(` 🎮 [creature-care] [resolve] [refused] encounter=${input.encounterId} reason=not_pending`);
    return { plan, duplicate: false, missing: true };
  }
  let creatures = state.den.creatures;
  if (input.outcome === "caught") {
    const owned = creatures.find((creature) => creature.creatureId === encounter.creatureId);
    const species = CREATURE_CATALOG.find((entry) => entry.id === encounter.creatureId);
    creatures = owned
      ? creatures.map((creature) =>
          creature.creatureId === encounter.creatureId
            ? { ...creature, bond: Math.min(MAX_BOND, creature.bond + FAMILIAR_CATCH_BOND) }
            : creature,
        )
      : [...creatures, { creatureId: encounter.creatureId, nickname: species?.defaultNickname ?? encounter.creatureId, bond: DEN_STARTING_BOND, caughtAt: input.nowIso }];
  }
  console.log(` 🎮 [creature-care] [resolve] [${input.outcome}] creature=${encounter.creatureId}`);
  return {
    duplicate: false,
    plan: withCreatures(
      plan,
      {
        ...state,
        den: { ...state.den, creatures },
        pending: state.pending.filter((entry) => entry.encounterId !== input.encounterId),
        resolvedEncounterIds: keep(state.resolvedEncounterIds, input.encounterId),
      },
      input.nowIso,
    ),
  };
}

/** A finished board counts once toward milestone creatures. */
export function recordBoardFinishedForCreatures(plan: CompanionCarePlan, boardId: string): CompanionCarePlan {
  const state = creatureStateOf(plan);
  if (state.countedBoardIds.includes(boardId)) return plan;
  return withCreatures(plan, {
    ...state,
    boardsCompleted: state.boardsCompleted + 1,
    countedBoardIds: keep(state.countedBoardIds, boardId),
  });
}

/** Feed a creature with store food from her real inventory (the same food Elli eats). */
export function feedPlanCreature(
  plan: CompanionCarePlan,
  input: { creatureId: string; foodId: DenFoodId; nowIso: string },
): { ok: true; plan: CompanionCarePlan; bondGained: number } | { ok: false; reason: "no_food" | "not_caught" } {
  const result = feedDenCreature(denStateOf(plan), input.creatureId, input.foodId);
  if (!result.ok) return { ok: false, reason: result.reason };
  const fed = withDen(plan, result.state);
  return {
    ok: true,
    bondGained: result.bondGained,
    plan: {
      ...fed,
      inventory: {
        ...fed.inventory,
        food: fed.inventory.food.map((item) => (item.id === input.foodId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item)),
      },
      updatedAt: input.nowIso,
    },
  };
}

export function recallPlanSidekick(plan: CompanionCarePlan, creatureId: string): CompanionCarePlan {
  return withDen(plan, recallSidekick(denStateOf(plan), creatureId));
}

export function dismissPlanSidekick(plan: CompanionCarePlan): CompanionCarePlan {
  return withDen(plan, dismissSidekick(denStateOf(plan)));
}

export function renamePlanCreature(plan: CompanionCarePlan, creatureId: string, name: string): CompanionCarePlan {
  return withDen(plan, renameDenCreature(denStateOf(plan), creatureId, name));
}

/** Run once when a session starts: bond fades for days away; a neglected sidekick runs home. */
export function startCreatureSession(plan: CompanionCarePlan, nowIso: string): { plan: CompanionCarePlan; ranAwayId: string | null } {
  const result = startDenSession(denStateOf(plan), nowIso);
  return { plan: withDen(plan, result.state), ranAwayId: result.ranAwayId };
}
