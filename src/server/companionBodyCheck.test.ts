import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { checkCompanionBodies } from "./companionBodyCheck";

// BUGS.md W7 (a), human-caught 2026-11-15: Reina's FaceTime with Melty had no outfits because Saori had
// only two of the eight approved dressable bodies on disk.
// Why the human caught it: only a child's real earned call loads the prepared bodies.
// Why logs missed it: a missing .vrm is served as the app page (200), so nothing failed loudly.
// Why the lab missed it: tests read the approval list, never the files on the kiosk.
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function publicDirWith(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-companion-bodies-")); roots.push(root);
  fs.mkdirSync(path.join(root, "companions"), { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(root, "companions", file), "vrm");
  return root;
}

const approvalsSource = `export const WARDROBE_HUMAN_APPROVAL_BATCH = {
  bodies: {
    elli: { modelUrl: "/companions/elli-wardrobe-identity-preserved-v1.vrm", preparedSha256: "x", recipeVersion: "identity-preserved-v1" },
    melty: { modelUrl: "/companions/melty-wardrobe-native-identity-v1.vrm", preparedSha256: "y", recipeVersion: "native-identity-v1" },
  },
};`;
const catalog = [{ id: "elli", vrmPath: "/companions/sample.vrm" }, { id: "melty", vrmPath: "/companions/4573661938486170180.vrm" }];

it("logs one line per missing approved body plus a summary, and never throws", () => {
  const publicDir = publicDirWith(["elli-wardrobe-identity-preserved-v1.vrm", "sample.vrm", "4573661938486170180.vrm"]);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const result = checkCompanionBodies({ publicDir, approvalsSource, catalog });
  expect(result.missing).toEqual([{ companion: "melty", file: "/companions/melty-wardrobe-native-identity-v1.vrm" }]);
  expect(result.checked).toBe(4);
  expect(warn.mock.calls.map(call => call[0])).toEqual([
    " 🎮 [companions] [body] [missing] companion=melty file=/companions/melty-wardrobe-native-identity-v1.vrm",
    " 🎮 [companions] [body-check] [missing] checked=4 missing=1",
  ]);
  expect(log).not.toHaveBeenCalled();
});

it("logs an ok summary when every body is on disk", () => {
  const publicDir = publicDirWith(["elli-wardrobe-identity-preserved-v1.vrm", "melty-wardrobe-native-identity-v1.vrm", "sample.vrm", "4573661938486170180.vrm"]);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(checkCompanionBodies({ publicDir, approvalsSource, catalog }).missing).toEqual([]);
  expect(log).toHaveBeenCalledWith(" 🎮 [companions] [body-check] [ok] checked=4 missing=0");
});

it("reads the real approval list and catalog (all eight prepared bodies and every base body)", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const result = checkCompanionBodies({ publicDir: publicDirWith([]) });
  const prepared = result.missing.filter(row => /-wardrobe-/.test(row.file));
  expect(prepared.map(row => row.companion).sort()).toEqual(["elli", "kefla", "matilda", "melty", "princess", "tene", "towa", "yukari"]);
  expect(result.missing.some(row => row.file === "/companions/sample.vrm")).toBe(true);
});

it("never blocks startup when the approval list cannot be read", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(() => checkCompanionBodies({ publicDir: publicDirWith(["sample.vrm"]), approvalsFile: "/nonexistent/approvals.ts", catalog: [{ id: "elli", vrmPath: "/companions/sample.vrm" }] })).not.toThrow();
  expect(error.mock.calls[0][0]).toMatch(/^ 🎮 \[companions\] \[body-check\] \[approvals-unreadable\]/);
});
