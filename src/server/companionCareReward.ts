import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { companionCareToView } from "../engine/companionCareEngine";
import { getChildChart } from "../profiles/childChart";
import {
  loadCompanionCarePlanForChart,
  saveCompanionCarePlan,
} from "../profiles/companionCarePlan";
import type { CompanionCareView } from "../shared/companionCareTypes";

export type CompanionCareRewardStatus =
  | "awarded"
  | "already_awarded"
  | "not_eligible";

export interface CompanionCareRewardResult {
  status: CompanionCareRewardStatus;
  itemId?: "apple_bite";
  quantity?: 1;
  companionCare?: CompanionCareView;
}

export function awardSpellingCompletionApple(opts: {
  childId: string;
  homeworkId: string;
  cycle: LearningCycleRecordV2;
  persistence: "live" | "preview";
  rootDir?: string;
  nowIso?: string;
}): CompanionCareRewardResult {
  const childId = opts.childId.trim().toLowerCase();
  const homeworkId = opts.homeworkId.trim();
  const baselineNodes = opts.cycle.nodes.filter((node) => node.role === "baseline");
  const eligible =
    opts.persistence === "live" &&
    opts.cycle.childId.trim().toLowerCase() === childId &&
    opts.cycle.homeworkId === homeworkId &&
    opts.cycle.domain.trim().toLowerCase() === "spelling" &&
    baselineNodes.length > 0 &&
    baselineNodes.every((node) => node.state === "completed");
  if (!eligible) return { status: "not_eligible" };

  const chart = getChildChart(childId, { rootDir: opts.rootDir });
  const loaded = loadCompanionCarePlanForChart(chart, {
    nowIso: opts.nowIso,
    persistOnCreate: false,
  });
  const rewardId = `assignment_completion:${homeworkId}:apple_bite`;
  const existing = loaded.plan.rewardReceipts?.find(
    (receipt) => receipt.rewardId === rewardId,
  );
  if (existing) {
    return {
      status: "already_awarded",
      itemId: "apple_bite",
      quantity: 1,
      companionCare: companionCareToView(
        loaded.plan,
        chart.companion.displayName,
      ),
    };
  }

  const apple = loaded.plan.inventory.food.find(
    (item) => item.id === "apple_bite",
  );
  if (!apple) {
    console.error(
      ` 🎮 [companion-care-reward] [assignment_completion] [failed] child=${childId} homework=${homeworkId} missing=apple_bite`,
    );
    return { status: "not_eligible" };
  }
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const nextPlan = {
    ...loaded.plan,
    inventory: {
      ...loaded.plan.inventory,
      food: loaded.plan.inventory.food.map((item) =>
        item.id === "apple_bite"
          ? { ...item, quantity: Math.max(0, Math.floor(item.quantity)) + 1 }
          : item,
      ),
    },
    rewardReceipts: [
      ...(loaded.plan.rewardReceipts ?? []),
      {
        rewardId,
        sourceType: "assignment_completion" as const,
        homeworkId,
        itemId: "apple_bite",
        quantity: 1,
        awardedAt: nowIso,
      },
    ],
    updatedAt: nowIso,
  };
  saveCompanionCarePlan(chart, nextPlan);
  console.log(
    ` 🎮 [companion-care-reward] [assignment_completion] [awarded] child=${childId} homework=${homeworkId} item=apple_bite quantity=1`,
  );
  return {
    status: "awarded",
    itemId: "apple_bite",
    quantity: 1,
    companionCare: companionCareToView(nextPlan, chart.companion.displayName),
  };
}
