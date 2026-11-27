import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";

type Facts = { grade?: number; gradeSchoolYear?: number; birthDate?: string; school?: string; diagnoses?: string[]; iepActive?: boolean };

/**
 * A parent's correction to a child's facts (2026-11-10), written to every file that holds them (learning_profile.json,
 * and child_profile.json, which overrides it) and logged with the before and after. Never a guess: only what the
 * parent gave.
 */
export function setChildFacts(childId: string, facts: Facts, source: string, opts: { rootDir?: string } = {}): void {
  if (facts.birthDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(facts.birthDate)) throw new Error("birth_date_must_be_yyyy_mm_dd");
  if (!source.trim()) throw new Error("source_required");
  const dir = resolveChildContextDir(childId, { rootDir: opts.rootDir });
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const name of ["learning_profile.json", "child_profile.json"]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { demographics?: Record<string, unknown> };
    if (name === "child_profile.json" && !json.demographics) continue;
    const before = json.demographics ?? {};
    for (const [key, value] of Object.entries(facts)) if (value !== undefined && JSON.stringify(before[key]) !== JSON.stringify(value)) changes[key] ??= { from: before[key], to: value };
    json.demographics = { ...before, ...Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined)) };
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(json, null, 2)}\n`); fs.renameSync(`${file}.tmp`, file);
  }
  const log = path.join(dir, "sunny_health", "profile-changes.ndjson");
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), source: source.trim(), changes })}\n`);
  console.log(` 🎮 [child-facts] [set] child=${childId} changed=${Object.keys(changes).join(",") || "none"} source=${JSON.stringify(source.trim())}`);
}
