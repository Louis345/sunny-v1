import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { recordWardrobeSignal } from "./wardrobeSignals";

// Owner 2026-11-12: rewards should follow what the kids want. What they look at, try on, save and buy is the signal a
// future shopkeeper reads. It lived only in the kiosk browser's storage; now each one is saved on the server, in its
// own file, apart from learning evidence (rewards never change learning evidence).
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("appends one dated line per shop signal to the child's wardrobe signal file", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-wardrobe-signal-")); roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "src/context/reina"), { recursive: true });
  recordWardrobeSignal("reina", { companionId: "matilda", itemId: "sky-ribbon-dress", action: "previewed", verdict: "reject" }, { rootDir });
  recordWardrobeSignal("reina", { companionId: "matilda", itemId: "sky-ribbon-dress", action: "purchased" }, { rootDir });
  const lines = fs.readFileSync(path.join(rootDir, "src/context/reina/sunny_health/wardrobe-signals.ndjson"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatchObject({ childId: "reina", companionId: "matilda", itemId: "sky-ribbon-dress", action: "previewed", verdict: "reject" });
  expect(typeof lines[0].at).toBe("string");
  expect(lines[1]).toMatchObject({ action: "purchased" });
});

it("refuses an unknown action or a missing item, and writes nothing", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-wardrobe-signal-")); roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "src/context/reina"), { recursive: true });
  expect(() => recordWardrobeSignal("reina", { companionId: "matilda", itemId: "x", action: "hacked" as never }, { rootDir })).toThrow("invalid_wardrobe_action");
  expect(() => recordWardrobeSignal("reina", { companionId: "matilda", itemId: "", action: "previewed" }, { rootDir })).toThrow("item_required");
  expect(() => recordWardrobeSignal("nobody", { companionId: "matilda", itemId: "x", action: "previewed" }, { rootDir })).toThrow("unknown_child");
  expect(fs.existsSync(path.join(rootDir, "src/context/reina/sunny_health/wardrobe-signals.ndjson"))).toBe(false);
  expect(fs.existsSync(path.join(rootDir, "src/context/nobody"))).toBe(false);
});
