import fs from "fs";
import path from "path";

export interface GameDefinition {
  url: string;
  defaultConfig: Record<string, unknown>;
  voiceEnabled: boolean;
}

type GameMetaEntry = {
  type: "tool" | "reward";
  voiceEnabled: boolean;
  defaultConfig?: Record<string, unknown>;
  /** Registry / canvas mode id when it differs from the .html basename */
  key?: string;
};

const GAMES_DIR = path.join(process.cwd(), "web/public/games");

/** Known metadata — reward type, non-default config, or filename ≠ public game id */
export const GAME_META: Record<string, GameMetaEntry> = {
  "wordd-builder": {
    type: "tool",
    voiceEnabled: true,
    key: "word-builder",
  },
  "bd-reversal-game": {
    type: "tool",
    voiceEnabled: true,
    key: "bd-reversal",
    defaultConfig: {
      pairs: ["bd"],
      probeWords: ["bed", "dog", "big", "duck", "bird", "dab"],
    },
  },
  "spell-check": { type: "tool", voiceEnabled: true },
  "coin-counter": { type: "tool", voiceEnabled: true },
  "vault-cracker": { type: "tool", voiceEnabled: true },
  "store-game": {
    type: "tool",
    voiceEnabled: true,
    defaultConfig: { itemPool: [] },
  },
  "space-invaders": {
    type: "reward",
    voiceEnabled: true,
    defaultConfig: { duration_seconds: 180, level: 1 },
  },
  "space-frogger": {
    type: "reward",
    voiceEnabled: true,
    defaultConfig: { duration_seconds: 180, level: 1 },
  },
  asteroid: {
    type: "reward",
    voiceEnabled: true,
    defaultConfig: { duration_seconds: 180, level: 1 },
  },
};

export function discoverGames(): {
  tools: Record<string, GameDefinition>;
  rewards: Record<string, GameDefinition>;
} {
  const tools: Record<string, GameDefinition> = {};
  const rewards: Record<string, GameDefinition> = {};
  const defaults: GameMetaEntry = { type: "tool", voiceEnabled: true };

  if (!fs.existsSync(GAMES_DIR)) {
    return { tools, rewards };
  }

  for (const file of fs.readdirSync(GAMES_DIR)) {
    if (!file.endsWith(".html")) continue;
    const stem = file.replace(/\.html$/i, "");
    const meta = GAME_META[stem] ?? defaults;
    const registryKey = meta.key ?? stem;

    const def: GameDefinition = {
      url: `/games/${file}`,
      defaultConfig: meta.defaultConfig ?? {},
      voiceEnabled: meta.voiceEnabled,
    };

    if (meta.type === "reward") {
      rewards[registryKey] = def;
    } else {
      tools[registryKey] = def;
    }
  }

  return { tools, rewards };
}
