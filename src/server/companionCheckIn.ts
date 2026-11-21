import { lastAnswerAt } from "./gamePace";

/**
 * The companion's own check-in appointment (2026-11-10). It asks to look again later, its way: a raised hand on screen
 * or a gentle question in its own words. Code keeps the appointment, skips it if she answered meanwhile, and logs
 * the offer to the session's game log. One appointment per child; a new one replaces the old.
 */
export type CheckIn = { childId: string; afterSeconds: number; how: "raise_hand" | "ask"; words: string; why: string };
type Deps = { send: (command: Record<string, unknown>) => void; speak: (words: string) => void; trace: (row: Record<string, unknown>) => void };
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleCompanionCheckIn(input: CheckIn, deps: Deps): void {
  const afterSeconds = Math.min(600, Math.max(20, Math.round(input.afterSeconds)));
  const scheduledAt = Date.now();
  clearTimeout(pending.get(input.childId));
  console.log(` 🎮 [companion-checkin] [scheduled] child=${input.childId} after=${afterSeconds}s how=${input.how} why=${JSON.stringify(input.why)}`);
  pending.set(input.childId, setTimeout(() => {
    pending.delete(input.childId);
    const ts = new Date().toISOString();
    if ((lastAnswerAt(input.childId) ?? 0) > scheduledAt) {
      console.log(` 🎮 [companion-checkin] [skipped] child=${input.childId} reason=she_answered`);
      deps.trace({ type: "companion_checkin", action: "skipped", reason: "she_answered", how: input.how, ts });
      return;
    }
    if (input.how === "raise_hand") deps.send({ how: "raise_hand", why: input.why });
    else deps.speak(input.words);
    console.log(` 🎮 [companion-checkin] [offered] child=${input.childId} how=${input.how}`);
    deps.trace({ type: "companion_checkin", action: "offered", how: input.how, why: input.why, ts });
  }, afterSeconds * 1000));
}
