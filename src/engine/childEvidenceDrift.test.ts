import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHILD_EVIDENCE_SOURCES, FROZEN_RECORD_SECTIONS, LIVE_RECORD_SECTIONS, readChildEvidenceSection } from "../profiles/childEvidence";

// Owner 2026-11-23: "I need to ensure that it reflects and has entire system accessible." The Planner judged rounding
// secure without reading what its games taught or what she said; many recorded sources had no read path at all. Like
// voiceGuard: every place code keeps something about a child is listed here with the Planner's read path, or left out
// with a reason. A new source fails this test until it is wired or excluded.

function childFolderNamesInCode(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!/^(node_modules|tests|fixtures)$/.test(entry.name)) walk(full); continue; }
      if (!/\.ts$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, "utf8");
      for (const match of source.matchAll(/path\.join\(\s*(?:resolveChildContextDir|contextDir|childContextDir)\([^()]*(?:\([^()]*\)[^()]*)*\)\s*,\s*["'`]([^"'`$]+)["'`]/g)) {
        const name = match[1].split("/")[0];
        found.set(name, [...new Set([...(found.get(name) ?? []), path.relative(process.cwd(), full)])]);
      }
    }
  };
  walk(path.join(process.cwd(), "src"));
  return found;
}

describe("every recorded child source has a Planner read path, or a stated reason it has none", () => {
  it("each child folder or file that code writes or reads is in CHILD_EVIDENCE_SOURCES", () => {
    const missing = [...childFolderNamesInCode()].filter(([name]) => !CHILD_EVIDENCE_SOURCES[name]).map(([name, files]) => `${name} (${files.join(", ")})`);
    expect(missing, "add each to src/profiles/childEvidence.ts with its read path, or exclude it with a reason").toEqual([]);
  });

  it("each source is read somewhere or excluded with a reason, and every read_record section it names exists", () => {
    const sections = new Set<string>([...FROZEN_RECORD_SECTIONS, ...LIVE_RECORD_SECTIONS]);
    for (const [name, source] of Object.entries(CHILD_EVIDENCE_SOURCES)) {
      expect(source.read.length > 0 || Boolean(source.excluded?.trim()), name).toBe(true);
      for (const line of source.read.filter(row => row.startsWith("read_record:"))) {
        for (const section of line.slice("read_record:".length).split(",").map(row => row.trim())) expect(sections.has(section), `${name} names read_record ${section}`).toBe(true);
      }
    }
    // Every live section is backed by a registered source.
    const named = Object.values(CHILD_EVIDENCE_SOURCES).flatMap(source => source.read.filter(row => row.startsWith("read_record:")).flatMap(row => row.slice(12).split(",").map(part => part.trim())));
    for (const section of LIVE_RECORD_SECTIONS) expect(named, section).toContain(section);
  });

  it("names the sources whose words can be someone else's (the kiosk mic hears the room)", () => {
    expect(CHILD_EVIDENCE_SOURCES.child_signals!.trust).toMatch(/parents' conversation/);
    expect(CHILD_EVIDENCE_SOURCES.companion_interactions!.trust).toMatch(/other people in the room/);
  });
});

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("live sections read her files as of the question's time, newest first", () => {
  it("skips what was written after the question and reads every kind of file", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-evidence-")); roots.push(rootDir);
    const dir = path.join(rootDir, "src/context/lab-child");
    const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
    write("companion_interactions/2026-11-22.ndjson", [
      { id: "a", questionText: "I don't understand the concept.", companionText: "Let's slow down.", callSource: "activity_help", createdAt: "2026-11-22T23:23:36.000Z" },
      { id: "b", questionText: "later", companionText: "x", callSource: "game_reward", createdAt: "2026-11-23T05:00:00.000Z" },
    ].map(row => JSON.stringify(row)).join("\n"));
    write("child_signals/2026-11-22.ndjson", JSON.stringify({ childSignalId: "s1", signalType: "frustration", dimension: "help", valence: "negative", source: "observed_behavior", evidenceText: "upset", createdAt: "2026-11-22T23:24:00.000Z" }));
    write("soul.md", "## Who she is\nLoves Fuji.\n");
    write("lab-child_context.md", "IEP: extended time.\n");
    write("session_notes/2026-11-22.md", "# Session Note\n");
    write("teaching_notes.md", "## 2026-11-22 Parent\nMeaning first.\n");
    const input = { childId: "lab-child", asOf: "2026-11-23T00:00:00.000Z", rootDir };
    expect(readChildEvidenceSection("her_talk", input)).toEqual([{ id: "a", at: "2026-11-22T23:23:36.000Z", call: "activity_help", she_said: "I don't understand the concept.", companion_said: "Let's slow down." }]);
    expect(readChildEvidenceSection("child_signals", input)).toMatchObject([{ id: "s1", type: "frustration", observed: "upset" }]);
    expect(readChildEvidenceSection("about_her", input)).toEqual([{ file: "soul.md", part: 1, text: "## Who she is\nLoves Fuji.\n" }, { file: "lab-child_context.md", part: 1, text: "IEP: extended time.\n" }]);
    expect(readChildEvidenceSection("session_notes", input)).toEqual([{ date: "2026-11-22", text: "# Session Note" }]);
    expect(readChildEvidenceSection("teaching_notes", input)).toMatchObject([{ id: "note:2026-11-22:1" }]);
    expect(readChildEvidenceSection("sessions", input)).toEqual([]);
  });
});
