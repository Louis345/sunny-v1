import type { RewardRarity } from "./rewardCatalog";
import {
  CREATURE_CATALOG,
  type CapturedMonsterConfig,
  type CreatureStopKind,
} from "./capturedMonsterCatalog";
import type { Season as SparkOrbSeason, SkyMood as SparkOrbTimeOfDay } from "./skyClock";

/**
 * When a creature shows up (owner, 2026-11-08), after World of Warcraft. A reward that follows the learning:
 * it never chooses an educational step and never touches learning evidence.
 *
 * - The Planner chooses the moment: nothing appears unless it placed an encounter on the stop.
 * - Code keeps it scarce: at most ENCOUNTERS_PER_BOARD per board.
 * - New creatures come from their own source: the starter first; a milestone creature is guaranteed once
 *   earned; a weekly drop gets one try a week; a seasonal creature one try a day in its season. A miss uses
 *   the try and never raises the next chance (no pity).
 * - Otherwise she meets a familiar creature she has caught that is out right now.
 * - Rarer creatures need more answers to charge the orb: the stakes.
 */
export const ENCOUNTERS_PER_BOARD = 1;
export const WEEKLY_LOCKOUT_DAYS = 7;
export const CHARGES_BY_RARITY: Record<RewardRarity, number> = { common: 3, rare: 4, epic: 5, legendary: 6 };

const DAY_MS = 86_400_000;

export interface CreatureScene {
  season: SparkOrbSeason;
  timeOfDay: SparkOrbTimeOfDay;
}

export interface CreatureEncounterHistory {
  seenIds: readonly string[];
  caughtIds: readonly string[];
  boardsCompleted: number;
  encountersThisBoard: number;
  /** When each drop or seasonal creature was last tried for, by species id. */
  lastTryAt: Readonly<Record<string, string>>;
}

export type CreatureEncounterReason =
  | "not_placed"
  | "board_limit"
  | "none_out"
  | "starter"
  | "milestone"
  | "drop"
  | "seasonal"
  | "familiar";

