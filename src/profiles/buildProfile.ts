import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { ChildProfile } from "../shared/childProfile";
import { mergeCompanionPresetWithLearningProfile } from "../shared/companionTypes";
import {
  companionConfigFromPreset,
  getTtsNameForChildId,
  readChildrenConfig,
} from "./childrenConfig";
import { readLearningProfile } from "../utils/learningProfileIO";
import { getNodeRatings } from "../utils/nodeRatingIO";
import { computeAttentionWindow, computeUnlockedThemes } from "./profileCompute";
import { DEFAULT_TAMAGOTCHI } from "../shared/vrrTypes";
import { applyPassiveDepletion } from "../engine/vrrEngine";

const PROFILE_SRC = path.resolve(__dirname, "..");

function normalizeChildId(raw: string): string {
  return raw.trim().toLowerCase();
}

function getChildContext(childId: string): string {
  const id = normalizeChildId(childId);
  const file = path.join(PROFILE_SRC, "context", id, `${id}_context.md`);
  if (!fs.existsSync(file)) return "";
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Adventure level from learning profile: grows slowly with completed sessions.
 */
function levelFromLearningProfile(lp: LearningProfile): number {
  const s = lp.sessionStats?.totalSessions ?? 0;
  return Math.max(1, Math.min(99, 1 + Math.floor(s / 2)));
}

/**
 * Build API `ChildProfile` for a child folder under `src/context/{childId}/`.
 */
export async function buildProfile(childIdRaw: string): Promise<ChildProfile | null> {
  const childId = normalizeChildId(childIdRaw);
  const lp = readLearningProfile(childId);
  if (!lp) return null;

  const level = levelFromLearningProfile(lp);
  const ratings = await getNodeRatings(childId, 500);
  const attentionWindow_ms = computeAttentionWindow(ratings);
  const unlockedThemes = computeUnlockedThemes(level);

  const accent =
    lp.readingProfile?.highlightColor &&
    typeof lp.readingProfile.highlightColor === "string"
      ? lp.readingProfile.highlightColor
      : "#1a56db";

  const interestTags: string[] = [];
  if (lp.rewardPreferences?.favoriteGames?.length) {
    interestTags.push(...lp.rewardPreferences.favoriteGames.slice(0, 8));
  }
  if (lp.readingProfile?.currentReadingLevel) {
    interestTags.push(`reading:${lp.readingProfile.currentReadingLevel}`);
  }

  const childrenCfg = readChildrenConfig();
  const childMeta = childrenCfg.childProfiles?.[childId];
  const presetFromLp =
    lp.companion?.companionId &&
    childrenCfg.companions[lp.companion.companionId]
      ? lp.companion.companionId
      : undefined;
  const presetId =
    presetFromLp ??
    childrenCfg.childCompanionIds[childId] ??
    childrenCfg.defaultCompanionId;
  const presetBlock = childrenCfg.companions[presetId];
  if (!presetBlock) {
    throw new Error(
      `children.config.json: unknown companion preset "${presetId}" for child "${childId}"`,
    );
  }
  const preset = companionConfigFromPreset(presetId, presetBlock);
  const companion = mergeCompanionPresetWithLearningProfile(preset, lp.companion);

  const now = new Date().toISOString();
  const baseT = lp.tamagotchi ?? { ...DEFAULT_TAMAGOTCHI, lastSeenAt: now };
  const tamagotchi = applyPassiveDepletion(baseT);

  return {
    childId,
    ttsName: getTtsNameForChildId(childId),
    avatarImagePath: childMeta?.avatarImagePath,
    level,
    interests: { tags: interestTags },
    ui: { accentColor: accent },
    unlockedThemes,
    attentionWindow_ms,
    childContext: getChildContext(childId),
    companion,
    pendingHomework: lp.pendingHomework ?? undefined,
    tamagotchi,
  };
}
