import { COMPANION_STORE_ITEMS } from "../../../src/engine/companionCareEngine";
import type { CompanionStoreItem } from "../../../src/shared/companionCareTypes";
import { CREATURE_CATALOG, type CapturedMonsterConfig } from "./capturedMonsterCatalog";

/**
 * Her creature den (draft, owner 2026-11-08), modelled on Pokemon: every creature she caught lives here,
 * one at a time can be recalled as her sidekick and sent home again, and care costs the same store food
 * Elli eats, so coins mean something. Pure rules; saving to her chart comes later.
 */
export type DenFoodId = CompanionStoreItem["id"];

export interface DenCreature {
  creatureId: string;
  nickname: string;
  /** 0..MAX_BOND: grows with care. */
  bond: number;
  caughtAt: string;
}

export interface DenState {
  creatures: DenCreature[];
  /** The one creature riding along with Elli, or null when everyone is home. */
  sidekickId: string | null;
  /** Food in her inventory, by store item id (shared with Elli's food). */
  food: Partial<Record<DenFoodId, number>>;
  /** When she last started a session; bond fades from here. */
  lastVisitAt?: string;
  /** A sidekick that ran home at the start of this session, until she reads the note. */
  ranAwayId?: string | null;
}

export const MAX_BOND = 100;
/** New catches start here, above the recall line, so she can bring a new friend along right away. */
export const DEN_STARTING_BOND = 35;
/**
 * Bond has stakes (owner, 2026-11-08), using the same shape as Elli's own bond: after more than two days
 * away it fades a little each day. A sidekick below RUNAWAY_BOND runs home at the start of a session (never
 * mid-homework), and a creature cannot be recalled until care brings it back to RECALL_BOND.
 */
export const BOND_DECAY_GRACE_DAYS = 2;
export const BOND_DECAY_PER_DAY = 3;
export const RUNAWAY_BOND = 20;
export const RECALL_BOND = 30;
export const MAX_NICKNAME_LENGTH = 16;
/** Bond each store food gives a creature: pricier food, bigger bond. */
export const DEN_FOOD_BOND: Record<DenFoodId, number> = { apple_bite: 3, star_candy: 6, mystery_snack: 10 };
export const DEN_FOODS: readonly CompanionStoreItem[] = COMPANION_STORE_ITEMS;

export interface DenRosterEntry {
  species: CapturedMonsterConfig;
  creature: DenCreature;
  isSidekick: boolean;
}

export function denRoster(state: DenState): DenRosterEntry[] {
  return CREATURE_CATALOG.flatMap((species) => {
    const creature = state.creatures.find((entry) => entry.creatureId === species.id);
    return creature ? [{ species, creature, isSidekick: state.sidekickId === species.id }] : [];
  });
}

export function canRecall(creature: DenCreature): boolean {
  return creature.bond >= RECALL_BOND;
}

export function recallSidekick(state: DenState, creatureId: string): DenState {
  const creature = state.creatures.find((entry) => entry.creatureId === creatureId);
  if (!creature) {
    console.warn(` 🎮 [creature-den] [recall] [refused] creature=${creatureId} reason=not_caught`);
    return state;
  }
  if (!canRecall(creature)) {
    console.warn(` 🎮 [creature-den] [recall] [refused] creature=${creatureId} reason=low_bond bond=${creature.bond}`);
    return state;
  }
  console.log(` 🎮 [creature-den] [recall] [done] creature=${creatureId} sentHome=${state.sidekickId ?? "none"}`);
  return { ...state, sidekickId: creatureId };
}

export function dismissSidekick(state: DenState): DenState {
  console.log(` 🎮 [creature-den] [dismiss] [done] creature=${state.sidekickId ?? "none"}`);
  return { ...state, sidekickId: null };
}

export type DenFeedResult =
  | { ok: true; state: DenState; bondGained: number }
  | { ok: false; reason: "no_food" | "not_caught"; state: DenState };

export function feedDenCreature(state: DenState, creatureId: string, foodId: DenFoodId): DenFeedResult {
  const target = state.creatures.find((entry) => entry.creatureId === creatureId);
  if (!target) return { ok: false, reason: "not_caught", state };
  const owned = state.food[foodId] ?? 0;
  if (owned <= 0) return { ok: false, reason: "no_food", state };
  const bond = Math.min(MAX_BOND, target.bond + DEN_FOOD_BOND[foodId]);
  console.log(` 🎮 [creature-den] [feed] [done] creature=${creatureId} food=${foodId} bond=${bond}`);
  return {
    ok: true,
    bondGained: bond - target.bond,
    state: {
      ...state,
      food: { ...state.food, [foodId]: owned - 1 },
      creatures: state.creatures.map((entry) => (entry.creatureId === creatureId ? { ...entry, bond } : entry)),
    },
  };
}

/** Run once when a session starts: fade bond for time away, then send a neglected sidekick home. */
export function startDenSession(state: DenState, nowIso: string): { state: DenState; ranAwayId: string | null } {
  const last = state.lastVisitAt ? Date.parse(state.lastVisitAt) : Number.NaN;
  const daysAway = Number.isFinite(last) ? Math.max(0, (Date.parse(nowIso) - last) / 86_400_000) : 0;
  const fade = daysAway > BOND_DECAY_GRACE_DAYS ? Math.round(BOND_DECAY_PER_DAY * daysAway) : 0;
  const creatures = fade
    ? state.creatures.map((entry) => ({ ...entry, bond: Math.max(0, entry.bond - fade) }))
    : state.creatures;
  const sidekick = creatures.find((entry) => entry.creatureId === state.sidekickId);
  const ranAwayId = sidekick && sidekick.bond < RUNAWAY_BOND ? sidekick.creatureId : null;
  console.log(
    ` 🎮 [creature-den] [session-start] [done] daysAway=${daysAway.toFixed(1)} fade=${fade} ranAway=${ranAwayId ?? "none"}`,
  );
  return {
    ranAwayId,
    state: {
      ...state,
      creatures,
      lastVisitAt: nowIso,
      sidekickId: ranAwayId ? null : state.sidekickId,
      ranAwayId: ranAwayId ?? state.ranAwayId ?? null,
    },
  };
}

export function renameDenCreature(state: DenState, creatureId: string, name: string): DenState {
  const nickname = name.trim().slice(0, MAX_NICKNAME_LENGTH);
  if (!nickname) return state;
  console.log(` 🎮 [creature-den] [rename] [done] creature=${creatureId}`);
  return {
    ...state,
    creatures: state.creatures.map((entry) => (entry.creatureId === creatureId ? { ...entry, nickname } : entry)),
  };
}