export interface CreatureEncounterRoll {
  appeared: boolean;
  reason: CreatureEncounterReason;
  creature?: CapturedMonsterConfig;
  charges?: number;
  isNew: boolean;
  /** lastTryAt after this roll: every try spent, hit or miss, so the lockout holds. */
  tries: Record<string, string>;
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

function sameLocalDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Whether this drop or seasonal creature has a try available now (its lockout has passed). */
function tryAvailable(species: CapturedMonsterConfig, lastTryAt: string | undefined, nowIso: string): boolean {
  if (!lastTryAt) return true;
  if (species.source.kind === "seasonal") return !sameLocalDay(lastTryAt, nowIso);
  if (species.source.kind === "weekly_drop") return Date.parse(nowIso) - Date.parse(lastTryAt) >= WEEKLY_LOCKOUT_DAYS * DAY_MS;
  return false;
}

function found(
  creature: CapturedMonsterConfig,
  reason: CreatureEncounterReason,
  history: CreatureEncounterHistory,
  tries: Record<string, string>,
): CreatureEncounterRoll {
  return {
    appeared: true,
    reason,
    creature,
    charges: CHARGES_BY_RARITY[creature.rarity],
    isNew: !history.caughtIds.includes(creature.id),
    tries,
  };
}

export function rollCreatureEncounter(input: {
  plannerPlaced: boolean;
  stopKind: CreatureStopKind;
  scene: CreatureScene;
  nowIso: string;
  history: CreatureEncounterHistory;
  roll?: () => number;
  catalog?: readonly CapturedMonsterConfig[];
}): CreatureEncounterRoll {
  const roll = input.roll ?? Math.random;
  const catalog = input.catalog ?? CREATURE_CATALOG;
  const { history } = input;
  const tries: Record<string, string> = { ...history.lastTryAt };
  const nothing = (reason: CreatureEncounterReason): CreatureEncounterRoll => ({ appeared: false, reason, isNew: false, tries });
  if (!input.plannerPlaced) return nothing("not_placed");
  if (history.encountersThisBoard >= ENCOUNTERS_PER_BOARD) return nothing("board_limit");
  const context = { ...input.scene, stopKind: input.stopKind };
  const uncaught = catalog.filter((species) => !history.caughtIds.includes(species.id));

  const starter = uncaught.find((species) => species.source.kind === "starter");
  if (starter) return found(starter, "starter", history, tries);

  const earned = uncaught.find(
    (species) =>
      species.source.kind === "milestone" &&
      history.boardsCompleted >= species.source.boards &&
      creatureAppearsNow(species, context),
  );
  if (earned) return found(earned, "milestone", history, tries);

  for (const species of uncaught) {
    const source = species.source;
    if (source.kind !== "weekly_drop" && source.kind !== "seasonal") continue;
    if (!creatureAppearsNow(species, context) || !tryAvailable(species, tries[species.id], input.nowIso)) continue;
    tries[species.id] = input.nowIso;
    if (roll() < source.chance) return found(species, source.kind === "seasonal" ? "seasonal" : "drop", history, tries);
  }

  const familiar = catalog.filter(
    (species) => history.caughtIds.includes(species.id) && creatureAppearsNow(species, context),
  );
  if (!familiar.length) return nothing("none_out");
  const pick = familiar[Math.min(familiar.length - 1, Math.floor(roll() * familiar.length))];
  return found(pick, "familiar", history, tries);
}

export type CreatureDexStatus = "caught" | "seen" | "unknown";

export interface CreatureDexEntry {
  species: CapturedMonsterConfig;
  status: CreatureDexStatus;
  displayName: string;
  /** Where and when to look. */
  where: string;
  /** What is left to do: the measured goal (tries this week, boards to go, season). */
  goal: string;
  outNow: boolean;
}

const SEASON_NAME: Record<SparkOrbSeason, string> = {
  spring: "in spring",
  summer: "in summer",
  autumn: "in autumn",
  halloween: "at Halloween",
  holiday: "for the holidays",
  winter: "in winter",
};

function goalFor(species: CapturedMonsterConfig, history: CreatureEncounterHistory, nowIso: string, scene: CreatureScene): string {
  if (history.caughtIds.includes(species.id)) return "Caught";
  const source = species.source;
  switch (source.kind) {
    case "starter":
      return "Your first friend";
    case "milestone":
      return `Guaranteed after ${source.boards} boards: ${Math.min(history.boardsCompleted, source.boards)} of ${source.boards} boards`;
    case "weekly_drop": {
      const last = history.lastTryAt[species.id];
      if (!last || tryAvailable(species, last, nowIso)) return "1 try this week";
      const waitDays = Math.ceil((Date.parse(last) + WEEKLY_LOCKOUT_DAYS * DAY_MS - Date.parse(nowIso)) / DAY_MS);
      return `Next try in ${waitDays} day${waitDays === 1 ? "" : "s"}`;
    }
    case "seasonal": {
      const seasons = species.habitat.seasons ?? [];
      if (!seasons.length || seasons.includes(scene.season)) return "In season now · 1 try a day";
      return `Back ${SEASON_NAME[seasons[seasons.length - 1]]}`;
    }
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

export function creatureDexView(input: {
  history: CreatureEncounterHistory;
  scene: CreatureScene;
  nowIso: string;
  catalog?: readonly CapturedMonsterConfig[];
}): { entries: CreatureDexEntry[]; caught: number; seen: number; total: number } {
  const catalog = input.catalog ?? CREATURE_CATALOG;
  const { history } = input;
  const entries = catalog.map((species): CreatureDexEntry => {
    const status: CreatureDexStatus = history.caughtIds.includes(species.id)
      ? "caught"
      : history.seenIds.includes(species.id)
        ? "seen"
        : "unknown";
    return {
      species,
      status,
      displayName: status === "unknown" ? "???" : species.speciesName,
      where: species.habitat.hint,
      goal: goalFor(species, history, input.nowIso, input.scene),
      outNow: creatureAppearsNow(species, input.scene),
    };
  });
  return {
    entries,
    caught: entries.filter((entry) => entry.status === "caught").length,
    seen: entries.filter((entry) => entry.status !== "unknown").length,
    total: entries.length,
  };
}
