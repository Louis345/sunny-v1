import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ChartDatabase } from './db';

function syncFile(file: string): void {
  const fd = fs.openSync(file, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
export async function snapshotChart(db: ChartDatabase, output: string): Promise<void> {
  const out = path.resolve(output);
  const meta = out + '.meta.json';
  if (fs.existsSync(out) || fs.existsSync(meta)) throw new Error('chart_snapshot_exists');
  const directory = path.dirname(out);
  const staging = fs.mkdtempSync(path.join(directory, '.chart-snapshot-'));
  const partial = path.join(staging, 'chart.db');
  const startedAt = new Date().toISOString();
  try {
    await db.sql.backup(partial);
    const copy = new Database(partial, { fileMustExist: true });
    let eventCount: number;
    try {
      copy.pragma('journal_mode = DELETE');
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('chart_snapshot_integrity');
      eventCount = (copy.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n;
    } finally { copy.close(); }
    const metadata = { childId: db.childId, sourceHost: os.hostname(), sourcePath: db.path,
      startedAt, snapshotTime: new Date().toISOString(), eventCount,
      sha256: createHash('sha256').update(fs.readFileSync(partial)).digest('hex') };
    const partialMeta = path.join(staging, 'meta.json');
    fs.writeFileSync(partialMeta, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o400 });
    fs.chmodSync(partial, 0o400);
    syncFile(partial); syncFile(partialMeta);
    fs.linkSync(partialMeta, meta); syncFile(directory);
    fs.linkSync(partial, out); syncFile(directory);
    console.error(` 🎮 [chart] [snapshot] [ok] child=${db.childId} path=${out} events=${eventCount}`);
  } catch (error) {
    console.error(` 🎮 [chart] [snapshot] [failed] child=${db.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    // Only this invocation's private staging directory is removed; destinations are never overwritten.
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
