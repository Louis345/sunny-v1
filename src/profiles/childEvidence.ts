/**
 * Everything Sunny records about a child, and how the Planner reads it (owner 2026-11-23: "I need to ensure that it
 * reflects and has entire system accessible"). One registry: each source names where it lives and the Planner's read
 * path (in the question, a read_record section, query_record, read_past_weeks, read_board_wording), or why it is left
 * out. childEvidenceDrift.test.ts fails when code writes a new child source that is in neither list.
 *
 * Live sections are read from her files on demand, page by page, as of the moment the question was asked (rows after
 * `asOf` are skipped), so nothing large is frozen into the saved question and a restart reads the same rows.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { readTeachingNotes } from "../engine/teachingNotes";

export type EvidenceSource = { where: string; read: string[]; excluded?: string; trust?: string };

/** Sections read_record answers from the saved question (built in learningCycleRuntime). */
export const FROZEN_RECORD_SECTIONS = ["lifecycle", "assignment", "theory", "predictions", "prediction_evaluations", "evidence", "observations", "stops", "learning_history", "prior_plan", "time", "decisions", "school_forecasts"] as const;
/** Sections read_record answers live from her files (this module). */
export const LIVE_RECORD_SECTIONS = ["her_talk", "child_signals", "session_notes", "choices", "ratings", "motivation", "about_her", "teaching_notes", "companion_memory", "sessions", "session_transcripts", "screens_and_narration", "room_talk"] as const;
export type LiveRecordSection = typeof LIVE_RECORD_SECTIONS[number];

/** Keyed by the first path segment under `src/context/<child>/`, plus `chart:` and `logs:` sources outside it. */
export const CHILD_EVIDENCE_SOURCES: Record<string, EvidenceSource> = {
  "homework": { where: "homework/cycles/*.json (answers, help, exposure, predictions, decisions, boards), games/*.html, handoffs, scorecards, planner-journal, returned-work",
    read: ["question: track record, concept signal, journal, calls, school tests, handoff, scorecard", "read_record: observations, evidence, stops, theory, predictions, prediction_evaluations, decisions, school_forecasts, time", "read_board_wording: each board's own words", "read_past_weeks: earlier assignments"] },
  "chart:events": { where: "~/SunnyData/<child>.db events (responses, presentations, engagement, priors, forecasts, school tests, facts learned)", read: ["query_record (when her chart database opens)"] },
  "learning_profile.json": { where: "learning_profile.json", read: ["question: child chart context (demographics, diagnoses, support needs)"] },
  "companion_interactions": { where: "companion_interactions/<day>.ndjson: her words and her companion's reply, in play help, FaceTime after a board and showroom calls",
    read: ["question: her words about understanding (concept signal)", "read_record: her_talk"], trust: "speech-to-text from the kiosk mic: other people in the room can be captured as her" },
  "child_signals": { where: "child_signals/<day>.ndjson: frustration, help, preference, as the companion observed them", read: ["question: recent preference signals (child chart)", "read_record: child_signals"],
    trust: "the kiosk mic recorded the parents' conversation as Ila's help requests on 2026-11-23 about 02:23 UTC; a signal is an observation, not her confirmed words" },
  "room_talk": { where: "room_talk/<day>.ndjson: one digest per session of what the kiosk mic heard while her companion was minimized (a cheap model's summary; quotes kept only when really heard)",
    read: ["question: her words about understanding (concept signal)", "read_record: room_talk"], trust: "anyone in the room may be speaking: her, her parents, her sister" },
  "session_notes": { where: "session_notes/<day>.md", read: ["read_record: session_notes"] },
  "choice_events": { where: "choice_events/<day>.ndjson: routes and options she picked", read: ["read_record: choices"] },
  "ratings": { where: "ratings/*.ndjson: her ratings of activities", read: ["read_record: ratings"] },
  "product_issues": { where: "product_issues/<day>.ndjson: what she said about Sunny's games", read: ["question: what she said about Sunny's games"] },
  "sunny_health": { where: "sunny_health/: wardrobe-signals (what she liked or tried on), parent alerts, profile changes, held completions, problems",
    read: ["read_record: motivation"], excluded: "wardrobe signals are read as motivation; parent alerts, profile changes, held completions and problems are Sunny's own operational records, not observations of her" },
  "companion_care": { where: "companion_care/<companion>.json: her companion's running memory of her", read: ["read_record: companion_memory"] },
  "companion_relationships": { where: "companion_relationships/<companion>.json: which companions she met and chose", read: ["read_record: companion_memory"] },
  "soul.md": { where: "soul.md (who she is; child-facing sections)", read: ["question: about her (child-facing sections)", "read_record: about_her"] },
  "child_context": { where: "<child>_context.md, companion_context.md, curriculum.md, probe_targets.md (IEP, evaluations, conference and teacher notes land here through sunny:ingest)", read: ["read_record: about_her"] },
  "probe_targets.md": { where: "probe_targets.md", read: ["read_record: about_her"] },
  "tutoring": { where: "tutoring/processed/* (tutor notes)", read: ["read_record: about_her"] },
  "teaching_notes.md": { where: "teaching_notes.md (a parent or tutor, dated)", read: ["question: teaching notes, read first", "read_record: teaching_notes"] },
  "classroom": { where: "classroom/<lessonId>/{meta,lesson}.json + voice/clips: Elli's Classroom lessons made for her outside Sunny (owner, 2026-11-27)",
    read: ["question: library games on the menu (the lesson's title, concept and date)"], excluded: "the lesson itself is teaching content, not an observation of her; her answers in it reach her record through the game bridge" },
  "engagement_theory.json": { where: "engagement_theory.json", read: ["question: child chart context (engagement evidence)"] },
  "care_plan": { where: "care_plan/current.json", read: ["read_record: prior_plan"] },
  "plans": { where: "plans/active_session_plan.json", read: ["read_record: prior_plan"] },
  "content_catalog.json": { where: "content_catalog.json: games built for her and how she played them", read: ["question: games Sunny built for her that she played"] },
  "logs:sessions": { where: "logs/sessions/<year>/<month>/<session>/ summary, transcript, screen reports, narrator lines (kept 14 days)",
    read: ["read_record: sessions, session_transcripts, screens_and_narration"], trust: "transcripts are speech-to-text of the whole room" },
  "attempts": { where: "attempts/*.ndjson", read: [], excluded: "May 2026 word-bank attempts from before learning cycles; their facts are in the cycles, and SM-2 history is not Planner input (LEARNING_FEEDBACK_LOOP)" },
  "word_bank.json": { where: "word_bank.json", read: [], excluded: "SM-2 word-bank state, not Planner input (LEARNING_FEEDBACK_LOOP: no SM2 fields or second factsheet)" },
  "assumptions": { where: "assumptions/*-pre.md", read: [], excluded: "Sunny's own pre-session guesses: generated prose may not be fed back as observations (LEARNING_FEEDBACK_LOOP, Longitudinal planning)" },
  "decision_traces": { where: "decision_traces/<day>.ndjson", read: [], excluded: "audit traces of Sunny's own writes; the Planner's decisions themselves are read_record decisions" },
  "activity_results": { where: "activity_results/", read: [], excluded: "quest artwork candidates, not observations of her" },
  "content_feedback.ndjson": { where: "content_feedback.ndjson", read: [], excluded: "engineering lessons about generated content, not observations of her (LEARNING_FEEDBACK_LOOP: operational evidence)" },
  "pronunciation_science": { where: "pronunciation_science/", read: ["query_record: response and stimulus facts"], excluded: "raw provider phoneme scores; only measured responses in her chart are evidence" },
  "pictures": { where: "pictures/", read: [], excluded: "artwork library for boards, not evidence" },
  "themes": { where: "themes/", read: [], excluded: "map theme presentation, not evidence" },
  "creator.md": { where: "creator.md", read: [], excluded: "a prompt file for the Experience Creator, not about her" },
};

