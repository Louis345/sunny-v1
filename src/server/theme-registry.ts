import fs from "fs";
import path from "path";
import type { ChildProfile } from "../shared/childProfile";

const THEMES_DIR = path.resolve(process.cwd(), "src", "themes");

export function getThemesDir(): string {
  return THEMES_DIR;
}

export function getAvailableThemes(): string[] {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs
    .readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/i, ""))
    .sort();
}

export function getThemePath(name: string): string {
  return path.join(THEMES_DIR, `${name}.html`);
}

export function isThemeUnlocked(name: string, profile: ChildProfile): boolean {
  return profile.unlockedThemes.includes(name);
}

export function getRandomUnlockedTheme(profile: ChildProfile): string {
  const list = profile.unlockedThemes;
  if (list.length === 0) return "default";
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] ?? "default";
}
