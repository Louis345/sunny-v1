import Database from "better-sqlite3";
import { z } from "zod";
import { openChart } from "../chart/db";
import { EVENT_TYPES } from "../chart/eventTypes";
import { toolFor, type PlannerTool } from "./plannerToolLoop";

/** Rows returned at most per query, and characters of JSON at most, so one query can't flood the question. */
export const QUERY_ROW_LIMIT = 100;
const QUERY_CHAR_LIMIT = 30_000;

/**
 * query_record (owner, 2026-11-11: "the planner can see everything with an SQL query"). One read-only SELECT over her
 * own chart database file, as it stood when the question was asked: temp views over `sequence <= asOf` shadow the
 * tables, so a restart gets the same rows. One child's file only; it can never see her sister or write anything.
 */
export function queryRecordTool<S>(childId: string, asOfSequence: number): PlannerTool<S> {
  return toolFor<S>()({ name: "query_record",
    description: `Ask her whole record anything with one read-only SQLite SELECT (at most ${QUERY_ROW_LIMIT} rows back). Tables: events(sequence INTEGER, event_id TEXT, type TEXT, occurred_at TEXT UTC ISO, recorded_at TEXT, actor TEXT, cites TEXT JSON array of event_ids, payload TEXT JSON) and event_citations(source_id, target_id). Read payload fields with json_extract(payload,'$.field'). Types: ${EVENT_TYPES.join(", ")}. Useful payload fields: assignmentId (the homework week id), word, itemId, sessionId, rawResponse, status, support (hint, companionHelp, spellingShown, audioReplays), instrument (discovery, practice, recall_check), shown (lettersVisible, hint, companionHelp), results (school test: word, correct, writtenResponse), tags (word, patterns), metric/value (engagement). A response cites the item.presented it answers. Your decisions and boards are in read_past_weeks, not here.`,
    schema: z.object({ sql: z.string().min(1).max(4000).describe("One SELECT (or WITH … SELECT) statement.") }).strict(),
    run: (_state, input) => {
      const sql = input.sql.trim().replace(/;\s*$/, "");
      const words = sql.replace(/'(?:[^']|'')*'/g, "''").toUpperCase();
      if (!/^(SELECT|WITH)\b/.test(words)) return { ok: false, error: "only one SELECT (or WITH … SELECT) statement" };
      if (/\b(RECURSIVE|PRAGMA|ATTACH|DETACH|INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM|REINDEX|LOAD_EXTENSION)\b/.test(words)) return { ok: false, error: "read-only SELECT only; recursive queries and pragmas are not allowed" };
      let db: Database.Database | undefined;
      try {
        // openChart checks the child's own file (guard, schema, child id); the query runs in a scratch database that
        // attaches that file read only and shows it through views frozen at asOf.
        const chart = openChart(childId, { readonly: true });
        const file = chart.path;
        chart.close();
        db = new Database(":memory:");
        db.prepare("ATTACH DATABASE ? AS chart").run(file);
        db.exec(`CREATE TEMP VIEW events AS SELECT sequence, event_id, child_id, type, occurred_at, recorded_at, actor, cites, payload FROM chart.events WHERE sequence <= ${Math.trunc(asOfSequence)};
          CREATE TEMP VIEW event_citations AS SELECT c.source_id, c.target_id FROM chart.event_citations c JOIN chart.events e ON e.event_id = c.source_id WHERE e.sequence <= ${Math.trunc(asOfSequence)};`);
        // From here on this connection cannot write anything, the attached chart included.
        db.pragma("query_only = ON");
        const statement = db.prepare(sql);
        if (!statement.reader || !statement.readonly) return { ok: false, error: "read-only SELECT only" };
        const rows: unknown[] = [];
        let truncated = false;
        for (const row of statement.iterate()) {
          if (rows.length === QUERY_ROW_LIMIT) { truncated = true; break; }
          rows.push(row);
        }
        let json = JSON.stringify(rows);
        while (json.length > QUERY_CHAR_LIMIT && rows.length > 1) { rows.splice(Math.floor(rows.length / 2)); truncated = true; json = JSON.stringify(rows); }
        console.log(` 🎮 [record-query] [answered] child=${childId} rows=${rows.length} truncated=${truncated} asOf=${asOfSequence}`);
        return { ok: true, result: { rowCount: rows.length, truncated, rows } };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(` 🎮 [record-query] [refused] child=${childId} reason=${reason}`);
        return { ok: false, error: reason };
      } finally {
        db?.close();
      }
    } });
}
