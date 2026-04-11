/**
 * DesignerAgent — builds SessionTheme for the adventure map (TASK-008).
 * Grok images are best-effort; session start never waits on network failure.
 */
import type { ChildProfile } from "../../shared/childProfile";
import type { SessionTheme, SessionThemePalette } from "../../shared/adventureTypes";
import { getRandomUnlockedTheme } from "../../server/theme-registry";
import { generateStoryImage } from "../../utils/generateStoryImage";

export type TimeOfDayBucket = "sunrise" | "day" | "sunset" | "night";

export function timeOfDayBucket(now: Date): TimeOfDayBucket {
  const h = now.getHours();
  if (h < 7) return "sunrise";
  if (h < 18) return "day";
  if (h < 20) return "sunset";
  return "night";
}

function paletteForBucket(
  accent: string,
  bucket: TimeOfDayBucket,
): SessionThemePalette {
  const sky =
    bucket === "night"
      ? "#0b1b3a"
      : bucket === "sunset"
        ? "#ff9a6b"
        : bucket === "sunrise"
          ? "#ffd6a8"
          : "#6ec8ff";
  const ground =
    bucket === "night" ? "#0f3d2e" : bucket === "sunset" ? "#2d5016" : "#228b5c";
  const particle =
    bucket === "night" ? "#a7c7ff" : bucket === "sunset" ? "#fff3b0" : "#e0f2fe";
  const glow =
    bucket === "night" ? "#fde68a" : bucket === "sunset" ? "#fbbf24" : accent;
  return {
    sky,
    ground,
    accent,
    particle,
    glow,
  };
}

export async function generateTheme(
  profile: ChildProfile,
  opts?: { now?: Date; themeName?: string },
): Promise<SessionTheme> {
  const now = opts?.now ?? new Date();
  const bucket = timeOfDayBucket(now);
  const themeName = opts?.themeName ?? getRandomUnlockedTheme(profile);
  const accent = profile.ui.accentColor;
  const palette = paletteForBucket(accent, bucket);

  let pathStyle = "curve";
  if (process.env.SUNNY_SUBJECT?.trim() === "reading") {
    pathStyle = "curve-reading";
  }

  const theme: SessionTheme = {
    name: themeName,
    palette,
    ambient: { type: "dots", count: 20, speed: 1, color: palette.particle },
    nodeStyle: "rounded",
    pathStyle,
    castleVariant: "stone",
  };

  const bgPrompt =
    `A ${themeName} world background for a children's learning adventure. ` +
    `Theme: ${themeName}. Colors matching: ${accent}. ` +
    `Style: flat illustration, bright, child-friendly, wide landscape. No text. No characters.`;

  const castlePrompt =
    `A ${themeName} gentle castle on a hill for a children's learning adventure. ` +
    `Colors matching: ${accent}. ` +
    `Style: flat illustration, bright, child-friendly. No text. No characters.`;

  try {
    const [bg, castle] = await Promise.all([
      generateStoryImage(bgPrompt, { useDirectScene: true }),
      generateStoryImage(castlePrompt, { useDirectScene: true }),
    ]);
    if (bg) theme.backgroundUrl = bg;
    if (castle) theme.castleUrl = castle;
  } catch {
    /* Grok unavailable — palette-only theme */
  }

  return theme;
}
