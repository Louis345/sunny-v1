import fs from "fs";
import path from "path";
import { shouldPersistSessionData } from "../../../utils/runtimeMode";

export interface RewardEvent {
  timestamp: string;
  rewardStyle: "flash" | "takeover" | "none";
  displayDuration_ms: number;
  timeToNextUtterance_ms: number;
  nextAnswerCorrect: boolean | null;
  childVerbalReaction: string | null;
  sessionPhase: string;
  correctStreakAtTime: number;
}

export function appendRewardLog(
  childName: "Ila" | "Reina",
  events: RewardEvent[]
): void {
  if (!shouldPersistSessionData()) return;

  const logDir = path.resolve(process.cwd(), "src", "logs");
  const logFile = path.join(
    logDir,
    `${childName.toLowerCase()}_rewards.json`
  );

  let existing: RewardEvent[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(logFile, "utf-8"));
  } catch {
    // File doesn't exist yet — start fresh
  }

  const updated = [...existing, ...events];
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logFile, JSON.stringify(updated, null, 2));
}
