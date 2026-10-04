import { openChart } from '../db';
import { exportEvents } from '../exportEvents';

function main(): void {
  const args = process.argv.slice(2);
  const child = args.shift();
  if (!child) throw new Error('usage: chart:export -- <child> [--json] [--snapshot <file>]');
  let snapshot: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--json') json = true;
    else if (args[index] === '--snapshot' && args[index + 1]) snapshot = args[++index];
    else throw new Error('chart_export_invalid_argument');
  }
  const db = openChart(child, { snapshot, readonly: true });
  try {
    const events = exportEvents(db);
    process.stdout.write(json ? JSON.stringify(events, null, 2) + '\n' :
      events.map(event => `${event.occurred_at} ${event.type} ${event.event_id}\n  actor=${event.actor} cites=${JSON.stringify(event.cites)}\n  ${JSON.stringify(event.payload)}`).join('\n') + '\n');
  } finally { db.close(); }
}
try { main(); } catch (error) {
  console.error(` 🎮 [chart] [export] [failed] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
