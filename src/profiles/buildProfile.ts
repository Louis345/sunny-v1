import type { LearningProfile } from "../context/schemas/learningProfile";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import { readLearningProfile } from "../utils/learningProfileIO";
import { getNodeRatings } from "../utils/nodeRatingIO";
import { computeAttentionWindow, computeUnlockedThemes } from "./profileCompute";

function normalizeChildId(raw: string): string {
  return raw.trim().toLowerCase();
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

  return {
    childId,
    level,
    interests: { tags: interestTags },
    ui: { accentColor: accent },
    unlockedThemes,
    attentionWindow_ms,
    companion: cloneCompanionDefaults(),
  };
}
