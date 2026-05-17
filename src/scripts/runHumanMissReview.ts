import path from "path";
import {
  buildHumanCaughtBugReview,
  renderHumanCaughtBugReviewMarkdown,
} from "../engine/humanCaughtBugReview";

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1] ?? null;
  return null;
}

export function runHumanMissReviewCli(argv = process.argv.slice(2)): void {
  const sessionDir = argValue(argv, "session-dir") ?? argValue(argv, "dir");
  const bug = argValue(argv, "bug");
  const outDir = argValue(argv, "out");
  if (!sessionDir || !bug) {
    throw new Error(
      'usage: npm run sunny:lab:miss-review -- --session-dir=/path/to/session --bug="what the human saw"',
    );
  }
  const review = buildHumanCaughtBugReview({
    rootDir: process.cwd(),
    sessionDir,
    bug,
    writeFiles: true,
    ...(outDir ? { outDir: path.resolve(outDir) } : {}),
  });
  process.stdout.write(renderHumanCaughtBugReviewMarkdown(review));
  console.log(`🎮 [human-miss-review] [written] ${review.outDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runHumanMissReviewCli();
  } catch (error) {
    console.error("🎮 [human-miss-review] [failed]", error);
    process.exitCode = 1;
  }
}
