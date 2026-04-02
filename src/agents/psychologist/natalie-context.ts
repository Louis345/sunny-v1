import fs from "fs";
import path from "path";
import { loadChildFiles } from "../../utils/loadChildFiles";
import { PSYCHOLOGIST_CONTEXT } from "../prompts";

/**
 * Load optional SLP (Natalie) notes from src/context/{ila|reina}/natalie/*.md
 */
export function readNatalieContext(childSlug: string): string | null {
  const slug = childSlug.trim().toLowerCase();
  if (slug !== "ila" && slug !== "reina") return null;
  const dir = path.resolve(process.cwd(), "src", "context", slug, "natalie");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .sort();
  if (files.length === 0) return null;
  const bodies = files.map((f) =>
    fs.readFileSync(path.join(dir, f), "utf-8"),
  );
  const displayName = slug === "ila" ? "Ila" : "Reina";
  return (
    `## Clinical Sessions (Licensed SLP)\n` +
    `The following notes are from ${displayName}'s\n` +
    `speech-language pathologist.\n` +
    `Weight these observations heavily.\n` +
    `They represent in-person clinical assessment.\n\n` +
    bodies.join("\n\n---\n\n")
  );
}

/** User-side evidence bundle for the Psychologist (sessions + attempts + curriculum), optional Natalie block first. */
export function buildPsychologistContext(childSlug: string): string {
  const slug = childSlug.trim().toLowerCase();
  if (slug !== "ila" && slug !== "reina") {
    throw new Error(`Unknown child slug: ${childSlug}`);
  }
  const childName = slug === "ila" ? ("Ila" as const) : ("Reina" as const);
  const { context, curriculum, attempts } = loadChildFiles(childName);
  const base = PSYCHOLOGIST_CONTEXT(childName, context, attempts, curriculum);
  const natalie = readNatalieContext(slug);
  return natalie ? `${natalie}\n\n${base}` : base;
}
