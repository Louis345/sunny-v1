import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { CompanionConfig } from "../shared/companionTypes";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import type { ChildProfileEntry, ChildrenConfigFile } from "./childrenConfig";
import { companionConfigFromPreset } from "./childrenConfig";

export type ChildChartLinks = {
  learningProfile: string;
  companionCareDir: string;
};

export type ChildChart = {
  childId: string;
  rootDir: string;
  links: ChildChartLinks;
  learningProfile: LearningProfile;
  childMeta?: ChildProfileEntry;
  identity: {
    displayName: string;
    ttsName: string;
    avatarImagePath?: string | null;
  };
  companion: {
    presetId: string;
    config: CompanionConfig;
    displayName: string;
  };
  economy: {
    coinBalance: number;
  };
};

export type ChildChartOptions = {
  rootDir?: string;
};

function normalizeChildId(raw: string): string {
  return raw.trim().toLowerCase();
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function contextDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId);
}

function fallbackCompanionConfig(presetId: string): CompanionConfig {
  return {
    ...COMPANION_DEFAULTS,
    companionId: presetId,
    sensitivity: { ...COMPANION_DEFAULTS.sensitivity },
    expressions: { ...COMPANION_DEFAULTS.expressions },
    faceCamera: {
      position: [...COMPANION_DEFAULTS.faceCamera.position],
      target: [...COMPANION_DEFAULTS.faceCamera.target],
    },
    dopamineGames: [...COMPANION_DEFAULTS.dopamineGames],
  };
}

export function getChildChart(
  childIdRaw: string,
  opts: ChildChartOptions = {},
): ChildChart {
  const rootDir = opts.rootDir ?? process.cwd();
  const childId = normalizeChildId(childIdRaw);
  const baseDir = contextDir(rootDir, childId);
  const learningProfileFile = path.join(baseDir, "learning_profile.json");
  const learningProfile = readJson<LearningProfile>(learningProfileFile);
  if (!learningProfile) {
    throw new Error(`Learning profile not found for child: ${childId}`);
  }

  const cfg = readJson<ChildrenConfigFile>(
    path.join(rootDir, "children.config.json"),
  );
  const childMeta = cfg?.childProfiles?.[childId];
  const presetId =
    learningProfile.companion?.companionId ??
    cfg?.childCompanionIds?.[childId] ??
    cfg?.defaultCompanionId ??
    "elli";
  const presetBlock = cfg?.companions?.[presetId];
  const companionConfig = presetBlock
    ? companionConfigFromPreset(presetId, presetBlock)
    : fallbackCompanionConfig(presetId);

  return {
    childId,
    rootDir,
    links: {
      learningProfile: learningProfileFile,
      companionCareDir: path.join(baseDir, "companion_care"),
    },
    learningProfile,
    childMeta,
    identity: {
      displayName: capitalize(childId),
      ttsName: childMeta?.ttsName ?? capitalize(childId),
      avatarImagePath: childMeta?.avatarImagePath,
    },
    companion: {
      presetId,
      config: companionConfig,
      displayName: capitalize(presetId),
    },
    economy: {
      coinBalance: Math.max(
        0,
        Math.floor(Number(learningProfile.companionCurrency ?? 0) || 0),
      ),
    },
  };
}
