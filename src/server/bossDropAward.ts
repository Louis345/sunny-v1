import { grantBossDrop, grantNodeChest, nodeChestKind } from "../engine/companionCareEngine";
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import { mirrorCompanionCareToLearningProfile, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import type { BossDrop, NodeChest } from "../shared/companionCareTypes";

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
    console.log(` 🎮 [learning-cycle-route] [node-chest] [${opened.granted ? "granted" : "shown-again"}] child=${cycle.childId} node=${nodeId} kind=${opened.chest.kind} rarity=${opened.chest.rarity} coins=${opened.chest.coins} bonus=${opened.chest.bonus?.minutes ?? 0}`);
    return { chest: opened.chest, balance: opened.plan.economy.coins };
  } catch (error) {
    console.error(` 🎮 [learning-cycle-route] [node-chest] [deferred] ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
