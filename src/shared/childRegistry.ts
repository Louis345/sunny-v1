import fs from "fs";
import path from "path";

type ChildrenConfig = {
  childProfiles?: Record<string, unknown>;
};

function loadChildrenConfig(rootDir = process.cwd()): ChildrenConfig {
  const configPath = path.join(rootDir, "children.config.json");
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as ChildrenConfig;
}

export function listChildProfileIds(rootDir?: string): string[] {
  return Object.keys(loadChildrenConfig(rootDir).childProfiles ?? {})
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id && id !== "creator")
    .sort();
}

/** Display name used by WebSocket `start_session` (Ila, Reina, Demo-pashley). */
export function sessionChildNameFromId(childId: string): string {
  const id = childId.trim().toLowerCase();
  if (!id) return "Sunny";
  if (id === "ila") return "Ila";
  if (id === "reina") return "Reina";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function childIdFromSessionName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "creator") return "creator";
  if (normalized === "ila") return "ila";
  if (normalized === "reina") return "reina";
  for (const id of listChildProfileIds()) {
    if (id === normalized) return id;
    if (sessionChildNameFromId(id).toLowerCase() === normalized) return id;
  }
  return null;
}

export function isValidWsSessionChild(name: string, diagKiosk = false): boolean {
  if (name === "creator") return diagKiosk;
  return childIdFromSessionName(name) != null;
}
