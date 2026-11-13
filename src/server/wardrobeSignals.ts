import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";

export const WARDROBE_SIGNAL_ACTIONS = ["previewed", "left_try_on", "saved", "purchased", "equipped"] as const;
export type WardrobeSignal = {
  companionId: string;
  itemId: string;
  action: (typeof WARDROBE_SIGNAL_ACTIONS)[number];
  verdict?: string;
};

/**
 * What a child looks at, tries on, saves and buys in the shop (owner, 2026-11-12): the signal a future shopkeeper
 * reads to keep rewards fresh. Its own file, never learning evidence.
 */
export function recordWardrobeSignal(childId: string, signal: WardrobeSignal, opts: { rootDir?: string } = {}): void {
  if (!WARDROBE_SIGNAL_ACTIONS.includes(signal.action)) throw new Error("invalid_wardrobe_action");
  const itemId = String(signal.itemId ?? "").trim().slice(0, 80), companionId = String(signal.companionId ?? "").trim().slice(0, 40);
  if (!itemId) throw new Error("item_required");
  if (!companionId) throw new Error("companion_required");
  const childDir = resolveChildContextDir(childId, { rootDir: opts.rootDir });
  if (!/^[a-z0-9_-]+$/.test(childId) || !fs.existsSync(childDir)) throw new Error("unknown_child");
  const dir = path.join(childDir, "sunny_health");
  fs.mkdirSync(dir, { recursive: true });
  const verdict = typeof signal.verdict === "string" ? signal.verdict.slice(0, 20) : undefined;
  fs.appendFileSync(path.join(dir, "wardrobe-signals.ndjson"), `${JSON.stringify({ at: new Date().toISOString(), childId, companionId, itemId, action: signal.action, ...(verdict ? { verdict } : {}) })}\n`);
  console.log(` 🎮 [wardrobe-signal] [recorded] child=${childId} companion=${companionId} item=${itemId} action=${signal.action}`);
}
