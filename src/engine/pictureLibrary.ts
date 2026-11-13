import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";

/**
 * Each child's library of map-stop pictures (owner, 2026-11-13): "reuse images to keep the cost down, group them
 * and reuse them so they make sense, only call one when we need one for a specific theme." A stop reuses a
 * library picture whose subject words match its picture prompt; only a stop with nothing fitting is painted.
 * Presentation only: a picture never carries learning evidence and never holds back the board.
 */
export type PictureKind = "activity" | "mystery" | "quest" | "boss";
export type PictureLibraryEntry = { path: string; prompt: string; keywords: string[]; kind: PictureKind; homeworkId: string; createdAt: string };
export type PictureStop = { nodeId: string; kind: PictureKind; prompt: string };
export type PicturePlan = { nodeId: string; reuse: PictureLibraryEntry } | { nodeId: string; paint: string } | { nodeId: string; keepIcon: true };

const FILLER = new Set(["the", "and", "with", "that", "this", "for", "from", "into", "onto", "out", "over", "under", "her", "his", "its", "their", "she", "they", "are", "was", "has", "have", "who", "what", "each", "every", "just", "very", "all", "one", "two", "three", "some", "other", "side", "while", "where", "then", "than", "there", "here", "like", "next", "ready"]);
const MIN_SHARED_WORDS = 3;
const MIN_SHARED_SHARE = 0.4;

/** The subject words of a picture prompt: no filler, numbers, or the child's own name. */
export function pictureKeywords(prompt: string, childNames: readonly string[]): string[] {
  const names = new Set(childNames.map(name => name.toLowerCase()));
  const words = prompt.toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 3 && !FILLER.has(word) && !names.has(word));
  return [...new Set(words)];
}

function fit(a: readonly string[], b: readonly string[]): number {
  const shared = a.filter(word => b.includes(word)).length;
  if (shared < MIN_SHARED_WORDS) return 0;
  const share = shared / Math.min(a.length, b.length);
  return share >= MIN_SHARED_SHARE ? share : 0;
}

/** For one board: reuse the best-fitting picture of the same kind, never twice on the board; paint at most maxNew. */
export function planBoardPictures(input: { stops: readonly PictureStop[]; library: readonly PictureLibraryEntry[]; childNames: readonly string[]; maxNew: number }): PicturePlan[] {
  const used = new Set<string>();
  let painted = 0;
  return input.stops.map(stop => {
    const words = pictureKeywords(stop.prompt, input.childNames);
    let best: PictureLibraryEntry | null = null, bestFit = 0;
    for (const candidate of input.library) {
      if (candidate.kind !== stop.kind || used.has(candidate.path)) continue;
      const score = fit(words, candidate.keywords);
      if (score > bestFit) { best = candidate; bestFit = score; }
    }
    if (best) { used.add(best.path); return { nodeId: stop.nodeId, reuse: best }; }
    if (painted < input.maxNew) { painted += 1; return { nodeId: stop.nodeId, paint: stop.prompt }; }
    return { nodeId: stop.nodeId, keepIcon: true as const };
  });
}

function libraryFile(childId: string, rootDir?: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "pictures", "library.json");
}

export function readPictureLibrary(childId: string, opts: { rootDir?: string } = {}): PictureLibraryEntry[] {
  const file = libraryFile(childId, opts.rootDir);
  if (!fs.existsSync(file)) return [];
  try {
    return (JSON.parse(fs.readFileSync(file, "utf8")) as { pictures?: PictureLibraryEntry[] }).pictures ?? [];
  } catch (error) {
    console.error(` 🎮 [picture-library] [read] [unreadable] child=${childId}`, error);
    return [];
  }
}

export function savePictureLibrary(childId: string, pictures: readonly PictureLibraryEntry[], opts: { rootDir?: string } = {}): void {
  const file = libraryFile(childId, opts.rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version: 1, pictures }, null, 2));
  fs.renameSync(temp, file);
  console.log(` 🎮 [picture-library] [saved] child=${childId} pictures=${pictures.length}`);
}

/** A painted library picture's file name: the child and a hash of the prompt, so a re-run reuses the file. */
export function pictureFilename(childId: string, prompt: string): string {
  return `node-picture-${childId.replace(/[^a-z0-9_-]/gi, "")}-${createHash("sha256").update(prompt).digest("hex").slice(0, 16)}.jpeg`;
}

/** Library pictures belong to their stop: binding the stop's game must not put the placeholder back. */
export function isLibraryPicture(localPath: string | null | undefined): boolean {
  return Boolean(localPath?.startsWith("/generated/direct-math/node-picture-"));
}
