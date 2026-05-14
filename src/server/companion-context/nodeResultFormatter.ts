import type { NodeConfig, NodeResult, NodeType } from "../../shared/adventureTypes";
import type { ExternalContextEvent } from "./externalContextEvent";

type Formatter = (node: NodeConfig, result: NodeResult) => string;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function secs(ms: number): string {
  return String(Math.round(ms / 1000));
}

function describeWords(node: NodeConfig): string {
  return node.words?.length ? `${node.words.length} word${node.words.length !== 1 ? "s" : ""}` : "some words";
}

const FORMATTERS: Partial<Record<NodeType, Formatter>> = {
  "spell-check": (n, r) =>
    `Finished ${describeWords(n)} on a spell-check activity (${pct(r.accuracy)} accuracy, ${secs(r.timeSpent_ms)}s).`,
  "monster-stampede": (n, r) =>
    `Finished ${describeWords(n)} on Monster Stampede (${pct(r.accuracy)} accuracy, ${secs(r.timeSpent_ms)}s).`,
  "word-builder": (n, r) =>
    `Finished word-builder${n.words?.length ? ` with ${n.words.join(", ")}` : ""} — ${pct(r.accuracy)} accuracy.`,
  "karaoke": (_n, r) =>
    `Finished a reading passage — ${pct(r.accuracy)} tracking accuracy.`,
  "clock-game": (_n, r) =>
    `Finished clock-reading practice — ${pct(r.accuracy)} accuracy.`,
  "coin-counter": (_n, r) =>
    `Finished coin-counting practice — ${pct(r.accuracy)} accuracy.`,
  "riddle": (_n, r) =>
    `Warmed up with a riddle${r.completed ? "" : " (abandoned)"}.`,
  "boss": (n, r) =>
    `Finished the BOSS castle${r.completed ? ` — ${pct(r.accuracy)} accuracy` : " (abandoned)"}.`,
  "space-invaders": (_n, r) =>
    `Played space-invaders for ${secs(r.timeSpent_ms)}s.`,
  "asteroid": (_n, r) =>
    `Played the asteroid dopamine game for ${secs(r.timeSpent_ms)}s.`,
  "space-frogger": (_n, r) =>
    `Played space-frogger for ${secs(r.timeSpent_ms)}s.`,
  "word-radar": (_n, r) => {
    const base = `Finished Word Radar — ${pct(r.accuracy)} accuracy, ${secs(r.timeSpent_ms)}s.`;
    const mw = (r.missedWords ?? []).map((w) => String(w).trim()).filter(Boolean);
    if (!mw.length) return base;
    const shown = mw.slice(0, 24).join(", ");
    const more = mw.length > 24 ? " …" : "";
    return `${base} Words to reinforce: ${shown}${more}.`;
  },
};

const fallback: Formatter = (n, r) =>
  `Finished a "${n.type}" activity — completed=${r.completed}, accuracy=${pct(r.accuracy)}, time=${secs(r.timeSpent_ms)}s.`;

export function formatNodeResultForCompanion(
  node: NodeConfig,
  result: NodeResult,
): ExternalContextEvent {
  const fn = FORMATTERS[node.type] ?? fallback;
  return {
    source: "map_node_complete",
    summary: fn(node, result),
    occurredAt: Date.now(),
  };
}