const MAX_ROWS = 2000, CHUNK = 4000;
const clip = (text: unknown, max = 1200) => { const flat = String(text ?? "").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

function ndjsonRows(dir: string, asOf: string, at: (row: Record<string, unknown>) => unknown = row => row.createdAt ?? row.at ?? row.ts): Array<Record<string, unknown>> {
  if (!fs.existsSync(dir)) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const name of fs.readdirSync(dir).filter(file => file.endsWith(".ndjson")).sort()) {
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const row = JSON.parse(line) as Record<string, unknown>; const when = String(at(row) ?? ""); if (!when || when <= asOf) rows.push(row); } catch { /* one bad line hides nothing else */ }
    }
  }
  return rows.slice(-MAX_ROWS).reverse();
}

function chunks(file: string, label: string): Array<{ file: string; part: number; text: string }> {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return [];
  const text = fs.readFileSync(file, "utf8");
  const out: Array<{ file: string; part: number; text: string }> = [];
  for (let start = 0, part = 1; start < text.length && out.length < MAX_ROWS; start += CHUNK, part++) out.push({ file: label, part, text: text.slice(start, start + CHUNK) });
  return out;
}

/** Her session folders (logs/sessions/<y>/<m>/<stamp>_<child>_…), oldest first, started at or before asOf. */
function sessionDirs(childId: string, logsRoot: string, asOf: string): string[] {
  const base = path.join(logsRoot, "logs", "sessions");
  if (!fs.existsSync(base)) return [];
  const dirs: string[] = [];
  for (const year of fs.readdirSync(base)) for (const month of fs.existsSync(path.join(base, year)) && fs.statSync(path.join(base, year)).isDirectory() ? fs.readdirSync(path.join(base, year)) : []) {
    const monthDir = path.join(base, year, month);
    if (!fs.statSync(monthDir).isDirectory()) continue;
    for (const name of fs.readdirSync(monthDir)) {
      const match = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})_([^_]+)_/);
      if (!match || match[5].toLowerCase() !== childId.toLowerCase()) continue;
      if (`${match[1]}T${match[2]}:${match[3]}:${match[4]}` > asOf) continue;
      dirs.push(path.join(monthDir, name));
    }
  }
  return dirs.sort();
}

