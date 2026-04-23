import fs from "fs";
import path from "path";
import type { SessionTheme, SessionThemeAmbient, SessionThemePalette } from "../shared/adventureTypes";
import { DEFAULT_MAP_WAYPOINTS } from "../shared/mapPathLayout";

const BUNDLE_DIR = path.join(process.cwd(), "themes");

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function isPalette(p: unknown): p is SessionThemePalette {
  if (!isRecord(p)) return false;
  return (
    typeof p.sky === "string" &&
    typeof p.ground === "string" &&
    typeof p.accent === "string" &&
    typeof p.particle === "string" &&
    typeof p.glow === "string"
  );
}

function isAmbient(a: unknown): a is SessionThemeAmbient {
  if (!isRecord(a)) return false;
  return (
    typeof a.type === "string" &&
    typeof a.count === "number" &&
    typeof a.speed === "number" &&
    typeof a.color === "string"
  );
}

/** Homework snapshot on disk (`src/context/.../themes`) — same shape as map-coordinator `SavedHomeworkThemeFile`. */
type HomeworkThemeBundle = {
  worldBackgroundUrl?: string;
  name?: string;
  palette?: SessionThemePalette;
  thumbnails?: Record<string, string | null | undefined>;
};

/**
 * Pick a random `.json` from repo-root `themes/` and normalize to `SessionTheme`.
 * Supports full `SessionTheme` JSON or homework-style `{ worldBackgroundUrl, thumbnails, palette }`.
 */
export function loadRandomSavedTheme(): SessionTheme | null {
  if (!fs.existsSync(BUNDLE_DIR)) return null;
  const files = fs
    .readdirSync(BUNDLE_DIR)
    .filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;
  const file = files[Math.floor(Math.random() * files.length)]!;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(BUNDLE_DIR, file), "utf8"),
    ) as unknown;
    return bundledJsonToSessionTheme(raw);
  } catch {
    return null;
  }
}

export function bundledJsonToSessionTheme(raw: unknown): SessionTheme | null {
  if (!isRecord(raw)) return null;

  const hw = raw as HomeworkThemeBundle;
  if (
    typeof hw.worldBackgroundUrl === "string" &&
    hw.worldBackgroundUrl &&
    isPalette(hw.palette)
  ) {
    const p = hw.palette;
    return {
      name: typeof hw.name === "string" && hw.name ? hw.name : "saved",
      palette: {
        ...p,
        cardBackground: p.cardBackground ?? p.particle,
      },
      ambient: {
        type: "dots",
        count: 20,
        speed: 1,
        color: p.particle ?? "#e0f2fe",
      },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
      castleUrl: null,
      backgroundUrl: hw.worldBackgroundUrl,
      nodeThumbnails: (hw.thumbnails ?? {}) as SessionTheme["nodeThumbnails"],
      mapWaypoints: [...DEFAULT_MAP_WAYPOINTS],
      source: "saved",
    };
  }

  if (
    typeof raw.name === "string" &&
    isPalette(raw.palette) &&
    isAmbient(raw.ambient) &&
    typeof raw.nodeStyle === "string" &&
    typeof raw.pathStyle === "string" &&
    typeof raw.castleVariant === "string"
  ) {
    const p = raw.palette as SessionThemePalette;
    const theme: SessionTheme = {
      name: raw.name,
      palette: {
        ...p,
        cardBackground: p.cardBackground ?? p.particle,
      },
      ambient: raw.ambient,
      nodeStyle: raw.nodeStyle,
      pathStyle: raw.pathStyle,
      castleVariant: raw.castleVariant,
      castleUrl:
        raw.castleUrl === null || typeof raw.castleUrl === "string"
          ? raw.castleUrl
          : null,
      backgroundUrl:
        typeof raw.backgroundUrl === "string" ? raw.backgroundUrl : undefined,
      nodeThumbnails: isRecord(raw.nodeThumbnails)
        ? (raw.nodeThumbnails as SessionTheme["nodeThumbnails"])
        : {},
      mapWaypoints: Array.isArray(raw.mapWaypoints)
        ? (raw.mapWaypoints as SessionTheme["mapWaypoints"])
        : [...DEFAULT_MAP_WAYPOINTS],
      source: "saved",
    };
    return theme;
  }

  return null;
}
