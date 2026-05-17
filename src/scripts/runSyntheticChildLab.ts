import path from "path";
import {
  renderSyntheticSpellingLabMarkdown,
  runSyntheticSpellingLab,
  type SyntheticPersonaSelection,
} from "../engine/syntheticChildLab";

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1] ?? null;
  return null;
}

function parsePersona(argv: string[]): SyntheticPersonaSelection {
  const raw = (argValue(argv, "persona") ?? "struggling_reader").trim();
  if (
    raw === "all" ||
    raw === "struggling_reader" ||
    raw === "advanced_speller" ||
    raw === "distracted_child" ||
    raw === "confidence_sensitive"
  ) {
    return raw;
  }
  throw new Error(
    "usage: npm run sunny:lab:spelling -- --persona=struggling_reader|advanced_speller|distracted_child|confidence_sensitive|all",
  );
}

function parseIterations(argv: string[]): number {
  const raw = argValue(argv, "iterations");
  if (!raw) return 3;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("--iterations must be a positive number");
  }
  return Math.floor(n);
}

export async function runSyntheticChildLabCli(argv = process.argv.slice(2)): Promise<void> {
  const childId = argValue(argv, "child") ?? "demo_adaptive";
  const outDir = argValue(argv, "out");
  const browserUrl = argValue(argv, "browser-url");
  const browserProfileChildId = argValue(argv, "browser-profile");
  const browserHeadless = !argv.includes("--headed");
  const report = await runSyntheticSpellingLab({
    rootDir: process.cwd(),
    repoRoot: process.cwd(),
    childId,
    persona: parsePersona(argv),
    iterations: parseIterations(argv),
    ...(browserUrl ? { browserUrl } : {}),
    ...(browserProfileChildId ? { browserProfileChildId } : {}),
    browserHeadless,
    ...(outDir ? { outDir: path.resolve(outDir) } : {}),
  });
  process.stdout.write(renderSyntheticSpellingLabMarkdown(report));
  console.log(`🎮 [synthetic-child-lab] [written] ${report.labDir}`);
  if (!report.realChildSessionAllowed) {
    console.log(
      `🎮 [synthetic-child-lab] [blocked] highIssues=${report.summary.highSeverityIssues} blockedActivities=${report.summary.activitiesBlocked}`,
    );
  } else {
    console.log("🎮 [synthetic-child-lab] [passed] spelling path allowed for real child session");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runSyntheticChildLabCli().catch((error: unknown) => {
    console.error("🎮 [synthetic-child-lab] [failed]", error);
    process.exitCode = 1;
  });
}
