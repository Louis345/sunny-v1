import fs from "node:fs";
import path from "node:path";

/**
 * Sunny's Planner harness: put a child through real intake, Teaching and next board with a Planner at the
 * provider boundary (the recorded one at $0, or a real model when the owner turns it on), then score what
 * code can check. Ranked as the owner set it: she wants to come back (replayability), then learning.
 * Outcomes are measured only in real sessions; the harness never invents them.
 */
export type HarnessStop = { nodeId: string; title: string; theme?: string; picture?: string; type?: string; reused: boolean; notReady?: string };
export type HarnessBoard = { kind: string; published: boolean; choice: boolean; background: string; stops: HarnessStop[] };
export type HarnessConversation = { phase: string; requests: Array<{ messages?: unknown[] }> };
export type HarnessRun = {
  caseId: string; planner: string; aboutHer: string | null;
  boards: HarnessBoard[];
  /** The first prompt each Planner and the artist received. */
  prompts: Record<string, string>;
  conversations: HarnessConversation[];
  error?: string;
};
type Score = { value: number | null; detail: string };
export type HarnessScore = Record<"playable" | "herVoice" | "stories" | "pictures" | "variety" | "choice" | "background" | "outcomes", Score>;

const PLACEHOLDER_THEMES = new Set(["learning adventure", "pending", "existing-instrument"]);
const share = (count: number, total: number) => total ? Math.round(count / total * 100) / 100 : 0;

export function scoreRun(run: HarnessRun): HarnessScore {
  const stops = run.boards.flatMap(board => board.stops);
  const playable = stops.filter(row => !row.notReady).length;
  const prompts = Object.entries(run.prompts);
  // Prompts carry the chart as JSON, so her words may arrive escaped; either form counts.
  const sample = run.aboutHer?.slice(0, 40);
  const heard = sample ? prompts.filter(([, text]) => text.includes(sample) || text.includes(JSON.stringify(sample).slice(1, -1))) : [];
  const storied = stops.filter(row => row.theme?.trim() && row.theme.trim() !== row.title && !PLACEHOLDER_THEMES.has(row.theme.trim()));
  const pictured = stops.filter(row => row.picture?.trim());
  const games = new Set(stops.map(row => row.type).filter(Boolean));
  const next = run.boards.find(board => board.kind === "successor")?.stops ?? [];
  return {
    playable: { value: share(playable, stops.length), detail: `${playable} of ${stops.length} stops playable` },
    herVoice: run.aboutHer
      ? { value: share(heard.length, prompts.length), detail: `her interests reached ${heard.length} of ${prompts.length} Planner and artist prompts${heard.length < prompts.length ? ` (missing: ${prompts.filter(row => !heard.includes(row)).map(([name]) => name).join(", ")})` : ""}` }
      : { value: null, detail: "no soul file for this child" },
    stories: { value: share(storied.length, stops.length), detail: `${storied.length} of ${stops.length} stops have their own story` },
    pictures: { value: share(pictured.length, stops.length), detail: `${pictured.length} of ${stops.length} stops have a picture written for them` },
    variety: { value: games.size, detail: `${games.size} different games across both boards; ${next.filter(row => !row.reused).length} of ${next.length} next-board stops are new, not replays` },
    choice: { value: share(run.boards.filter(board => board.choice).length, run.boards.length), detail: `${run.boards.filter(board => board.choice).length} of ${run.boards.length} boards let her choose her path` },
    background: { value: share(run.boards.filter(board => board.background !== "world").length, run.boards.length), detail: `${run.boards.filter(board => board.background !== "world").length} of ${run.boards.length} boards have a background painted for her` },
    outcomes: { value: null, detail: "measured only in real sessions: does she come back, do her words stick" },
  };
}

/** Walls: the errors Sunny's tools answered the Planner with, once per call, ids taken out so the same wall groups. */
export function wallsFromConversations(conversations: HarnessConversation[]): Array<{ wall: string; phase: string; count: number }> {
  const walls = new Map<string, { wall: string; phase: string; count: number }>();
  for (const conversation of conversations) {
    const seen = new Set<string>();
    for (const request of conversation.requests) for (const message of request.messages ?? []) {
      const content = (message as { content?: unknown }).content;
      for (const block of Array.isArray(content) ? content : []) {
        const row = block as { type?: string; tool_use_id?: string; is_error?: boolean; content?: unknown };
        if (row.type !== "tool_result" || !row.is_error || !row.tool_use_id || seen.has(row.tool_use_id)) continue;
        seen.add(row.tool_use_id);
        const text = typeof row.content === "string" ? row.content : JSON.stringify(row.content);
        const wall = text.replace(/\b(?:act|hw|spelling)[-.][\w.-]*\d[\w.-]*/g, "<id>").replace(/\s+/g, " ").trim().slice(0, 200);
        const key = `${conversation.phase}\0${wall}`;
        walls.set(key, { wall, phase: conversation.phase, count: (walls.get(key)?.count ?? 0) + 1 });
      }
    }
  }
  return [...walls.values()].sort((a, b) => b.count - a.count || a.wall.localeCompare(b.wall));
}

