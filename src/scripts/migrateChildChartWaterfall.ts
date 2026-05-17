import { migrateLearningProfileToWaterfall } from "../profiles/chartWaterfall";

function readFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

async function main(argv: string[]): Promise<void> {
  const child = readFlag(argv, "child")?.trim().toLowerCase();
  if (!child) {
    throw new Error("missing_child: pass --child=<childId>");
  }
  const rootDir = readFlag(argv, "rootDir") ?? process.cwd();
  const result = migrateLearningProfileToWaterfall(child, {
    rootDir,
    slimProfile: hasFlag(argv, "slim"),
  });
  console.log(
    `🎮 [chart-waterfall] [migrated] child=${result.childId} slim=${hasFlag(argv, "slim")} homework=${result.files.currentHomework} plan=${result.files.currentSessionPlan}`,
  );
}

if (typeof require !== "undefined" && require.main === module) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🎮 [chart-waterfall] [failed] ${message}`);
    process.exit(1);
  });
}
