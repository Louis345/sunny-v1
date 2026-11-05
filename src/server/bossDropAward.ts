import { grantBossDrop } from "../engine/companionCareEngine";
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import { mirrorCompanionCareToLearningProfile, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import type { BossDrop } from "../shared/companionCareTypes";

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
