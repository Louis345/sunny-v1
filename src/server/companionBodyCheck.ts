import fs from "fs";
import path from "path";
import { CompanionRegistry } from "../prompts/companions/registry";

/**
 * BUGS.md W7 (a): every human-approved dressable body (web/src/lib/wardrobeHumanApprovals.ts) and every
 * catalog base body (src/prompts/companions/<id>/companion.json vrmPath) must be on disk under
 * web/public. A missing file is otherwise silent: the static server answers a missing .vrm with the app
 * page. Logs one line per missing body and one summary; never throws, never blocks startup.
 */
export type CompanionBodyCheck = { checked: number; missing: Array<{ companion: string; file: string }> };

const DEFAULT_APPROVALS = path.resolve(process.cwd(), "web", "src", "lib", "wardrobeHumanApprovals.ts");

/** The approval list is web code the server cannot import (rootDir is src), so its body URLs are read as text. */
function approvedBodies(source: string): Array<{ companion: string; file: string }> {
  return [...source.matchAll(/^\s*(\w+):\s*\{\s*modelUrl:\s*"(\/companions\/[^"]+\.vrm)"/gm)]
    .map(([, companion, file]) => ({ companion, file }));
}

export function checkCompanionBodies(opts: {
  publicDir?: string;
  approvalsFile?: string;
  approvalsSource?: string;
  catalog?: Array<{ id: string; vrmPath: string }>;
} = {}): CompanionBodyCheck {
  const publicDir = opts.publicDir ?? path.resolve(process.cwd(), "web", "public");
  const bodies: Array<{ companion: string; file: string }> = [];
  try {
    bodies.push(...approvedBodies(opts.approvalsSource ?? fs.readFileSync(opts.approvalsFile ?? DEFAULT_APPROVALS, "utf8")));
  } catch (error) {
    console.error(` 🎮 [companions] [body-check] [approvals-unreadable] reason=${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const catalog = opts.catalog ?? CompanionRegistry.getAll();
    for (const companion of catalog) if (companion.vrmPath) bodies.push({ companion: companion.id, file: companion.vrmPath });
  } catch (error) {
    console.error(` 🎮 [companions] [body-check] [catalog-unreadable] reason=${error instanceof Error ? error.message : String(error)}`);
  }
  const seen = new Set<string>();
  const unique = bodies.filter(body => { const key = `${body.companion}\u0000${body.file}`; return !seen.has(key) && Boolean(seen.add(key)); });
  const missing = unique.filter(body => !fs.existsSync(path.join(publicDir, body.file.replace(/^\/+/, ""))));
  for (const body of missing) console.warn(` 🎮 [companions] [body] [missing] companion=${body.companion} file=${body.file}`);
  const summary = ` 🎮 [companions] [body-check] [${missing.length ? "missing" : "ok"}] checked=${unique.length} missing=${missing.length}`;
  if (missing.length) console.warn(summary); else console.log(summary);
  return { checked: unique.length, missing };
}
