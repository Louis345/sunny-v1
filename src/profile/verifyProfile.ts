import type { ChildProfile } from "../shared/childProfile";

export function verifyGameConfig(profile: ChildProfile): void {
  const games = profile.games ?? {};
  if ((games["clock-game"] as { step?: unknown } | undefined)?.step !== undefined) {
    throw new Error(
      "Law violation: clock-game.step must not exist in games config. Read from masteryGating.clockStep.",
    );
  }
  if ((games["coin-counter"] as { step?: unknown } | undefined)?.step !== undefined) {
    throw new Error(
      "Law violation: coin-counter.step must not exist in games config. Read from masteryGating.coinStep.",
    );
  }
  for (const [key, config] of Object.entries(games)) {
    if (config === undefined) continue;
    if (typeof config.unlocked !== "boolean") {
      throw new Error(`games["${key}"].unlocked must be boolean`);
    }
    if (typeof config.sessionCount !== "number") {
      throw new Error(`games["${key}"].sessionCount must be number`);
    }
  }
}
