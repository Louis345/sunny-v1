import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { chartPath, type ChartOptions } from './guard';

export type ChartDatabase = { sql: Database.Database; path: string; childId: string; readonly: boolean; close(): void };
export function openChart(childId: string, opts: ChartOptions = {}): ChartDatabase {
  const file = chartPath(childId, opts);
  const readonly = Boolean(opts.readonly || opts.snapshot);
  if (!readonly) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const sql = new Database(file, { readonly, fileMustExist: readonly, timeout: 5000 });
  try {
    sql.pragma('busy_timeout = 5000');
    if (!readonly) {
      fs.chmodSync(file, 0o600);
      sql.pragma('journal_mode = WAL');
      sql.pragma('synchronous = FULL');
      sql.transaction(() => {
        sql.exec(`CREATE TABLE IF NOT EXISTS schema (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, child_id TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY NOT NULL, child_id TEXT NOT NULL,
            type TEXT NOT NULL, occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
            actor TEXT NOT NULL, cites TEXT NOT NULL CHECK(json_valid(cites)), payload TEXT NOT NULL CHECK(json_valid(payload))
          );
          CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'chart_events_immutable'); END;
          CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'chart_events_immutable'); END;
          CREATE TRIGGER IF NOT EXISTS events_no_replace BEFORE INSERT ON events WHEN EXISTS(SELECT 1 FROM events WHERE event_id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'chart_event_duplicate'); END;
          CREATE TRIGGER IF NOT EXISTS events_child_identity BEFORE INSERT ON events WHEN NEW.child_id != (SELECT child_id FROM schema WHERE singleton=1) BEGIN SELECT RAISE(ABORT,'chart_child_mismatch'); END;`);
        sql.prepare('INSERT OR IGNORE INTO schema VALUES (1, 1, ?)').run(childId);
        const identity = sql.prepare('SELECT version,child_id FROM schema WHERE singleton=1').get() as { version: number; child_id: string };
        if (identity.child_id !== childId) throw new Error('chart_child_mismatch');
        if (identity.version !== 1) throw new Error('chart_schema_unsupported');
      }).immediate();
    }
    const identity = sql.prepare('SELECT version,child_id FROM schema WHERE singleton=1').get() as { version: number; child_id: string } | undefined;
    if (!identity || identity.child_id !== childId) throw new Error('chart_child_mismatch');
    if (identity.version !== 1) throw new Error('chart_schema_unsupported');
    if (readonly) sql.pragma('query_only = ON');
    const count = (sql.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n;
    console.error(` 🎮 [chart] [opened] child=${childId} path=${file} events=${count} readonly=${readonly}`);
    return { sql, path: file, childId, readonly, close: () => { if (sql.open) sql.close(); } };
  } catch (error) {
    sql.close();
    console.error(` 🎮 [chart] [open] [refused] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
