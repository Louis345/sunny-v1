/**
 * The Planner sees its own words (owner 2026-11-23). It once judged rounding secure from 6 of 6 without reading what
 * its games had taught her ("peek the digit"). For a board it built, code lays out exactly what she was shown: each
 * stop's title, story, aim and opening screen as the Planner wrote them, and the text inside the built game (its visible
 * words and the lines its script shows or speaks). Code judges none of it; the Planner reads its words and questions them.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import { listBoardInstances } from "./learningBoardInstances";
import type { LearningCycleNodeContract, LearningCycleRecordV2 } from "./learningCycleRepository";

const MAX_GAME_TEXT = 8000;
const clip = (text: unknown, max = 1500) => { const flat = String(text ?? "").replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

/** The words in a built game: visible text outside scripts and styles, and the sentence-like strings its script uses. */
export function gameWords(html: string): string {
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join("\n");
  const strings: string[] = [];
  for (const match of scripts.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n]){3,400})\1/g)) {
    const text = match[2].replace(/\$\{[^}]*\}/g, "…").replace(/\\n/g, " ").trim();
    // Words a child could read or hear: letters and a space, not code, CSS, selectors or URLs.
    if (!/[A-Za-z]{2,}\s+[A-Za-z0-9…]/.test(text) || /[{};]|=>|https?:|\.(png|jpe?g|mp3|svg)\b|^\s*[.#][\w-]+\s*$|\bpx\b|rgba?\(|var\(--/.test(text)) continue;
    if (!strings.includes(text)) strings.push(text);
  }
  return clip([visible, ...strings].filter(Boolean).join(" | "), MAX_GAME_TEXT);
}

function stopWords(cycle: LearningCycleRecordV2, node: LearningCycleNodeContract, rootDir?: string) {
  const relative = node.artifactBinding?.localArtifactPath;
  let game: string | null = null;
  if (relative) {
    const file = path.join(resolveChildContextDir(cycle.childId, { rootDir }), relative.replace(/^\/+/, ""));
    try { game = fs.existsSync(file) ? gameWords(fs.readFileSync(file, "utf8")) : null; }
    catch (error) { console.warn(` 🎮 [board-wording] [game] [unreadable] node=${node.nodeId} reason=${error instanceof Error ? error.message : String(error)}`); }
  }
  const extra = node as unknown as Record<string, unknown>;
  return { nodeId: node.nodeId, kind: node.implementationType ?? node.mechanic, title: node.title, story: clip(node.theme), aimed_at: node.focus ? clip(node.focus) : null,
    opening_screen: extra.openingScreen ? clip(typeof extra.openingScreen === "string" ? extra.openingScreen : JSON.stringify(extra.openingScreen)) : null,
    game_text: game ?? (relative ? "(the built game file is not on this computer)" : "(a built-in activity: its wording is the activity's own)") };
}

/** Board `number` (1 = her first board on this assignment) as she met it. */
export function boardWording(cycle: LearningCycleRecordV2, number: number, opts: { rootDir?: string } = {}) {
  const boards = listBoardInstances(cycle);
  const board = boards[number - 1];
  if (!board) return { error: `board ${number} does not exist; this assignment has boards 1 to ${boards.length}` };
  const nodes = new Map(cycle.nodes.map(node => [node.nodeId, node]));
  const stops = board.nodeIds.map(id => nodes.get(id)).filter((node): node is LearningCycleNodeContract => Boolean(node)).map(node => stopWords(cycle, node, opts.rootDir));
  console.log(` 🎮 [board-wording] [read] homework=${cycle.homeworkId} board=${number} stops=${stops.length}`);
  return { board: number, boardId: board.boardId, published: board.publishedAt, stops };
}
