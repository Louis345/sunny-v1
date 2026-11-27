import "dotenv/config";
import { retryCutOffStop } from "../engine/canonicalProgressionGenerator";

/**
 * Operator-run: one person-approved PAID rebuild of a stop on the current board whose build was cut off
 * (Not ready for provider_outcome_uncertain). The lost request may already have been billed (owner, 2026-11-11).
 */
if (require.main === module) {
  void (async () => {
    const args = process.argv.slice(2);
    const value = (flag: string) => { const at = args.indexOf(flag); const next = at >= 0 ? args[at + 1] : undefined; return next && !next.startsWith("--") ? next : undefined; };
    const childId = value("--child"), homeworkId = value("--homework"), nodeId = value("--node");
    if (!childId || !homeworkId || !nodeId || !args.includes("--approve-one-paid-retry")) {
      throw new Error("Usage: npm run sunny:board:retry-cut-off-stop -- --child CHILD --homework HOMEWORK --node NODE_ID --approve-one-paid-retry [--reason \"why\"]");
    }
    const reason = value("--reason") ?? "Owner approved one paid rebuild of a stop cut off by a kiosk restart.";
    const result = await retryCutOffStop({ childId, homeworkId, nodeId, reason });
    console.log(` 🎮 [board] [retry-cut-off-stop] [done] rebuilt=${result.rebuilt} set_aside=${result.setAside.length} set_aside_dir=${result.setAsideDir ?? "none"}${result.failure ? ` reason=${result.failure}` : ""}`);
    if (!result.rebuilt) process.exitCode = 1;
  })().catch(error => {
    console.error(` 🎮 [board] [retry-cut-off-stop] [failed] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
