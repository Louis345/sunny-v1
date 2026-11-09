import { z } from "zod";
import type { AssignmentPlanningPacket } from "./assignmentPlanner";
import type { PlannerTool } from "./plannerToolLoop";

/**
 * Law 15, one menu (owner, 2026-11-08: a doctor gets every instrument). The games come from the
 * activityToolCatalog contracts, through the child's catalog; this file turns them into the one Planner menu
 * every stage and subject reads. A stage removes something only through STAGE_EXCEPTIONS, with its reason.
 */
export type PlannerStage = "teaching" | "successor" | "math-intake";
type Role = "instruction" | "practice" | "fresh_checkpoint";
export type StageException = { remove: string; kind: "child-safety" | "honest-record"; reason: string };

/** Every built-in game on the menu: the math intake's stand-in for "all but her own game". */
export const BUILT_IN_GAMES = "built-in-games";

/** The one place a Planner stage loses a tool. Nothing else may filter the menu. */
export const STAGE_EXCEPTIONS: Record<PlannerStage, readonly StageException[]> = {
  teaching: [{ remove: "generated-game", kind: "honest-record",
    reason: "The Teaching board publishes at intake, before any game can be built for her; listing it would promise a stop that does not exist yet. Her own game starts on the next board." }],
  successor: [],
  "math-intake": [{ remove: BUILT_IN_GAMES, kind: "honest-record",
    reason: "A math stop scores her answers against the worksheet problems recorded at intake; today only a game built for those problems binds them, so a built-in game could not record what she did. Built-in math games join when they bind recorded problems." }],
};

const ROLES: Record<string, ReadonlyArray<Role>> = {
  "word-radar:hidden_word_recall": ["fresh_checkpoint", "practice", "instruction"],
  "word-radar:visible_read": ["instruction", "practice"],
  "word-radar:partial_visual_recall": ["instruction", "practice"],
  // Her answers in a game built for her are practice; its pick and replays are the taste signal.
  "generated-game": ["practice"],
};

/** The tested games and modes a board can offer, and whether it can offer a reward break: one menu for every stage. */
export function plannerMenu(catalog: AssignmentPlanningPacket["activityCatalog"]) {
  const launchable = catalog.filter(card => card.launchable);
  const offered = new Set(launchable.map(card => card.nodeType ?? card.activityId));
  const radarModes = new Map<string, Record<string, unknown>>();
  for (const mode of launchable.find(card => card.activityId === "word-radar")?.capabilityModes ?? []) {
    const recall = (mode.config as { recallMode?: unknown } | undefined)?.recallMode;
    if (typeof recall === "string" && `word-radar:${recall}` in ROLES && !radarModes.has(recall)) radarModes.set(recall, structuredClone(mode.config as Record<string, unknown>));
  }
  const games = [...offered].filter(type => !["word-radar", "visual-explainer", "letter-rush", "mystery", "quest", "boss"].includes(type));
  const choices = [
    ...[...radarModes.keys()].map(mode => `word-radar:${mode}`),
    ...(offered.has("letter-rush") ? ["letter-rush:read-and-race", "letter-rush:hear-and-spell", "letter-rush:type-and-spell"] : []),
    ...games,
  ];
  /** The roles a game can play: only a hidden-word Radar measures what she knows. */
  const roles = (activity: string): ReadonlyArray<Role> => ROLES[activity] ?? (activity.startsWith("letter-rush:") ? ["practice"] : ["instruction", "practice"]);
  /** What code fills in for a game and mode: the Radar's settings or Letter Rush's mode. */
  const setup = (activity: string): { type: string; wordRadarConfig?: Record<string, unknown>; letterRushMode?: string } => {
    const [type, mode] = activity.split(":");
    return { type, ...(type === "word-radar" ? { wordRadarConfig: structuredClone(radarModes.get(mode)) } : type === "letter-rush" ? { letterRushMode: mode } : {}) };
  };
  /** A Mystery reward break: she plays, and it is recorded as play, never as learning evidence. */
  const rewardBreak = offered.has("mystery");
  return { offered, choices, roles, setup, rewardBreak };
}
export type PlannerMenu = ReturnType<typeof plannerMenu>;

/** The games one stage offers: the whole menu minus exactly that stage's STAGE_EXCEPTIONS. */
export function stageChoices(menu: Pick<PlannerMenu, "choices">, stage: PlannerStage): string[] {
  const removed = new Set(STAGE_EXCEPTIONS[stage].map(row => row.remove));
  return menu.choices.filter(id => removed.has(BUILT_IN_GAMES) ? id === "generated-game" : !removed.has(id));
}

/** The next board's menu facts, as the runtime freezes them into the question. */
export function successorMenuFacts(catalog: AssignmentPlanningPacket["activityCatalog"], explainer: { grade: unknown; words: Array<{ wordId: string; word: string }> }) {
  const menu = plannerMenu(catalog);
  return {
    activities: stageChoices(menu, "successor").map(id => ({ id, checkpoint: menu.roles(id).includes("fresh_checkpoint"), setup: menu.setup(id) })),
    ...(menu.offered.has("visual-explainer") ? { explainer } : {}),
    ...(menu.rewardBreak ? { rewardBreak: true } : {}),
  };
}

type RewardInput = { title: string; story: string; picture: string };
type Result = { ok: true; result: unknown } | { ok: false; error: string };
const text = (description: string) => z.string().min(1).describe(description);

/** The one reward-break tool every stage offers: a Mystery game with no words, no prediction and no
 * measurement. What she does there is play, never learning evidence. `returns` names the id it hands back. */
export function rewardBreakTool<State>(input: { returns: string; add: (state: State, given: RewardInput) => Result }): PlannerTool<State> {
  return { name: "add_reward", description: `Add a Mystery reward with no words and no measurement. Returns its ${input.returns}.`,
    schema: z.object({ title: text("The short name she sees under the portal."),
      story: text("What this stop is in her world: one or two sentences Elli can tell her as it opens."),
      picture: text("What this stop's picture on her map shows, for the illustrator.") }).strict(),
    run: (state: State, given: RewardInput) => input.add(state, given) } as PlannerTool<State>;
}
