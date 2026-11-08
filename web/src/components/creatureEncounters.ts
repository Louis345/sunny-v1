import type { RewardRarity } from "../../../src/shared/rewardCatalog";
import {
  CREATURE_CATALOG,
  type CapturedMonsterConfig,
  type CreatureStopKind,
} from "./capturedMonsterCatalog";
import type { SparkOrbSeason, SparkOrbTimeOfDay } from "./sparkOrbScenes";

/**
 * When a creature shows up (draft, owner to tune). A reward that follows the learning: it is rolled after a
 * stop is finished, never chooses an educational step, and never touches learning evidence.
 *
 * - Rare stays rare: a stop without a creature does NOT raise the next chance (no pity, unlike chests).
 * - One guaranteed sighting a week, so she is never shut out for long.
 * - At most one creature per board, so it feels like an event.
 * - Rarer creatures need more answers to charge the orb: the stakes.
 */
export const ENCOUNTER_CHANCE_BY_STOP: Record<CreatureStopKind, number> = {
  common: 0.05,
  rare: 0.1,
  epic: 0.2,
  legendary: 0.35,
  mystery: 0.15,
};
/** Which rarity shows up, once something does (same shape as the approved unlock odds 60/25/12/3). */
export const CREATURE_RARITY_WEIGHTS: Record<RewardRarity, number> = { common: 60, rare: 25, epic: 12, legendary: 3 };
export const CHARGES_BY_RARITY: Record<RewardRarity, number> = { common: 3, rare: 4, epic: 5, legendary: 6 };
export const WEEKLY_GUARANTEE_DAYS = 7;
export const MAX_ENCOUNTERS_PER_BOARD = 1;

const RARITIES: RewardRarity[] = ["common", "rare", "epic", "legendary"];
const DAY_MS = 86_400_000;

export interface CreatureScene {
  season: SparkOrbSeason;
  timeOfDay: SparkOrbTimeOfDay;
}

export interface CreatureEncounterHistory {
  lastSightingAt?: string;
  sightingsThisBoard: number;
}

export interface CreatureEncounterRoll {
  appeared: boolean;
  reason: "rolled" | "weekly_guarantee" | "no_luck" | "board_limit" | "none_out";
  creature?: CapturedMonsterConfig;
  charges?: number;
}

export function creatureAppearsNow(
  species: CapturedMonsterConfig,
  context: CreatureScene & { stopKind?: CreatureStopKind },
): boolean {
  const { timesOfDay, seasons, stops } = species.habitat;
  if (timesOfDay?.length && !timesOfDay.includes(context.timeOfDay)) return false;
  if (seasons?.length && !seasons.includes(context.season)) return false;
  if (stops?.length && context.stopKind && !stops.includes(context.stopKind)) return false;
  return true;
}

function pickSpecies(available: readonly CapturedMonsterConfig[], roll: () => number): CapturedMonsterConfig {
  const present = RARITIES.filter((rarity) => available.some((species) => species.rarity === rarity));
  const total = present.reduce((sum, rarity) => sum + CREATURE_RARITY_WEIGHTS[rarity], 0);
  let ticket = roll() * total;
  let rarity = present[present.length - 1];
  for (const candidate of present) {
    ticket -= CREATURE_RARITY_WEIGHTS[candidate];
    if (ticket < 0) {
      rarity = candidate;
      break;
    }
  }
  const pool = available.filter((species) => species.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))];
}

export function rollCreatureEncounter(input: {
  stopKind: CreatureStopKind;
  scene: CreatureScene;
  nowIso: string;
  history: CreatureEncounterHistory;
  roll?: () => number;
  catalog?: readonly CapturedMonsterConfig[];
}): CreatureEncounterRoll {
  const roll = input.roll ?? Math.random;
  if (input.history.sightingsThisBoard >= MAX_ENCOUNTERS_PER_BOARD) return { appeared: false, reason: "board_limit" };
  const last = input.history.lastSightingAt ? Date.parse(input.history.lastSightingAt) : Number.NaN;
  const guaranteeDue =
    !Number.isFinite(last) || Date.parse(input.nowIso) - last >= WEEKLY_GUARANTEE_DAYS * DAY_MS;
  const lucky = roll() < ENCOUNTER_CHANCE_BY_STOP[input.stopKind];
  if (!lucky && !guaranteeDue) return { appeared: false, reason: "no_luck" };
  const available = (input.catalog ?? CREATURE_CATALOG).filter((species) =>
    creatureAppearsNow(species, { ...input.scene, stopKind: input.stopKind }),
  );
  if (!available.length) return { appeared: false, reason: "none_out" };
  const creature = pickSpecies(available, roll);
  return {
    appeared: true,
    reason: lucky ? "rolled" : "weekly_guarantee",
    creature,
    charges: CHARGES_BY_RARITY[creature.rarity],
  };
}

export type CreatureDexStatus = "caught" | "seen" | "unknown";

export interface CreatureDexEntry {
  species: CapturedMonsterConfig;
  status: CreatureDexStatus;
  displayName: string;
  where: string;
  outNow: boolean;
  /** Rough chance one stop of the best kind brings this creature, while it is out. */
  bestStopChance: number;
  bestStop: CreatureStopKind;
}

const STOP_NAMES: Record<CreatureStopKind, string> = {
  common: "any stop",
  rare: "check stops",
  epic: "Quest stops",
  legendary: "Boss stops",
  mystery: "Mystery stops",
};

export function creatureDexView(input: {
  seenIds: readonly string[];
  caughtIds: readonly string[];
  scene: CreatureScene;
  catalog?: readonly CapturedMonsterConfig[];
}): { entries: CreatureDexEntry[]; caught: number; seen: number; total: number } {
  const catalog = input.catalog ?? CREATURE_CATALOG;
  const entries = catalog.map((species): CreatureDexEntry => {
    const status: CreatureDexStatus = input.caughtIds.includes(species.id)
      ? "caught"
      : input.seenIds.includes(species.id)
        ? "seen"
        : "unknown";
    const allowedStops = species.habitat.stops?.length
      ? species.habitat.stops
      : (Object.keys(ENCOUNTER_CHANCE_BY_STOP) as CreatureStopKind[]);
    const bestStop = allowedStops.reduce((best, stop) =>
      ENCOUNTER_CHANCE_BY_STOP[stop] > ENCOUNTER_CHANCE_BY_STOP[best] ? stop : best,
    );
    const sameRarity = catalog.filter((other) => other.rarity === species.rarity).length;
    const bestStopChance =
      (ENCOUNTER_CHANCE_BY_STOP[bestStop] * CREATURE_RARITY_WEIGHTS[species.rarity]) / 100 / sameRarity;
    return {
      species,
      status,
      displayName: status === "unknown" ? "???" : species.speciesName,
      where: species.habitat.stops?.length
        ? species.habitat.hint
        : `${species.habitat.hint} · best at ${STOP_NAMES[bestStop]}`,
      outNow: creatureAppearsNow(species, input.scene),
      bestStopChance,
      bestStop,
    };
  });
  return {
    entries,
    caught: entries.filter((entry) => entry.status === "caught").length,
    seen: entries.filter((entry) => entry.status !== "unknown").length,
    total: entries.length,
  };
}
