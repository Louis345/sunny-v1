import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import {
  callSecondsOf,
  companionCareToTamagotchi,
  createStarterCompanionCarePlan,
} from "../engine/companionCareEngine";
import type { CompanionCarePlan } from "../shared/companionCareTypes";
import { normalizeCreatureState } from "../engine/creatureCareEngine";

export type CompanionCareChartInput = {
  childId: string;
  links: {
    companionCareDir: string;
    learningProfile: string;
  };
  companion: {
    presetId: string;
  };
  learningProfile: LearningProfile;
  economy: {
    coinBalance: number;
  };
};

export type LoadedCompanionCarePlan = {
  plan: CompanionCarePlan;
  filePath: string;
  created: boolean;
};

function carePlanPath(chart: CompanionCareChartInput): string {
  return path.join(
    chart.links.companionCareDir,
    `${chart.companion.presetId}.json`,
  );
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function normalizeLoadedPlan(
  plan: CompanionCarePlan,
  chart: CompanionCareChartInput,
): CompanionCarePlan {
  const coins = Math.max(0, Math.floor(Number(plan.economy?.coins ?? 0) || 0));
  return {
    ...plan,
    version: 1,
    childId: chart.childId,
    companionId: chart.companion.presetId,
    economy: {
      coins,
      storeUnlocks: Array.isArray(plan.economy?.storeUnlocks)
        ? [...plan.economy.storeUnlocks]
        : [],
      purchaseReceipts: Array.isArray(plan.economy?.purchaseReceipts)
        ? [...plan.economy.purchaseReceipts]
        : [],
      videoCallTickets: Array.isArray(plan.economy?.videoCallTickets)
        ? plan.economy.videoCallTickets.map((ticket) => ({ ...ticket }))
        : [],
      bonusRewardReceipts: Array.isArray(plan.economy?.bonusRewardReceipts)
        ? plan.economy.bonusRewardReceipts.map((receipt) => ({ ...receipt }))
        : [],
      bossDrops: Array.isArray(plan.economy?.bossDrops)
        ? plan.economy.bossDrops.map((drop) => ({ ...drop }))
        : [],
      // Chest receipts keep "one chest per stop" true across restarts; minutes and pity are her balance.
      nodeChests: Array.isArray(plan.economy?.nodeChests)
        ? plan.economy.nodeChests.map((chest) => ({ ...chest, ...(chest.bonus ? { bonus: { ...chest.bonus } } : {}) }))
        : [],
      // Call time is saved in seconds (2026-11-10); legacy whole minutes are folded in here.
      callSeconds: callSecondsOf(plan.economy ?? {}),
      chestsSinceBonus: Math.max(0, Math.floor(Number(plan.economy?.chestsSinceBonus ?? 0) || 0)),
      // Arcade minutes and their receipts are her paid game time; dropping them would steal it.
      arcadeMinutes: Math.max(0, Math.floor(Number(plan.economy?.arcadeMinutes ?? 0) || 0)),
      arcadeMinuteReceipts: Array.isArray(plan.economy?.arcadeMinuteReceipts)
        ? plan.economy.arcadeMinuteReceipts.filter((id): id is string => typeof id === "string")
        : [],
      callMinuteReceipts: Array.isArray(plan.economy?.callMinuteReceipts)
        ? plan.economy.callMinuteReceipts.filter((id): id is string => typeof id === "string")
        : [],
      // Purchase receipts keep a double tap after a restart from paying twice.
      coinPurchases: Array.isArray(plan.economy?.coinPurchases)
        ? plan.economy.coinPurchases.map((row) => ({ ...row, offer: { ...row.offer } }))
        : [],
    },
    // Her creatures (den, seen, milestones, try lockouts); dropping them here would erase what she caught.
    ...(plan.creatures ? { creatures: normalizeCreatureState(plan.creatures) } : {}),
    inventory: {
      food: Array.isArray(plan.inventory?.food) ? plan.inventory.food : [],
      careItems: Array.isArray(plan.inventory?.careItems)
        ? plan.inventory.careItems
        : [],
      // Collection items found in chests; dropping them here would erase what she earned.
      rewards: Array.isArray(plan.inventory?.rewards)
        ? plan.inventory.rewards.filter((id): id is string => typeof id === "string")
        : [],
    },
  };
}

export function loadCompanionCarePlanForChart(
  chart: CompanionCareChartInput,
  opts: { nowIso?: string; persistOnCreate?: boolean } = {},
): LoadedCompanionCarePlan {
  const filePath = carePlanPath(chart);
  const existing = readJson<CompanionCarePlan>(filePath);
  if (existing) {
    return {
      plan: normalizeLoadedPlan(existing, chart),
      filePath,
      created: false,
    };
  }
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const plan = createStarterCompanionCarePlan({
    childId: chart.childId,
    companionId: chart.companion.presetId,
    nowIso,
    seed: chart.learningProfile.tamagotchi,
    coinBalance: chart.economy.coinBalance,
  });
  if (opts.persistOnCreate !== false) {
    writeJson(filePath, plan);
  }
  return { plan, filePath, created: true };
}

export function saveCompanionCarePlan(
  chart: CompanionCareChartInput,
  plan: CompanionCarePlan,
): void {
  writeJson(carePlanPath(chart), {
    ...plan,
    childId: chart.childId,
    companionId: chart.companion.presetId,
    updatedAt: new Date().toISOString(),
  });
}

export function mirrorCompanionCareToLearningProfile(
  chart: CompanionCareChartInput,
  plan: CompanionCarePlan,
): LearningProfile {
  const existing = readJson<LearningProfile>(chart.links.learningProfile);
  if (!existing) {
    throw new Error(`Learning profile not found for child: ${chart.childId}`);
  }
  const next: LearningProfile = {
    ...existing,
    tamagotchi: companionCareToTamagotchi(plan),
    companionCurrency: Math.max(0, Math.floor(Number(plan.economy.coins) || 0)),
    lastUpdated: new Date().toISOString(),
  };
  writeJson(chart.links.learningProfile, next);
  return next;
}
