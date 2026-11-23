/**
 * Parent and tutor teaching notes (docs/specs/child-knowledge-store.md "parent and tutor teaching notes"; owner + Saori
 * 2026-11-22). Outside knowledge the Planner reads first: what a parent or tutor saw and what worked at the table, each
 * dated and with who wrote it. A person writes `src/context/<child>/teaching_notes.md` by hand, one entry per dated
 * heading (`## YYYY-MM-DD Who wrote it`). Sunny only reads it (no lifetime row: Sunny never writes it); the file name is
 * gitignored for every child so child data never reaches GitHub. Minimal until the child knowledge store holds these
 * as confirmed rows.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";

export const TEACHING_NOTES_FILE = "teaching_notes.md";
export type TeachingNote = { id: string; date: string; source: string; text: string };

const HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*[-–—:,]?\s*(.*)$/;
const MAX_NOTES = 20, MAX_CHARS = 1200;

export function teachingNotesFile(childId: string, opts: { rootDir?: string } = {}): string {
  return path.join(resolveChildContextDir(childId, { rootDir: opts.rootDir }), TEACHING_NOTES_FILE);
}

/** Every dated entry, oldest first; anything outside a dated heading is ignored. A missing file is no notes. */
export function readTeachingNotes(childId: string, opts: { rootDir?: string } = {}): TeachingNote[] {
  let text = "";
  try { text = fs.readFileSync(teachingNotesFile(childId, opts), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(` 🎮 [teaching-notes] [read] [failed] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
  const entries: Array<{ date: string; source: string; lines: string[] }> = [];
  let current: { date: string; source: string; lines: string[] } | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      const match = line.match(HEADING);
      current = match && Number.isFinite(Date.parse(`${match[1]}T00:00:00Z`)) ? { date: match[1], source: match[2].trim() || "not named", lines: [] } : undefined;
      if (current) entries.push(current);
      continue;
    }
    current?.lines.push(line);
  }
  const perDay = new Map<string, number>();
  const notes = entries.map(entry => {
    const n = (perDay.get(entry.date) ?? 0) + 1;
    perDay.set(entry.date, n);
    return { id: `note:${entry.date}:${n}`, date: entry.date, source: entry.source, text: entry.lines.join("\n").trim().slice(0, MAX_CHARS) };
  }).filter(note => note.text).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).slice(-MAX_NOTES);
  console.log(` 🎮 [teaching-notes] [read] [${notes.length ? "found" : "none"}] child=${childId} notes=${notes.length}`);
  return notes;
}

export function teachingNotesSection(notes: TeachingNote[]): string {
  return ["Teaching notes from outside Sunny (read these first: outside knowledge from a parent or tutor, dated, with who wrote it; cite the ids in brackets):",
    ...(notes.length ? notes.map(note => `- [${note.id}] ${note.date}, ${note.source}: ${note.text.replace(/\n+/g, " / ")}`)
      : [`- None recorded. A parent or tutor can add dated notes to her ${TEACHING_NOTES_FILE}.`])].join("\n");
}
