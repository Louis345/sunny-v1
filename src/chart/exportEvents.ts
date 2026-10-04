import type { ChartDatabase } from './db';
import type { ChartEvent } from './eventTypes';

export function decodeRow(row: any): ChartEvent {
  return { ...row, cites: JSON.parse(row.cites), payload: JSON.parse(row.payload) };
}
export function exportEvents(db: ChartDatabase): ChartEvent[] {
  return db.sql.prepare('SELECT * FROM events ORDER BY sequence').all().map(decodeRow);
}
