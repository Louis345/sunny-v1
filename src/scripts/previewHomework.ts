import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { readLearningProfile } from "../utils/learningProfileIO";

type PendingNode = {
  id: string;
  type: string;
  words: string[];
  difficulty: number;
  gameFile: string | null;
  storyFile: string | null;
  date?: string;
};

function parseCliArgs(argv: string[]): { childId: string } {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  const childId = (childArg ? childArg.slice("--child=".length) : "ila").trim().toLowerCase();
  return { childId: childId || "ila" };
}

function openUrl(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? `open -a "Google Chrome" "${url}"`
      : `xdg-open "${url}"`;
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildNodeUrl(base: string, childId: string, node: PendingNode): string | null {
  const params = new URLSearchParams({
    words: (node.words ?? []).join(","),
    childId,
    difficulty: String(node.difficulty ?? 1),
    nodeId: node.id,
    preview: "true",
    companion: "elli",
  });
  if (node.type === "word-builder") {
    return `${base}/games/word-builder.html?${params.toString()}`;
  }
  if (node.type === "quest" || node.type === "boss") {
    if (!node.gameFile) return null;
    const date = node.date ?? new Date().toISOString().slice(0, 10);
    return `${base}/homework/${childId}/${date}/${node.gameFile}?${params.toString()}`;
  }
  return null;
}

export async function runPreviewHomework(argv: string[]): Promise<void> {
  const { childId } = parseCliArgs(argv);
  const base = "http://localhost:3001";
  const profile = readLearningProfile(childId);
  const pendingNodes = (profile?.pendingHomework?.nodes ?? []) as PendingNode[];

  if (pendingNodes.length === 0) {
    const gamesDir = path.join(process.cwd(), "src", "context", childId, "homework", "games");
    if (!fs.existsSync(gamesDir)) {
      throw new Error("No pendingHomework and no games folder found.");
    }
    const fallback = fs
      .readdirSync(gamesDir)
      .filter((f) => f.endsWith(".html"))
      .map((f, idx) => ({
        id: `fallback-${idx + 1}`,
        type: "quest",
        words: [],
        difficulty: 2,
        gameFile: f,
        storyFile: null,
      })) as PendingNode[];
    for (const [idx, node] of fallback.entries()) {
      const url = buildNodeUrl(base, childId, node);
      if (!url) continue;
      console.log(`📖 Node ${idx + 1}: quest → opening Chrome...`);
      console.log(`   URL: ${url}`);
      await openUrl(url);
      await delay(500);
    }
    return;
  }

  for (const [idx, node] of pendingNodes.entries()) {
    const n = idx + 1;
    if (node.type === "pronunciation") {
      console.log(`🎮 Node ${n}: pronunciation (React — skip)`);
      console.log("Pronunciation: React component (run sunny:homework to preview)");
      continue;
    }
    if (node.type === "karaoke") {
      console.log(`🌐 Node ${n}: karaoke (React — skip)`);
      console.log("Karaoke: React component (run sunny:homework to preview)");
      continue;
    }
    const url = buildNodeUrl(base, childId, node);
    if (!url) continue;
    const icon = node.type === "word-builder" ? "🎲" : "📖";
    console.log(`${icon} Node ${n}: ${node.type} → opening Chrome...`);
    console.log(`   URL: ${url}`);
    await openUrl(url);
    await delay(500);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  runPreviewHomework(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [previewHomework] failed", err);
    process.exit(1);
  });
}
