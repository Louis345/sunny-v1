import type { GameDefinition } from "../../shared/gameRegistry.generated";
import {
  REWARD_GAMES,
  TEACHING_TOOLS,
} from "../../shared/gameRegistry.generated";

export type { GameDefinition };

export { REWARD_GAMES, TEACHING_TOOLS };

export function getTool(name: string): GameDefinition | null {
  if (!(name in TEACHING_TOOLS)) return null;
  return TEACHING_TOOLS[name];
}

export function getReward(name: string): GameDefinition | null {
  if (!(name in REWARD_GAMES)) return null;
  return REWARD_GAMES[name];
}
