import type { PendingCreatureEncounter } from "../../../src/shared/companionCareTypes";
import type { DenFoodId, DenState } from "../../../src/shared/creatureDenRules";
import type { CreatureEncounterHistory, CreatureScene } from "../../../src/shared/creatureEncounters";

/** The kiosk's calls to the creature routes (owner, 2026-11-08). The server's companion plan is the one record. */

export type CreatureSnapshot = {
  den: DenState;
  history: CreatureEncounterHistory;
  pending: PendingCreatureEncounter[];
  scene: CreatureScene;
};

export type DenAction =
  | { action: "recall"; creatureId: string }
  | { action: "dismiss" }
  | { action: "rename"; creatureId: string; name: string }
  | { action: "feed"; creatureId: string; foodId: DenFoodId }
  | { action: "ack_ran_away" };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json()) as T;
}

/** Her creatures, or null when the server has none to give (not ready, or a non-JSON reply). */
export async function fetchCreatures(childId: string): Promise<CreatureSnapshot | null> {
  const response = await fetch(`/api/creatures/${encodeURIComponent(childId)}`);
  const type = response.headers?.get?.("content-type") ?? "";
  if (!response.ok || !type.includes("json")) {
    console.warn(` 🎮 [creatures] [snapshot] [unavailable] child=${childId} status=${response.status}`);
    return null;
  }
  return (await response.json()) as CreatureSnapshot;
}

export function resolveCreatureEncounter(childId: string, encounterId: string, outcome: "caught" | "let_go") {
  console.log(` 🎮 [creatures] [encounter] [${outcome}] child=${childId} encounter=${encounterId}`);
  return postJson<{ ok: boolean; duplicate?: boolean }>("/api/creatures/encounter", { childId, encounterId, outcome });
}

export function sendDenAction(childId: string, action: DenAction) {
  return postJson<{ ok: boolean; den?: DenState; reason?: string; bondGained?: number }>("/api/creatures/den", { childId, ...action });
}

export function startCreatureSession(childId: string) {
  return postJson<{ ok: boolean; ranAwayId: string | null }>("/api/creatures/session-start", { childId });
}
