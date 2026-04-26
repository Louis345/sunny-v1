import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { ChildProfile, ChildProfileGames } from "../shared/childProfile";
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
import { CompanionRegistry } from "../prompts/companions/registry";
import { buildWordRadarPersonalBests } from "../utils/wordRadarProfile";
import { readWordBank } from "../utils/wordBankIO";
import { sm2 } from "../algorithms/sm2";
import { desirableDifficulty } from "../algorithms/desirableDifficulty";
import { interleaving } from "../algorithms/interleaving";
import { masteryGating as computeMasteryGating } from "../algorithms/masteryGating";
import { retrievalPractice as computeRetrievalPractice } from "../algorithms/retrievalPractice";
import { DEFAULT_GAME_CONFIGS } from "../profile/gameConfigDefaults";
import { verifyGameConfig } from "../profile/verifyProfile";

const PROFILE_SRC = path.resolve(__dirname, "..");

function normalizeChildId(raw: string): string {
  return raw.trim().toLowerCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: unknown): T {
  if (!isPlainRecord(override)) return { ...base };
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainRecord(existing) && isPlainRecord(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out as T;
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
  const wordBank = readWordBank(childId);
  wordBank.words = (wordBank.words ?? []).filter((w) =>
    /^[a-z]{2,30}$/.test(w.word.toLowerCase()),
  );

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

  const companionIdForRegistry =
    companion.companionId?.trim() ||
    (childId === "reina" ? "matilda" : "elli");

  let companionContext = "";
  try {
    const regCompanion = CompanionRegistry.getById(companionIdForRegistry);
    companionContext = [
      `## Companion: ${regCompanion.name}`,
      regCompanion.personalityMarkdown,
      `## Growth context (level ${level})`,
      regCompanion.getGrowthModifier(level),
    ].join("\n\n");
  } catch {
    companionContext = "";
  }

  const now = new Date().toISOString();
  const baseT = lp.tamagotchi ?? { ...DEFAULT_TAMAGOTCHI, lastSeenAt: now };
  const tamagotchi = applyPassiveDepletion(baseT);

  const { dueWords, sm2Stats } = sm2(wordBank);
  const { mathRotation } = interleaving(
    ((lp as unknown as { mathHistory?: unknown[] }).mathHistory ?? []) as Array<{
      type?: string;
      problemType?: string;
      correct?: boolean;
    }>,
  );
  const { currentDifficulty } = desirableDifficulty(
    ((lp as unknown as { attemptHistory?: unknown[] }).attemptHistory ?? lp.moodHistory ?? []) as Array<{
      correct?: boolean;
    }>,
  );
  const { masteryGating } = computeMasteryGating({
    ...(lp as unknown as Record<string, unknown>),
    sessionStats: lp.sessionStats,
    readingProfile: lp.readingProfile,
  });
  const { retrievalPractice } = computeRetrievalPractice(wordBank);
  const games = deepMerge(
    DEFAULT_GAME_CONFIGS as unknown as Record<string, unknown>,
    childMeta?.games ?? {},
  ) as ChildProfileGames;
  const wordRadarGame = games["word-radar"];
  const wrShowTimer = wordRadarGame?.showTimer ?? (childMeta?.showTimer !== false);
  const wrShowKeyboard =
    wordRadarGame?.inputMode === "keyboard" || childMeta?.showKeyboard === true;

  const profile: ChildProfile = {
    childId,
    ttsName: getTtsNameForChildId(childId),
    avatarImagePath: childMeta?.avatarImagePath,
    level,
    xp: Math.max(0, (lp.sessionStats?.totalWordsMastered ?? 0) * 10 + (lp.sessionStats?.totalSessions ?? 0) * 5),
    interests: { tags: interestTags },
    dyslexiaMode: lp.readingProfile?.dyslexiaMode ?? false,
    companionColor: accent,
    dueWords,
    sm2Stats,
    currentDifficulty,
    masteryGating,
    mathRotation,
    retrievalPractice,
    games,
    ui: { accentColor: accent },
    unlockedThemes,
    attentionWindow_ms,
    childContext: getChildContext(childId),
    companion,
    companionContext,
    pendingHomework: lp.pendingHomework ?? undefined,
    tamagotchi,
    wordRadar: {
      showTimer: wrShowTimer,
      showKeyboard: wrShowKeyboard,
      personalBests: buildWordRadarPersonalBests(childId),
    },
  };

  if (process.env.NODE_ENV !== "production") {
    verifyGameConfig(profile);
  }

  return profile;
}