export type ChildEvidenceInput = { childId: string; asOf: string; rootDir?: string; logsRoot?: string };

/** One live section of her record, newest first, as it stood at asOf. Never throws: an unreadable source is an empty page with a reason. */
export function readChildEvidenceSection(section: LiveRecordSection, input: ChildEvidenceInput): unknown[] {
  const dir = resolveChildContextDir(input.childId, { rootDir: input.rootDir });
  const logsRoot = input.logsRoot ?? input.rootDir ?? process.cwd();
  try {
    switch (section) {
      // What the kiosk mic heard while her companion was minimized, as one digest per session (2026-11-23).
      case "room_talk": return ndjsonRows(path.join(dir, "room_talk"), input.asOf, row => row.at);
      case "her_talk": return ndjsonRows(path.join(dir, "companion_interactions"), input.asOf).map(row => ({ id: row.id, at: row.createdAt, call: row.callSource, she_said: clip(row.questionText), companion_said: clip(row.companionText) }));
      case "child_signals": return ndjsonRows(path.join(dir, "child_signals"), input.asOf).map(row => ({ id: row.childSignalId, at: row.createdAt, type: row.signalType, dimension: row.dimension, valence: row.valence, source: row.source, activity: row.activityId, observed: clip(row.evidenceText) }));
      case "choices": return ndjsonRows(path.join(dir, "choice_events"), input.asOf);
      case "ratings": return ndjsonRows(path.join(dir, "ratings"), input.asOf);
      case "motivation": return ndjsonRows(path.join(dir, "sunny_health"), input.asOf).filter(row => "verdict" in row || "action" in row);
      case "session_notes": return fs.existsSync(path.join(dir, "session_notes")) ? fs.readdirSync(path.join(dir, "session_notes")).filter(name => name.endsWith(".md") && name.slice(0, 10) <= input.asOf.slice(0, 10)).sort().reverse()
        .map(name => ({ date: name.slice(0, 10), text: clip(fs.readFileSync(path.join(dir, "session_notes", name), "utf8"), 6000) })) : [];
      case "about_her": {
        const files = ["soul.md", `${input.childId}_context.md`, "companion_context.md", "curriculum.md", "probe_targets.md"].map(name => ({ file: path.join(dir, name), label: name }));
        const tutoring = path.join(dir, "tutoring", "processed");
        if (fs.existsSync(tutoring)) for (const name of fs.readdirSync(tutoring).sort()) files.push({ file: path.join(tutoring, name), label: `tutoring/${name}` });
        return files.flatMap(row => chunks(row.file, row.label));
      }
      case "teaching_notes": return readTeachingNotes(input.childId, { rootDir: input.rootDir }).filter(note => note.date <= input.asOf.slice(0, 10)).reverse();
      case "companion_memory": return ["companion_care", "companion_relationships"].flatMap(sub => {
        const folder = path.join(dir, sub);
        return fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => name.endsWith(".json")).sort().map(name => ({ kind: sub, file: name, memory: clip(fs.readFileSync(path.join(folder, name), "utf8"), 6000) })) : [];
      });
      case "sessions": return sessionDirs(input.childId, logsRoot, input.asOf).reverse().map(session => ({ session: path.basename(session),
        summary: fs.existsSync(path.join(session, "summary.md")) ? clip(fs.readFileSync(path.join(session, "summary.md"), "utf8"), 4000) : null }));
      case "session_transcripts": return sessionDirs(input.childId, logsRoot, input.asOf).reverse().flatMap(session => chunks(path.join(session, "transcript.md"), path.basename(session)));
      case "screens_and_narration": return sessionDirs(input.childId, logsRoot, input.asOf).reverse().flatMap(session => {
        const file = path.join(session, "events.ndjson");
        if (!fs.existsSync(file)) return [];
        const rows: unknown[] = [];
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
          if (!line.includes('"screen"') && !line.includes('"game_narration"')) continue;
          try {
            const row = JSON.parse(line) as Record<string, unknown>;
            if (row.component === "game_narration" && row.action === "speak") rows.push({ at: row.ts, session: path.basename(session), heard: clip(row.text, 400), reason: row.reason });
            else if (row.component === "screen") rows.push({ at: row.ts, session: path.basename(session), screen: clip(JSON.stringify({ ...row, ts: undefined, sessionId: undefined, child: undefined }), 600) });
          } catch { /* skip */ }
        }
        return rows.reverse();
      }).slice(0, MAX_ROWS);
    }
  } catch (error) {
    console.warn(` 🎮 [child-evidence] [${section}] [unreadable] child=${input.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return [{ unreadable: error instanceof Error ? error.message : String(error) }];
  }
  return [];
}
