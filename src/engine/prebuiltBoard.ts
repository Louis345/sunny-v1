import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import type { LearningCycleRecordV2, LearningCycleRepositoryOptions } from "./learningCycleRepository";
import type { SpellingGameClient } from "./spellingGameBuilder";

/**
 * Experiment (owner, 2026-11-05): "build while she plays and only reveal when the content has been generated".
 * The paid Planner and game builder run ahead on a sandbox copy of her cycle (`npm run sunny:prebuild`), and
 * their decision and games are saved here as a kit. When her real board finishes, Sunny uses the kit at once,
 * with no model call; the runtime still checks the decision exactly as if the Planner had just made it, and a
 * kit it refuses is marked failed and never tried again.
 */
export type PrebuiltKit = {
  version: 1;
  childId: string;
  homeworkId: string;
  fromLifecycle: LearningCycleRecordV2["lifecycle"];
  decision: Record<string, unknown> & { progressionAction: string };
  games: Record<string, string>;
  createdAt: string;
  status: "ready" | "used" | "failed";
  failure?: string;
};

export function prebuiltKitFile(childId: string, homeworkId: string, opts: LearningCycleRepositoryOptions = {}): string {
  return path.join(resolveChildContextDir(childId, { rootDir: opts.rootDir }), "homework", "cycles", ".prebuilt", `${homeworkId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

export function readPrebuiltKit(childId: string, homeworkId: string, opts: LearningCycleRepositoryOptions = {}): PrebuiltKit | null {
  const file = prebuiltKitFile(childId, homeworkId, opts);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PrebuiltKit;
  } catch (error) {
    console.error(` 🎮 [prebuilt-board] [kit] [unreadable] homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function savePrebuiltKit(kit: PrebuiltKit, opts: LearningCycleRepositoryOptions = {}): string {
  const file = prebuiltKitFile(kit.childId, kit.homeworkId, opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(kit, null, 2));
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
  console.log(` 🎮 [prebuilt-board] [kit] [${kit.status}] child=${kit.childId} homework=${kit.homeworkId} action=${kit.decision.progressionAction} games=${Object.keys(kit.games).length}`);
  return file;
}

export function markPrebuiltKit(kit: PrebuiltKit, status: "used" | "failed", opts: LearningCycleRepositoryOptions = {}, failure?: string): void {
  savePrebuiltKit({ ...kit, status, ...(failure ? { failure } : {}) }, opts);
}

/** The decision to use now, if a ready kit was built for exactly this point in her cycle. */
export function prebuiltDecisionFor(cycle: LearningCycleRecordV2 | null, opts: LearningCycleRepositoryOptions = {}): PrebuiltKit | null {
  if (!cycle) return null;
  const kit = readPrebuiltKit(cycle.childId, cycle.homeworkId, opts);
  return kit?.status === "ready" && kit.fromLifecycle === cycle.lifecycle ? kit : null;
}

/** Her game from the kit, served as the builder's reply, so it is checked and bound like any new game. */
export function prebuiltGameClient(childId: string, homeworkId: string, nodeId: string, opts: LearningCycleRepositoryOptions = {}): SpellingGameClient | undefined {
  const html = readPrebuiltKit(childId, homeworkId, opts)?.games[nodeId];
  if (!html) return undefined;
  console.log(` 🎮 [prebuilt-board] [game] [replayed] homework=${homeworkId} node=${nodeId} provider_calls=0`);
  return { messages: { stream: () => ({ finalMessage: async () => ({ content: [{ type: "text", text: html }], usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: "end_turn" }) as never }) } };
}

// Capture, on the sandbox run only: SUNNY_PREBUILD_CAPTURE names a folder outside her real data.
const captureDir = () => process.env.SUNNY_PREBUILD_CAPTURE?.trim() || undefined;

export function captureDecision(decision: unknown): void {
  const dir = captureDir();
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "decision.json"), JSON.stringify(decision, null, 2));
  console.log(` 🎮 [prebuilt-board] [capture] [decision] dir=${dir}`);
}

export function captureGame(nodeId: string, html: string): void {
  const dir = captureDir();
  if (!dir) return;
  fs.mkdirSync(path.join(dir, "games"), { recursive: true });
  fs.writeFileSync(path.join(dir, "games", `${encodeURIComponent(nodeId)}.html`), html);
  console.log(` 🎮 [prebuilt-board] [capture] [game] node=${nodeId}`);
}

export function kitFromCapture(dir: string, at: { childId: string; homeworkId: string; fromLifecycle: LearningCycleRecordV2["lifecycle"] }): PrebuiltKit {
  const decision = JSON.parse(fs.readFileSync(path.join(dir, "decision.json"), "utf8")) as PrebuiltKit["decision"];
  const gamesDir = path.join(dir, "games");
  const games = Object.fromEntries((fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir) : []).filter(name => name.endsWith(".html"))
    .map(name => [decodeURIComponent(name.slice(0, -5)), fs.readFileSync(path.join(gamesDir, name), "utf8")]));
  return { version: 1, ...at, decision, games, createdAt: new Date().toISOString(), status: "ready" };
}
