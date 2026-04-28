import fs from "fs";
import path from "path";
import type { ChildProfileGames } from "../shared/childProfile";
import type { ChildrenConfigFile } from "../profiles/childrenConfig";

type MutableChildProfileEntry = {
  ttsName?: string;
  avatarImagePath?: string | null;
  showTimer?: boolean;
  showKeyboard?: boolean;
  games?: ChildProfileGames;
};

type MutableChildrenConfigFile = ChildrenConfigFile & {
  childProfiles?: Record<string, MutableChildProfileEntry>;
};

function childrenConfigPath(): string {
  return path.join(process.cwd(), "children.config.json");
}

export async function readChildProfile(childId: string): Promise<MutableChildProfileEntry> {
  const filePath = childrenConfigPath();
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MutableChildrenConfigFile;
  const key = childId.trim().toLowerCase();
  const childProfiles = raw.childProfiles ?? {};
  return childProfiles[key] ?? {};
}

export async function writeChildProfile(
  childId: string,
  profile: MutableChildProfileEntry,
): Promise<void> {
  const filePath = childrenConfigPath();
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MutableChildrenConfigFile;
  const key = childId.trim().toLowerCase();
  raw.childProfiles = raw.childProfiles ?? {};
  raw.childProfiles[key] = profile;
  fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf8");
}

export async function updateChildProfileGenerationModel(
  childId: string,
  model: "sonnet" | "opus",
  generatedGamePath: string,
): Promise<void> {
  const profile = await readChildProfile(childId);
  const games = (profile.games ?? {}) as ChildProfileGames;
  if (model === "sonnet") {
    const quest = games.quest ?? {
      unlocked: false,
      sessionCount: 0,
      lastAccuracy: null,
      sessionsRequired: 5,
      dataThresholdMet: false,
      generatedGamePath: null,
      generationModel: "sonnet" as const,
    };
    games.quest = {
      ...quest,
      generationModel: "sonnet",
      generatedGamePath,
      dataThresholdMet: true,
    };
  } else {
    const boss = games.boss ?? {
      unlocked: false,
      sessionCount: 0,
      lastAccuracy: null,
      sessionsRequired: 10,
      dataThresholdMet: false,
      generatedGamePath: null,
      generationModel: null,
    };
    games.boss = {
      ...boss,
      generationModel: "opus",
      generatedGamePath,
      dataThresholdMet: true,
    };
  }
  profile.games = games;
  await writeChildProfile(childId, profile);
}
