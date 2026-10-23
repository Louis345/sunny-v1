import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveAdaptiveMathDraftDir } from "../../engine/adaptiveMathDiscovery";
import { resolveChildContextDir } from "../../utils/contextRoot";
import type { LearningCycleSpellingItem } from "../../engine/learningCycleRepository";

/** A first-board built-in Word Radar, saved and bound the way first-board ingestion binds native activities. */
export function builtInWordRadar(input: { rootDir: string; childId: string; homeworkId: string; nodeId: string; title: string; items: LearningCycleSpellingItem[]; checkpoint?: boolean }) {
  const wordRadarConfig = { recallMode: "hidden_word_recall", inputMode: "keyboard" };
  const evidenceContract = { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(input.items.map(item => [item.id, item])),
    ...(input.checkpoint ? { itemRoles: Object.fromEntries(input.items.map(item => [item.id, "fresh_checkpoint" as const])) } : {}), nativeConfig: { activityId: "word-radar", wordRadarConfig } };
  const file = path.join(resolveAdaptiveMathDraftDir(input.childId, input.homeworkId, { rootDir: input.rootDir }), "native-instruments", `${input.nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  const configuration = { version: 1, node: { id: input.nodeId, type: "word-radar", activityId: "word-radar", targets: input.items.map(item => item.word), difficulty: 1, title: input.title, wordRadarConfig }, evidenceContract };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(configuration));
  return {
    implementationType: "word-radar" as const,
    evidenceContract,
    artifactBinding: {
      contentId: `${input.homeworkId}:${input.nodeId}`, artifactId: `${input.homeworkId}:${input.nodeId}:native`,
      localArtifactPath: `/${path.relative(resolveChildContextDir(input.childId, { rootDir: input.rootDir }), file).split(path.sep).join("/")}`,
      localArtworkPath: "/generated/world.jpeg", contractFingerprint: createHash("sha256").update(JSON.stringify(configuration)).digest("hex"), validationStatus: "passed" as const,
    },
  };
}
