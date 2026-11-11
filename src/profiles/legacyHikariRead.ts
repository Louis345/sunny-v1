import fs from "fs";
import path from "path";
import { readChildrenConfig } from "./childrenConfig";
import { familyDay } from "../utils/familyCalendar";

/**
 * Owner 2026-11-11: Matilda and Hikari are two companions again (commit f7486384 had merged them on 2026-11-10).
 * While merged, a child whose companion is Matilda had her care plan, memory and call ledger written under "hikari".
 * Her Matilda reads that data as her own when no newer matilda file exists. Nothing is deleted; the next save writes
 * the matilda file, which then wins.
 */
export const LEGACY_HIKARI_WINDOW = { fromDay: "2026-11-10", toDay: "2026-11-11" } as const;

export function inLegacyHikariWindow(value: string | Date | undefined | null): boolean {
  const day = familyDay(value);
  return Boolean(day) && day >= LEGACY_HIKARI_WINDOW.fromDay && day <= LEGACY_HIKARI_WINDOW.toDay;
}

/** True when this child's configured companion is Matilda and the reader is Matilda. */
export function readsLegacyHikariData(childId: string, companionId: string): boolean {
  if (companionId !== "matilda") return false;
  try {
    return readChildrenConfig().childCompanionIds?.[childId] === "matilda";
  } catch (error: unknown) {
    console.warn(
      ` 🎮 [companion] [legacy-hikari-read] [config-unreadable] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function mtimeMs(file: string): number | null {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Which file Matilda should read for one per-companion JSON file (care plan or relationship): `<dir>/matilda.json`
 * unless `<dir>/hikari.json` was written in the merge window and is newer than any matilda file.
 */
export function resolveMatildaReadPath(childId: string, companionId: string, matildaPath: string): string {
  if (!readsLegacyHikariData(childId, companionId)) return matildaPath;
  const hikariPath = path.join(path.dirname(matildaPath), "hikari.json");
  const hikariMtime = mtimeMs(hikariPath);
  if (hikariMtime === null || !inLegacyHikariWindow(new Date(hikariMtime))) return matildaPath;
  const matildaMtime = mtimeMs(matildaPath);
  if (matildaMtime !== null && matildaMtime >= hikariMtime) return matildaPath;
  console.log(
    ` 🎮 [companion] [legacy-hikari-read] [using-hikari-file] child=${childId} companion=${companionId} file=${hikariPath} matilda=${matildaMtime === null ? "missing" : "older"}`,
  );
  return hikariPath;
}