/** Reads the Planner conversations Sunny saved under a context folder (read only) and reports their walls. */
export function wallsFromSavedConversations(contextRoot: string): Array<{ wall: string; phase: string; count: number }> {
  const conversations = new Map<string, HarnessConversation>();
  const files = (fs.readdirSync(contextRoot, { recursive: true }) as string[]).map(String).filter(name => /provider-diagnostics[\\/].+\.request\.json$/.test(name));
  for (const name of files) {
    let saved: { context?: { messages?: unknown[] } };
    try { saved = JSON.parse(fs.readFileSync(path.join(contextRoot, name), "utf8")); } catch { continue; }
    if (!saved.context?.messages) continue;
    // A saved conversation is grouped by its homework (the folder after .planner or direct-drafts).
    const parts = name.split(/[\\/]/);
    const at = parts.findIndex(part => part === ".planner" || part === "direct-drafts");
    const phase = at >= 0 ? parts[at + 1] : parts[0];
    const conversation = conversations.get(phase) ?? { phase, requests: [] };
    conversation.requests.push({ messages: saved.context.messages });
    conversations.set(phase, conversation);
  }
  return wallsFromConversations([...conversations.values()]);
}

const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One page that shows what the harness did: each run's scores, its boards stop by stop, and the walls. */
export function renderHarnessReport(input: { title: string; runs: HarnessRun[]; walls: Array<{ wall: string; phase: string; count: number }>; note?: string }): string {
  const scoreRows = input.runs.map(run => {
    const score = scoreRun(run);
    return `<section class="run"><h2>${escape(run.caseId)} <small>${escape(run.planner)}</small></h2>${run.error ? `<p class="error">Run stopped: ${escape(run.error)}</p>` : ""}
<table class="scores"><tbody>${Object.entries(score).map(([name, row]) => `<tr><th>${escape(name)}</th><td class="value">${row.value === null ? "—" : escape(row.value)}</td><td>${escape(row.detail)}</td></tr>`).join("")}</tbody></table>
${run.boards.map(board => `<h3>${escape(board.kind)} board ${board.published ? "" : "(not published)"}</h3><table class="stops"><thead><tr><th>Stop</th><th>Game</th><th>Story</th><th>Picture</th><th>State</th></tr></thead><tbody>${board.stops.map(row => `<tr><td>${escape(row.title)}</td><td>${escape(row.type)}${row.reused ? " (replay)" : ""}</td><td>${escape(row.theme)}</td><td>${escape(row.picture)}</td><td>${row.notReady ? `not ready: ${escape(row.notReady)}` : "playable"}</td></tr>`).join("")}</tbody></table>`).join("")}</section>`;
  }).join("");
  const walls = input.walls.length
    ? `<table class="walls"><thead><tr><th>Count</th><th>Where</th><th>What Sunny told the Planner</th></tr></thead><tbody>${input.walls.map(row => `<tr><td>${row.count}</td><td>${escape(row.phase)}</td><td>${escape(row.wall)}</td></tr>`).join("")}</tbody></table>`
    : "<p>No walls: the Planner's tool calls were all accepted.</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(input.title)}</title>
<style>:root{--bg:#fff;--fg:#1f2937;--muted:#6b7280;--line:#e5e7eb;--bad:#b91c1c}@media (prefers-color-scheme:dark){:root{--bg:#111827;--fg:#f3f4f6;--muted:#9ca3af;--line:#374151;--bad:#f87171}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}small,.note{color:var(--muted)}.value{font-variant-numeric:tabular-nums;width:4em}.error{color:var(--bad)}.run{border-top:2px solid var(--line);margin-top:24px}div.scroll{overflow-x:auto}</style></head>
<body><h1>${escape(input.title)}</h1><p class="note">${escape(input.note ?? "Rules are checked by code at $0. Creativity needs a judge (paid) and outcomes need real sessions; neither is invented here.")}</p>
<h2>Walls the Planner hit</h2><div class="scroll">${walls}</div><div class="scroll">${scoreRows}</div></body></html>`;
}
