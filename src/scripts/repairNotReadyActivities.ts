import "dotenv/config";
import { repairNotReadyActivities } from "../engine/canonicalProgressionGenerator";

/** One-time, operator-run repair of a child's current board. No provider call. */
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const value = (flag: string) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined; };
    const childId = value("--child"), homeworkId = value("--homework");
    if (!childId || !homeworkId || childId.startsWith("--") || homeworkId.startsWith("--")) {
      throw new Error("Usage: npm run sunny:board:repair-not-ready -- --child CHILD --homework HOMEWORK");
    }
    const results = repairNotReadyActivities({ childId, homeworkId });
    for (const row of results) console.log(` 🎮 [board] [repair-not-ready] [${row.repaired ? "repaired" : "still-not-ready"}] child=${childId} homework=${homeworkId} node=${row.nodeId}${row.reason ? ` reason=${row.reason}` : ""}`);
    console.log(` 🎮 [board] [repair-not-ready] [done] repaired=${results.filter(row => row.repaired).length} still_not_ready=${results.filter(row => !row.repaired).length} provider_calls=0`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
