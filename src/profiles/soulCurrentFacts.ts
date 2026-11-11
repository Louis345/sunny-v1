import fs from "node:fs";
import path from "node:path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { resolveChildContextDir } from "../utils/contextRoot";
import { currentDemographics } from "./currentDemographics";

/**
 * Her soul.md is a dated narrative (Ila's was written from an old evaluation: "Grade: 2nd"). Every AI that reads it gets
 * her current facts first, as of today, marked as replacing the older age/grade/school/teacher lines below (2026-11-10).
 * Low-level IO adapter: the same demographics the chart uses (learning_profile, overridden by child_profile).
 */
const readDemographics = (dir: string, file: string): Partial<LearningProfile["demographics"]> => {
  try { return (JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as { demographics?: LearningProfile["demographics"] }).demographics ?? {}; }
  catch { return {}; }
};

export function currentFactsBlock(childId: string, opts: { rootDir?: string; today?: Date } = {}): string {
  const dir = resolveChildContextDir(childId, { rootDir: opts.rootDir });
  const facts = currentDemographics({ ...readDemographics(dir, "learning_profile.json"), ...readDemographics(dir, "child_profile.json") } as LearningProfile["demographics"], opts.today);
  const undated = new Set(facts.factsUndated ?? []);
  const today = opts.today ?? new Date(), start = today.getUTCFullYear() - (today.getUTCMonth() < 7 ? 1 : 0);
  const year = typeof facts.gradeSchoolYear === "number" ? ` (school year ${start}-${String((start + 1) % 100).padStart(2, "0")})` : "";
  const lines = [
    typeof facts.age === "number" ? `- Age: ${facts.age}${facts.birthDate ? ` (born ${facts.birthDate})` : ""}${undated.has("age") ? " (not dated; may be out of date)" : ""}` : "",
    typeof facts.grade === "number" ? `- Grade: ${facts.grade}${undated.has("grade") ? " (not dated; may be out of date)" : year}` : "",
    facts.school ? `- School: ${facts.school}` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return [`## Current facts (as of ${today.toISOString().slice(0, 10)}; these replace any age, grade, school or teacher written in the profile below, which was written earlier)`, ...lines].join("\n");
}

/** Her soul.md for an AI, with her current dated facts first. */
export function readSoulWithCurrentFacts(childId: string, opts: { rootDir?: string; today?: Date } = {}): string {
  const id = childId.trim().toLowerCase();
  const soul = fs.readFileSync(path.join(resolveChildContextDir(id, { rootDir: opts.rootDir }), "soul.md"), "utf-8");
  const block = currentFactsBlock(id, opts);
  return block ? `${block}\n\n${soul}` : soul;
}
