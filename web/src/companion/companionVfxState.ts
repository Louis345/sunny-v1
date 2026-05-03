import type { CompanionEventPayload } from "../../../src/shared/companionTypes";
import type { CompanionVfxLevel } from "./CompanionVfxLayer";

const SAIYAN_VFX_COMPANIONS = new Set(["kefla"]);

function numericMetadataValue(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): number | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function newestEvent(events: CompanionEventPayload[]): CompanionEventPayload | null {
  return events.reduce<CompanionEventPayload | null>((latest, event) => {
    if (!latest || event.timestamp >= latest.timestamp) return event;
    return latest;
  }, null);
}

function streakFromEvents(events: CompanionEventPayload[]): number | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const streak = numericMetadataValue(events[i]?.metadata, [
      "correctStreak",
      "streak",
    ]);
    if (streak != null) return streak;
  }
  return null;
}

export function shouldUseSaiyanVfx(companionId: string | null | undefined): boolean {
  return companionId ? SAIYAN_VFX_COMPANIONS.has(companionId) : false;
}

export function resolveSaiyanVfxLevel({
  companionId,
  correctStreak,
  companionEvents = [],
}: {
  companionId: string | null | undefined;
  correctStreak?: number | null;
  companionEvents?: CompanionEventPayload[];
}): CompanionVfxLevel {
  if (!shouldUseSaiyanVfx(companionId)) return "idle";

  const newest = newestEvent(companionEvents);
  if (newest?.trigger === "wrong_answer") return "idle";

  const streak =
    typeof correctStreak === "number" && Number.isFinite(correctStreak)
      ? correctStreak
      : streakFromEvents(companionEvents) ?? 0;

  if (streak >= 5) return "limit_break";
  if (streak >= 3) return "powered_up";
  if (streak >= 2) return "focused";
  return "idle";
}
