import {
  generateExperienceArtifactFromChart,
  generateExperienceHtmlWithSonnet,
  type GenerateExperienceArtifactFromChartInput,
} from "../engine/generatedExperienceArtifact";

type CliArgs = {
  childId: string;
  briefId?: string;
  kind?: "quest" | "boss";
  rootDir?: string;
  ai: boolean;
};

function readFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1];
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

function parseArgs(argv: string[]): CliArgs {
  const childId = readFlag(argv, "child") ?? readFlag(argv, "childId");
  if (!childId) {
    throw new Error("Usage: npm run sunny:experience:generate -- --child reina [--briefId id] [--kind quest] [--ai]");
  }
  const kindRaw = readFlag(argv, "kind");
  const kind = kindRaw === "boss" || kindRaw === "quest" ? kindRaw : undefined;
  return {
    childId,
    briefId: readFlag(argv, "briefId"),
    kind,
    rootDir: readFlag(argv, "rootDir"),
    ai: hasFlag(argv, "ai") || process.env.SUNNY_AI_EXPERIENCE_ARTIFACT === "true",
  };
}

export async function runGenerateExperienceArtifact(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const input: GenerateExperienceArtifactFromChartInput = {
    childId: args.childId,
    rootDir: args.rootDir,
    briefId: args.briefId,
    kind: args.kind,
    ...(args.ai ? { generateHtml: generateExperienceHtmlWithSonnet } : {}),
  };
  console.log(
    `🎮 [experience-artifact] [start] child=${args.childId} kind=${args.kind ?? "first-brief"} ai=${args.ai}`,
  );
  const result = await generateExperienceArtifactFromChart(input);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (typeof require !== "undefined" && require.main === module) {
  runGenerateExperienceArtifact(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🎮 [experience-artifact] [failed] ${message}`);
    process.exit(1);
  });
}
