import fs from "fs";
import path from "path";

// Register tsx so require() can load .ts growth modules in dev/test environments
try { require("tsx/cjs"); } catch { /* in compiled production .js files are used */ }

export interface CompanionDefinition {
  id: string;
  name: string;
  voiceId: string;
  ttsName: string;
  unlockCost: number;
  vrmPath: string;
  defaultFor?: string;
  personalityMarkdown: string;
  getGrowthModifier: (level: number) => string;
}

const COMPANIONS_DIR = __dirname;

function discover(): CompanionDefinition[] {
  return fs
    .readdirSync(COMPANIONS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .flatMap(dir => {
      const base = path.join(COMPANIONS_DIR, dir.name);
      const configPath = path.join(base, "companion.json");
      const personalityPath = path.join(base, "personality.md");
      const growthJsPath = path.join(base, "growth.js");
      const growthTsPath = path.join(base, "growth.ts");
      if (!fs.existsSync(configPath) || !fs.existsSync(personalityPath)) return [];
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const personalityMarkdown = fs.readFileSync(personalityPath, "utf-8");
      const resolvedGrowth = fs.existsSync(growthJsPath) ? growthJsPath : growthTsPath;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const growth = require(resolvedGrowth) as {
        getGrowthModifier: (n: number) => string;
      };
      return [{
        ...config,
        id: dir.name,
        personalityMarkdown,
        getGrowthModifier: growth.getGrowthModifier,
      } as CompanionDefinition];
    });
}

const _cache = discover();

export const CompanionRegistry = {
  getAll: (): CompanionDefinition[] => _cache,
  getById: (id: string): CompanionDefinition => {
    const found = _cache.find(c => c.id === id);
    if (!found) throw new Error(`CompanionRegistry: unknown companion "${id}"`);
    return found;
  },
};
