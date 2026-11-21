/**
 * Whether the companion can actually talk right now (BUGS.md S26, S27; Ila on FaceTime, 2026-11-18: the Anthropic
 * credit was empty, every reply failed, and her call minutes kept being spent). A failed reply marks the voice down;
 * the next good reply clears it. While it is down a call minute is free, and the parent is told once per outage.
 */
import { raiseParentAlert } from "../engine/sunnyHealth";

const DOWN_WINDOW_MS = 3 * 60_000;
let down: { since: number; lastFailure: number; alerted: boolean } | null = null;

/** A plain sentence for the parent; the provider's billing words become the action to take. */
export function companionOutageText(message: string): string {
  if (/credit balance|billing|insufficient_quota|credits? remaining/i.test(message)) {
    return "Anthropic credit is empty, so companions can't talk and boards can't be built. Add credit in the Anthropic Console.";
  }
  return `Companion replies are failing (${message.replace(/\s+/g, " ").slice(0, 120)}). Call minutes are not being charged.`;
}

export function noteCompanionVoiceFailed(childId: string, error: unknown, now = Date.now()): void {
  const message = error instanceof Error ? error.message : String(error);
  const first = !down;
  down = { since: down?.since ?? now, lastFailure: now, alerted: down?.alerted ?? false };
  console.error(` 🎮 [companion-voice] [down] child=${childId || "unknown"} first=${first}`);
  if (!down.alerted) {
    down.alerted = true;
    void raiseParentAlert({ childId: childId || "unknown", kind: "companion_voice_down", text: companionOutageText(message) })
      .catch(alertError => console.error(` 🎮 [companion-voice] [alert-failed] reason=${alertError instanceof Error ? alertError.message : String(alertError)}`));
  }
}

export function noteCompanionVoiceOk(childId: string): void {
  if (!down) return;
  console.log(` 🎮 [companion-voice] [up] child=${childId || "unknown"} down_ms=${Date.now() - down.since}`);
  down = null;
}

/** True while replies are failing: the last failure was recent and no reply has worked since. */
export function companionVoiceDown(now = Date.now()): boolean {
  return Boolean(down && now - down.lastFailure < DOWN_WINDOW_MS);
}

/** Test seam. */
export function resetCompanionVoiceHealth(): void { down = null; }
