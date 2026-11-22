import { describe, expect, it } from "vitest";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";
import { NODE_DISPLAY_LABELS, NODE_REGISTRY } from "../shared/nodeRegistry";
import { listActivityToolContracts } from "./activityToolCatalog";
import { DOPAMINE_TYPES } from "./nodeSelection";
import { SPELLING_CERTIFICATION_GAMES } from "./spellingCertification";
import { BANDIT_POOL } from "./nodeSelection";
import { spellingActivityCatalog } from "./assignmentPlanner";

// Law 16: a game is declared once, as its contract in activityToolCatalog.ts. Every other list that should
// cover a kind of game either derives from the contracts or is checked against them here, so adding a game
// names every other place that must change. A gap that cannot be closed safely today is listed with its
// BUGS.md entry; closing it makes this test fail until the gap is taken off the list.
const contracts = listActivityToolContracts();
const mapNodes = contracts.filter(contract => contract.plannerVisibility === "map_node" && contract.nodeType);

/** Certified games that are not yet NodeTypes. Adding one to ALL_NODE_TYPES resets every child's saved
 * bandit arms (their length must match), so it waits for a migration (BUGS.md 2026-11-08, One menu). */
const NOT_YET_NODE_TYPES = ["speed-catcher"];
/** Map-node contracts the kiosk's NODE_REGISTRY has no handler for yet (BUGS.md 2026-11-08, One menu). */
const NO_KIOSK_HANDLER_YET = ["vault-cracker", "bd-reversal", "store-game"];

describe("hand-copied activity lists stay in step with the contracts", () => {
  it("picks dopamine rewards from every reward-only dopamine contract (space-frogger was missing)", () => {
    const dopamine = contracts.filter(contract => contract.nodeType === "dopamine").map(contract => contract.id);
    expect([...DOPAMINE_TYPES].sort()).toEqual([...dopamine].sort());
    for (const id of dopamine) expect(getContract(id).purposes, id).toEqual(["reward"]);
  });

  it("names every certified spelling game as a node type, except the stated gaps", () => {
    const missing = SPELLING_CERTIFICATION_GAMES.map(game => game.gameId).filter(id => !(ALL_NODE_TYPES as readonly string[]).includes(id));
    expect(missing).toEqual(NOT_YET_NODE_TYPES);
  });

  it("gives every map-node game a display label", () => {
    const unlabeled = mapNodes.filter(contract => !(contract.nodeType! in NODE_DISPLAY_LABELS)).map(contract => contract.id);
    expect(unlabeled).toEqual([]);
  });

  it("gives every map-node game a kiosk handler, except the stated gaps", () => {
    const unhandled = mapNodes.filter(contract => !(contract.nodeType! in NODE_REGISTRY)).map(contract => contract.id);
    expect(unhandled).toEqual(NO_KIOSK_HANDLER_YET);
  });

  // I5 (11/22): a game the kiosk cannot open must never reach a child. Nothing checked that before; now no Planner menu,
  // no launchable catalog card and no bandit pick can offer one, so the gap stays harmless until it gets a handler.
  it("offers no game the kiosk cannot open, anywhere a child could get it", () => {
    const blocked = new Set<string>(NO_KIOSK_HANDLER_YET);
    const launchable = spellingActivityCatalog("ila").filter(card => card.launchable).flatMap(card => [card.activityId, card.nodeType ?? ""]);
    expect(launchable.filter(id => blocked.has(id))).toEqual([]);
    expect(BANDIT_POOL.filter(type => blocked.has(type))).toEqual([]);
  });
});

function getContract(id: string) {
  return contracts.find(contract => contract.id === id)!;
}
