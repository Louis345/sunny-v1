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
}

export const MAX_BOND = 100;
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

export function recallSidekick(state: DenState, creatureId: string): DenState {
  if (!state.creatures.some((entry) => entry.creatureId === creatureId)) {
    console.warn(` 🎮 [creature-den] [recall] [refused] creature=${creatureId} reason=not_caught`);
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
