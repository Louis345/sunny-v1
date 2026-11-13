import "dotenv/config";
import { openChart } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { projectLivingProfile } from "../chart/livingProfile";
import { recordFact } from "../chart/spelling/record";

/**
 * The owner removes a wrong living-profile fact (2026-11-11: "you can remove a wrong one with one command").
 *   npm run sunny:child:forget -- --child reina --list
 *   npm run sunny:child:forget -- --child reina --fact <factId> --reason "That was her sister"
 * The fact stays in her history as retracted; nothing is deleted.
 */
export async function runForgetChildFact(argv: string[], logger: Pick<Console, "log"> = console): Promise<void> {
  const arg = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1]?.trim() : undefined; };
  const childId = arg("child")?.toLowerCase();
  if (!childId) throw new Error("usage: --child <id> (--list | --fact <factId> --reason <why>)");
  if (argv.includes("--list")) {
    const db = openChart(childId, { readonly: true });
    try {
      const profile = projectLivingProfile(exportEvents(db));
      for (const fact of profile.current) logger.log(`${fact.factId}  ${fact.learnedOn}  [${fact.topic}] ${fact.statement}  (her words: "${fact.quote}", to ${fact.companionId})`);
      logger.log(` 🎮 [living-profile] [list] child=${childId} current=${profile.current.length} retracted=${profile.retracted.length}`);
    } finally { db.close(); }
    return;
  }
  const factId = arg("fact"), reason = arg("reason");
  if (!factId) throw new Error("--fact <factId> is required (see --list)");
  if (!reason) throw new Error("--reason is required: say why the fact is wrong");
  const db = openChart(childId);
  try {
    recordFact(db, "child.fact_retracted", { factId, reason }, { actor: "parent" });
    logger.log(` 🎮 [living-profile] [fact] [retracted] child=${childId} fact=${factId}`);
  } finally { db.close(); }
}

if (typeof require !== "undefined" && require.main === module) {
  runForgetChildFact(process.argv.slice(2)).catch((error) => {
    console.error(" 🎮 [living-profile] [forget] [failed]", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
