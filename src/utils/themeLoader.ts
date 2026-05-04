import fs from "fs";
import path from "path";
import type { SessionTheme, SessionThemeAmbient, SessionThemePalette } from "../shared/adventureTypes";
import {
  MAP_PATH_PRESETS,
  mapPathPresetForTheme,
  resolveMapPathPresetName,
  resolveMapWaypoints,
} from "../shared/mapPathLayout";

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
  mapPathPreset?: string;
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
  /** Homework / bundle JSON on disk — image URLs expire; keep palette + layout metadata only. */
  if (isPalette(hw.palette) && typeof hw.worldBackgroundUrl === "string" && hw.worldBackgroundUrl) {
    const p = hw.palette;
    const name = typeof hw.name === "string" && hw.name ? hw.name : "saved";
    const mapPathPreset = resolveMapPathPresetName(
      hw.mapPathPreset ?? mapPathPresetForTheme(name),
    );
    return {
      name,
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
      mapPathPreset,
      mapWaypoints: [...MAP_PATH_PRESETS[mapPathPreset]],
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
    const mapPathPreset = resolveMapPathPresetName(
      typeof raw.mapPathPreset === "string" ? raw.mapPathPreset : mapPathPresetForTheme(raw.name),
    );
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
      mapPathPreset,
      mapWaypoints: [
        ...resolveMapWaypoints(
          mapPathPreset,
          Array.isArray(raw.mapWaypoints)
            ? (raw.mapWaypoints as SessionTheme["mapWaypoints"])
            : undefined,
        ),
      ],
      source: "saved",
    };
    return theme;
  }

  return null;
}
