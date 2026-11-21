import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { pictureKeywords, planBoardPictures, readPictureLibrary, savePictureLibrary, type PictureLibraryEntry } from "./pictureLibrary";

// 2026-11-13 owner-caught: map stops showed plain placeholder icons, never Grok pictures. Each new stop copied the
// last stop's placeholder icon and was marked "ready", and no new board ever ran the painter. Why the human caught
// it: the pictures are on her map. Why the logs missed it: a placeholder icon is a valid thumbnail. Why the lab
// missed it: it checked that thumbnails load, not that they are the stop's own picture. Owner's rule for the fix:
// keep a picture library, reuse a picture that fits, and call Grok only when a stop needs a new one.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const entry = (prompt: string, kind: PictureLibraryEntry["kind"], file: string): PictureLibraryEntry =>
  ({ path: `/generated/direct-math/${file}`, prompt, keywords: pictureKeywords(prompt, ["reina"]), kind, homeworkId: "hw-old", createdAt: "2026-11-12T00:00:00.000Z" });

it("reads a picture prompt as its subject words, without the child's name, numbers or filler", () => {
  expect(pictureKeywords("Reina on a wrestling mat flipping a giant number card that shows 42 and 6 × 7", ["reina"]))
    .toEqual(["wrestling", "mat", "flipping", "giant", "number", "card", "shows"]);
});

it("reuses a library picture that fits the stop and paints only stops with nothing fitting", () => {
  const library = [
    entry("A gold treasure chest with a wrestling belt peeking out of the lid", "mystery", "chest.jpeg"),
    entry("Reina on a wrestling mat flipping a giant glowing number card", "activity", "card.jpeg"),
  ];
  const plan = planBoardPictures({
    childNames: ["reina"], library, maxNew: 4,
    stops: [
      { nodeId: "m", kind: "mystery", prompt: "A shiny gift box with a gold wrestling medal peeking out of the lid" },
      { nodeId: "a", kind: "activity", prompt: "Reina flipping a giant glowing number card on the wrestling mat before the match" },
      { nodeId: "b", kind: "activity", prompt: "Kappa collecting cucumbers across a pond of stepping stones" },
    ],
  });
  expect(plan).toEqual([
    { nodeId: "m", reuse: library[0] },
    { nodeId: "a", reuse: library[1] },
    { nodeId: "b", paint: "Kappa collecting cucumbers across a pond of stepping stones" },
  ]);
});

it("never shows the same picture twice on one board, and never reuses across kinds", () => {
  const library = [entry("Reina on a wrestling mat flipping a giant glowing number card", "activity", "card.jpeg")];
  const plan = planBoardPictures({
    childNames: ["reina"], library, maxNew: 4,
    stops: [
      { nodeId: "a", kind: "activity", prompt: "Reina flipping a giant glowing number card on the wrestling mat" },
      { nodeId: "b", kind: "activity", prompt: "A giant glowing number card flipped on the wrestling mat" },
      { nodeId: "m", kind: "mystery", prompt: "A giant glowing number card on the wrestling mat" },
    ],
  });
  expect(plan.map(row => "reuse" in row ? "reuse" : "paint")).toEqual(["reuse", "paint", "paint"]);
});

it("caps new paintings per board; the rest keep their icon", () => {
  const stops = ["dragons", "rockets", "oceans", "castles"].map((topic, index) => ({ nodeId: `n${index}`, kind: "activity" as const, prompt: `${topic} flying over bright hills` }));
  const plan = planBoardPictures({ childNames: ["ila"], library: [], maxNew: 2, stops });
  expect(plan.map(row => "paint" in row ? "paint" : "reuse" in row ? "reuse" : "icon")).toEqual(["paint", "paint", "icon", "icon"]);
});

it("keeps one library file per child, written atomically", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-picture-library-")); roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "src/context/reina"), { recursive: true });
  expect(readPictureLibrary("reina", { rootDir })).toEqual([]);
  const saved = [entry("A gold treasure chest", "mystery", "chest.jpeg")];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  savePictureLibrary("reina", saved, { rootDir });
  log.mockRestore();
  expect(readPictureLibrary("reina", { rootDir })).toEqual(saved);
  expect(fs.readdirSync(path.join(rootDir, "src/context/reina/pictures"))).toEqual(["library.json"]);
});
