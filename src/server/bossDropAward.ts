import { grantBossDrop, grantNodeChest, nodeChestKind } from "../engine/companionCareEngine";
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import { mirrorCompanionCareToLearningProfile, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import type { BossDrop, NodeChest } from "../shared/companionCareTypes";
import { REWARD_CATALOG } from "../shared/rewardCatalog";

/** Beating the Boss drops loot (owner, 2026-11-05): rolled once, saved, the same card on replay.
 * Any other stop drops nothing. A failure is logged and never blocks her completion. */
export function awardBossDropOnCompletion(cycle: LearningCycleRecordV2, nodeId: string, roll?: () => number): BossDrop | undefined {
  const node = cycle.nodes.find(row => row.nodeId === nodeId);
  if (node?.role !== "boss" || node.state !== "completed") return undefined;
  try {
    const chart = getChildChart(cycle.childId);
    const dropped = grantBossDrop(chart.companionCare.plan, { homeworkId: cycle.homeworkId, bossNodeId: nodeId, nowIso: new Date().toISOString(), roll });
    if (dropped.granted) {
      saveCompanionCarePlan(chart, dropped.plan);
      mirrorCompanionCareToLearningProfile(chart, dropped.plan);
    }
    console.log(` 🎮 [learning-cycle-route] [boss-drop] [${dropped.granted ? "granted" : "shown-again"}] child=${cycle.childId} node=${nodeId} tier=${dropped.drop.tier} coins=${dropped.drop.coins}`);
    return dropped.drop;
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [boss-drop] [deferred] ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** Every other finished stop opens a treasure chest (owner, 2026-11-06): rolled once, saved, and paid into
 * her companion's coins. It replaces the flat per-stop coins. A failure is logged and never blocks her completion. */
export function awardNodeChestOnCompletion(cycle: LearningCycleRecordV2, nodeId: string, roll?: () => number): { chest: NodeChest; balance: number } | undefined {
  const node = cycle.nodes.find(row => row.nodeId === nodeId);
  if (!node || node.role === "boss" || node.state !== "completed") return undefined;
  try {
    const chart = getChildChart(cycle.childId);
    const opened = grantNodeChest(chart.companionCare.plan, { homeworkId: cycle.homeworkId, nodeId, kind: nodeChestKind(node), nowIso: new Date().toISOString(), roll });
    if (opened.granted) {
      saveCompanionCarePlan(chart, opened.plan);
      mirrorCompanionCareToLearningProfile(chart, opened.plan);
    }
    console.log(` 🎮 [learning-cycle-route] [node-chest] [${opened.granted ? "granted" : "shown-again"}] child=${cycle.childId} node=${nodeId} kind=${opened.chest.kind} rarity=${opened.chest.rarity} coins=${opened.chest.coins} bonus=${opened.chest.bonus ? (opened.chest.bonus.kind === "item" ? opened.chest.bonus.itemId : `${opened.chest.bonus.minutes}min`) : "none"}`);
    return { chest: opened.chest, balance: opened.plan.economy.coins };
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [node-chest] [deferred] ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** The facts the companion gets when a chest she opened held a bonus, or null for coins alone (so she is not
 * chatty after every stop). Facts only: the companion answers in her own words from live context. */
export function rewardDropSystemEvent(chest: NodeChest): string | null {
  if (!chest.bonus) return null;
  const found = chest.bonus.kind === "item"
    ? (() => {
      const item = REWARD_CATALOG.find(row => row.id === (chest.bonus as { itemId: string }).itemId);
      return item ? `She found the ${item.name}, a ${item.rarity} ${item.kind === "game" ? "8-bit game" : "outfit"}; it is now in her collection.` : `She found a collection item (${chest.bonus.itemId}); it is now in her collection.`;
    })()
    : `She found ${chest.bonus.minutes} extra call minutes.`;
  return `[System event: treasure chest opened] Her ${chest.rarity} chest paid ${chest.coins} coins. ${found}`;
}

export type RewardDropHost = { chartChildId: string; reacted: Set<string>; busy: () => boolean; bargeIn: () => void; respond: (facts: string) => Promise<unknown> };

/** A chest she opened held a bonus: the companion reacts in her own words to the facts the server saved
 * (owner, 2026-11-07). The screen only names the chest; what it held is read from her care plan, once. */
export async function reactToRewardDrop(host: RewardDropHost, input: { homeworkId: string; nodeId: string }): Promise<void> {
  const key = `${input.homeworkId}:${input.nodeId}`;
  if (host.reacted.has(key)) return;
  const chest = getChildChart(host.chartChildId).companionCare.plan.economy.nodeChests
    ?.find(row => row.homeworkId === input.homeworkId && row.nodeId === input.nodeId);
  const facts = chest ? rewardDropSystemEvent(chest) : null;
  if (!facts) return;
  host.reacted.add(key);
  console.log(` 🎮 [rewards] [drop-reaction] [requested] node=${input.nodeId} bonus=${chest?.bonus?.kind}`);
  if (host.busy()) host.bargeIn();
  await host.respond(facts);
}
