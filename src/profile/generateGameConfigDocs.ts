import { DEFAULT_GAME_CONFIGS } from "./gameConfigDefaults";

/**
 * Markdown summary of game config defaults for agent prompts (Law 3: generated, not hand-duplicated).
 */
export function generateGameConfigDocs(): string {
  const lines: string[] = [];
  lines.push("### Child profile `games` namespace — default shapes");
  lines.push("");
  lines.push(
    "Each entry extends base fields: `unlocked` (boolean), `sessionCount` (number), `lastAccuracy` (number | null).",
  );
  lines.push("");
  lines.push(
    "**Do not** add `step` to `clock-game` or `coin-counter` config — those steps come from `masteryGating.clockStep` and `masteryGating.coinStep`.",
  );
  lines.push("");
  for (const [gameId, cfg] of Object.entries(DEFAULT_GAME_CONFIGS)) {
    lines.push(`#### ${gameId}`);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(cfg, null, 2));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
