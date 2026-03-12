import "dotenv/config";
import { runPsychologist } from "../agents/psychologist/psychologist";

async function main(): Promise<void> {
  const dryRun = true;
  console.log("\n🧠 Test Psychologist — Ila (dryRun =", dryRun, ")\n");
  await runPsychologist("Ila", dryRun);
  console.log("\n  ✅ Done.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
