import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { validateGeneratedArtifactRuntime } from "../engine/generatedArtifactRuntimeValidator";
import { validateGeneratedGame } from "./validateGeneratedGame";

type CliArgs = {
  childId: string;
  kind: "quest" | "boss";
  rootDir?: string;
};

function readFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const childId = readFlag(argv, "child") ?? readFlag(argv, "childId");
  const kindRaw = readFlag(argv, "kind") ?? "quest";
  if (!childId || (kindRaw !== "quest" && kindRaw !== "boss")) {
    throw new Error("Usage: npm run sunny:experience:validate -- --child ila --kind quest");
  }
  return {
    childId: childId.trim().toLowerCase(),
    kind: kindRaw,
    rootDir: readFlag(argv, "rootDir"),
  };
}

function readProfile(rootDir: string, childId: string): LearningProfile {
  const file = path.join(rootDir, "src", "context", childId, "learning_profile.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as LearningProfile;
}

export async function runValidateExperienceArtifact(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const rootDir = args.rootDir ?? process.cwd();
  const profile = readProfile(rootDir, args.childId);
  const node = profile.pendingHomework?.nodes.find((item) => item.type === args.kind);
  if (!node?.gameFile || !node.date) {
    throw new Error(`No generated ${args.kind} artifact is attached for ${args.childId}.`);
  }
  const filePath = path.join(
    rootDir,
    "src",
    "context",
    args.childId,
    "homework",
    "games",
    node.date,
    node.gameFile,
  );
  const html = fs.readFileSync(filePath, "utf8");
  const words = node.adaptiveArtifact
    ? node.words
    : profile.pendingHomework?.wordList ?? [];
  const homeworkType = profile.pendingHomework?.capturedContent?.type ??
    (profile.pendingHomework?.homeworkId?.includes("spelling_test") ? "spelling_test" : "generic");
  const staticReport = validateGeneratedGame(html, {
    words,
    homeworkType,
    childId: args.childId,
    generationStage: args.kind,
  });
  const outputDir = path.join(path.dirname(filePath), ".validation", path.basename(node.gameFile, ".html"));
  const runtimeReport = await validateGeneratedArtifactRuntime({
    html,
    childId: args.childId,
    stage: args.kind,
    homeworkType,
    words,
    outputDir,
  });
  const report = {
    passed: staticReport.passed && runtimeReport.passed,
    staticValidation: staticReport,
    runtimeValidation: runtimeReport.runtimeValidation,
    failures: [...staticReport.failures, ...runtimeReport.failures],
    warnings: [...staticReport.warnings, ...runtimeReport.warnings],
    score: Math.min(staticReport.score, runtimeReport.score),
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "validation-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (typeof require !== "undefined" && require.main === module) {
  runValidateExperienceArtifact(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🎮 [experience-artifact] [validation-cli-failed] ${message}`);
    process.exit(1);
  });
}
