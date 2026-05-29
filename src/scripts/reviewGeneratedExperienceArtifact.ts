import { reviewGeneratedExperienceArtifact, type GeneratedArtifactReviewDecision } from "../engine/generatedArtifactReview";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) {
      out[arg.slice(2)] = "true";
    } else {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return out;
}

function parseDecision(value: string | undefined): GeneratedArtifactReviewDecision {
  if (value === "preserve" || value === "discard" || value === "revise") return value;
  throw new Error("--decision must be preserve, discard, or revise");
}

export function main(argv = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  if (!args.artifact) throw new Error("--artifact=<path> is required");
  if (!args.reason) throw new Error("--reason=<why> is required");

  const record = reviewGeneratedExperienceArtifact({
    artifactPath: args.artifact,
    decision: parseDecision(args.decision),
    reason: args.reason,
    reviewer: args.reviewer,
  });
  console.log(`Review saved: ${record.reviewPath}`);
  if (record.preservedCopyPath) console.log(`Preserved copy: ${record.preservedCopyPath}`);
}

if (process.argv[1]?.endsWith("reviewGeneratedExperienceArtifact.ts")) {
  main();
}
