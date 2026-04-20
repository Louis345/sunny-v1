/**
 * sunny:diag:dryRun — open each homework / registry game in Chrome with ?preview=true
 * so completions are not posted to the parent (no word_bank / attempts / SM-2 writes from iframe).
 *
 * Optional profile shape (extend when pending homework exists):
 *   learning_profile.json → { "pendingHomework": { "nodes": [{ "type", "id", "words?" }] } }
 *
 * Env:
 *   WEB_ORIGIN — base URL (default http://localhost:5173)
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  REWARD_GAMES,
  TEACHING_TOOLS,
  type GameDefinition,
} from "../shared/gameRegistry.generated";

type PendingNode = { type: string; id?: string; words?: string[] };

interface ProfileShape {
  pendingHomework?: { nodes: PendingNode[] };
}

const ROOT = path.resolve(process.cwd());
const DEFAULT_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const CREATOR_PROFILE = path.join(
  ROOT,
  "src/context/creator/learning_profile.json",
);

function buildNodeUrl(
  basePath: string,
  opts: { preview: boolean; childId: string; nodeId: string; words?: string[] },
): string {
  const u = new URL(basePath, DEFAULT_ORIGIN);
  u.searchParams.set("childId", opts.childId);
  u.searchParams.set("nodeId", opts.nodeId);
  u.searchParams.set("difficulty", "2");
  if (opts.preview) u.searchParams.set("preview", "true");
  if (opts.words && opts.words.length > 0) {
    u.searchParams.set("words", opts.words.join(","));
  }
  return u.href;
}

function urlsFromRegistry(): string[] {
  const out: string[] = [];
  const add = (key: string, def: GameDefinition) => {
    const words = extractWordsFromDefault(def);
    out.push(
      buildNodeUrl(def.url, {
        preview: true,
        childId: "creator",
        nodeId: key,
        words: words.length ? words : ["practice", "feet"],
      }),
    );
  };
  for (const [k, def] of Object.entries(TEACHING_TOOLS)) add(k, def);
  for (const [k, def] of Object.entries(REWARD_GAMES)) add(k, def);
  return out;
}

function extractWordsFromDefault(def: GameDefinition): string[] {
  const cfg = def.defaultConfig as Record<string, unknown>;
  const pairs = cfg.pairs;
  if (Array.isArray(pairs) && pairs.length) return pairs.map(String);
  const probeWords = cfg.probeWords;
  if (Array.isArray(probeWords) && probeWords.length)
    return probeWords.map(String);
  return [];
}

function urlsFromProfile(profile: ProfileShape): string[] | null {
  const nodes = profile.pendingHomework?.nodes;
  if (!nodes?.length) return null;

  const lookup = new Map<string, GameDefinition>();
  for (const [k, def] of Object.entries(TEACHING_TOOLS)) {
    lookup.set(k, def);
  }
  for (const [k, def] of Object.entries(REWARD_GAMES)) {
    lookup.set(k, def);
  }

  return nodes.map((node) => {
    const def = lookup.get(node.type);
    const urlPath = def?.url ?? `/games/${node.type}.html`;
    const words = node.words?.length
      ? node.words
      : def
        ? extractWordsFromDefault(def)
        : ["practice"];
    return buildNodeUrl(urlPath, {
      preview: true,
      childId: "creator",
      nodeId: node.id ?? node.type,
      words,
    });
  });
}

function openUrls(urls: string[]): void {
  const isDarwin = process.platform === "darwin";
  for (const href of urls) {
    console.log("open", href);
    if (isDarwin) {
      spawn("open", ["-a", "Google Chrome", href], {
        stdio: "inherit",
        detached: true,
      }).unref();
    } else {
      spawn("xdg-open", [href], { stdio: "inherit", detached: true }).unref();
    }
  }
}

function main(): void {
  let urls: string[] | null = null;
  if (fs.existsSync(CREATOR_PROFILE)) {
    try {
      const raw = fs.readFileSync(CREATOR_PROFILE, "utf-8");
      const profile = JSON.parse(raw) as ProfileShape;
      const fromProfile = urlsFromProfile(profile);
      if (fromProfile?.length) urls = fromProfile;
    } catch {
      urls = null;
    }
  }
  if (!urls?.length) {
    console.log(
      "🧪 No profile.pendingHomework.nodes — opening all registry games with preview=true\n",
    );
    urls = urlsFromRegistry();
  } else {
    console.log(
      `🧪 Opening ${urls.length} pending homework node(s) with preview=true\n`,
    );
  }
  openUrls(urls);
}

main();
