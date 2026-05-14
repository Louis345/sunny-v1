import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import {
  companionCareToTamagotchi,
  createStarterCompanionCarePlan,
} from "../engine/companionCareEngine";
import type { CompanionCarePlan } from "../shared/companionCareTypes";

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
    },
    inventory: {
      food: Array.isArray(plan.inventory?.food) ? plan.inventory.food : [],
      careItems: Array.isArray(plan.inventory?.careItems)
        ? plan.inventory.careItems
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
