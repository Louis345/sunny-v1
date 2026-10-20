import { openChart } from '../db';
import { snapshotChart } from '../snapshot';

async function main(): Promise<void> {
  const [child, flag, out, ...extra] = process.argv.slice(2);
  if (!child || flag !== '--out' || !out || extra.length) throw new Error('usage: chart:snapshot -- <child> --out <file>');
  const db = openChart(child, { readonly: true });
  try { await snapshotChart(db, out); } finally { db.close(); }
}
main().catch(error => {
  console.error(` 🎮 [chart] [snapshot] [failed] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
