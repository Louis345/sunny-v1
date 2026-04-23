/**
 * DesignerAgent — builds SessionTheme for the adventure map (TASK-008).
 * Grok images are best-effort; session start never waits on network failure.
 */
import type { ChildProfile } from "../../shared/childProfile";
import {
  ALL_NODE_TYPES,
  type NodeType,
  type SessionTheme,
  type SessionThemePalette,
} from "../../shared/adventureTypes";
import { DEFAULT_MAP_WAYPOINTS } from "../../shared/mapPathLayout";
import { getRandomUnlockedTheme } from "../../server/theme-registry";
import { generateStoryImage } from "../../utils/generateStoryImage";
import { isDiagMapMode } from "../../utils/runtimeMode";

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
    /** Karaoke / reading card fill — client falls back if absent; always set for map themes. */
    cardBackground:
      bucket === "night"
        ? "#0f172a"
        : bucket === "sunset"
          ? "#1e293b"
          : bucket === "sunrise"
            ? "#fefce8"
            : "#f0f9ff",
  };
}

const CASTLE_IMAGE_PROMPT = `A cute illustrated children's castle for a learning adventure app.
  Bright colors, flat illustration style, welcoming and magical, wide base,
  colorful flags, glowing windows. No text. Transparent background PNG style.
  Child-friendly, warm, playful.`;

const NODE_THUMBNAIL_PROMPTS: Record<NodeType, string> = {
  riddle:
    "A glowing question mark surrounded by sparkles, cartoon style, purple tones, child-friendly",
  "word-builder":
    "Colorful alphabet blocks stacked playfully, bright primary colors, cartoon style",
  karaoke:
    "An open storybook with stars floating out, warm golden light, illustrated style",
  "spell-check":
    "Colorful letters bouncing in bubbles, blue tones, cartoon style",
  "coin-counter":
    "Shiny gold coins stacked and scattered, warm amber tones, cartoon style",
  "clock-game":
    "A friendly cartoon clock with a smiling face, bright colors",
  "space-invaders":
    "A cute cartoon rocket ship in space with stars, vibrant colors",
  asteroid:
    "A cute cartoon asteroid with a smile, deep purple and silver, starfield, child-friendly",
  "space-frogger":
    "A tiny green frog on lily pads over stylized lanes, arcade-cute, bright colors",
  "bubble-pop":
    "Cheerful cartoon bubbles with letters inside, pastel colors, child-friendly",
  boss: "A golden trophy with stars exploding around it, triumphant, cartoon style",
};

/** Palette / layout only — no Grok. Used as map fallback when `generateTheme` is skipped in diag. */
export function paletteOnlyThemeFromProfile(
  profile: ChildProfile,
  opts?: { now?: Date; themeName?: string },
): SessionTheme {
  const now = opts?.now ?? new Date();
  const bucket = timeOfDayBucket(now);
  const themeName = opts?.themeName ?? getRandomUnlockedTheme(profile);
  const accent = profile.ui.accentColor;
  const palette = paletteForBucket(accent, bucket);

  let pathStyle = "curve";
  if (process.env.SUNNY_SUBJECT?.trim() === "reading") {
    pathStyle = "curve-reading";
  }

  return {
    name: themeName,
    palette,
    ambient: { type: "dots", count: 20, speed: 1, color: palette.particle },
    nodeStyle: "rounded",
    pathStyle,
    castleVariant: "stone",
    castleUrl: null,
    nodeThumbnails: {},
    mapWaypoints: [...DEFAULT_MAP_WAYPOINTS],
  };
}

export async function generateTheme(
  profile: ChildProfile,
  opts?: { now?: Date; themeName?: string },
): Promise<SessionTheme | null> {
  if (isDiagMapMode()) return null;

  const theme = paletteOnlyThemeFromProfile(profile, opts);

  const bgPrompt =
    `A ${theme.name} world background for a children's learning adventure. ` +
    `Theme: ${theme.name}. Colors matching: ${theme.palette.accent}. ` +
    `Style: flat illustration, bright, child-friendly, wide landscape. No text. No characters.`;

  const jobs: Promise<string | null>[] = [
    generateStoryImage(bgPrompt, { useDirectScene: true }),
    generateStoryImage(CASTLE_IMAGE_PROMPT, { useDirectScene: true }),
    ...ALL_NODE_TYPES.map((type) =>
      generateStoryImage(NODE_THUMBNAIL_PROMPTS[type], {
        useDirectScene: true,
      }),
    ),
  ];

  try {
    const results = await Promise.all(jobs);
    const bg = results[0];
    const castle = results[1];
    const thumbResults = results.slice(2);

    if (bg) theme.backgroundUrl = bg;
    theme.castleUrl = castle ?? null;

    const nodeThumbnails: Record<string, string | null> = {};
    ALL_NODE_TYPES.forEach((type, i) => {
      nodeThumbnails[type] = thumbResults[i] ?? null;
    });
    theme.nodeThumbnails = nodeThumbnails;
  } catch {
    /* Grok unavailable — palette-only theme; castleUrl / thumbnails stay null */
  }

  return theme;
}
