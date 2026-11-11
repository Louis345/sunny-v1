// Library games: four hand-built three.js games served as static files from web/public/games/cookoff/<id>/.
// A Quest or Boss stop can be one of them: the board writes libraryGameHtml(...) into the child's games folder and
// binds it like any generated game. The <base> tag makes the game's relative files load from /games/cookoff/<id>/;
// the injected config gives it the stop's frozen items; the inlined bridge (web/public/games/cookoff/_library.js)
// maps the game's targets to those itemIds and reports through the same contract as a generated game.
import fs from "fs";
import path from "path";

export type LibraryGameId = "opus-reina" | "fable-reina" | "opus-ila" | "fable-ila";

/** title is the game's own opening <h1> (normalized it is what openingIdentityFailures compares to the node title). */
export const LIBRARY_GAMES: Record<LibraryGameId, { id: LibraryGameId; title: string; childId: string; subject: "spelling" | "math"; role: "quest" | "boss"; entryPath: string }> = {
  "opus-reina": { id: "opus-reina", title: "Squad Gym", childId: "reina", subject: "math", role: "quest", entryPath: "/games/cookoff/opus-reina/index.html" },
  "fable-reina": { id: "fable-reina", title: "Split Second", childId: "reina", subject: "math", role: "boss", entryPath: "/games/cookoff/fable-reina/index.html" },
  "opus-ila": { id: "opus-ila", title: "Spirit Night", childId: "ila", subject: "spelling", role: "quest", entryPath: "/games/cookoff/opus-ila/index.html" },
  "fable-ila": { id: "fable-ila", title: "Midnight Spirit Toast", childId: "ila", subject: "spelling", role: "boss", entryPath: "/games/cookoff/fable-ila/index.html" },
};

/** The targets each game presents from its own built-in content, used only when no items are injected (free play). */
const BUILT_IN_TARGETS: Record<LibraryGameId, string[]> = {
  "opus-reina": ["16÷4", "24÷3", "18÷3", "28÷4", "30÷5", "36÷4", "42÷6", "48÷6"],
  "fable-reina": ["16 ÷ 4 equal groups: how many in each group", "24 ÷ 3 equal groups: how many in each group", "(tier facts and championship rounds)"],
  "opus-ila": ["pardon", "carnivore", "charge", "dormant"],
  "fable-ila": ["pardon", "carnivore", "charge", "dormant"],
};

const BRIDGE_TAG = '<script src="/games/cookoff/_library.js"></script>';

/** Same normalization as the runtime bridge (_library.js): one rule decides a match at build time and at play time. */
function normalize(value: string, subject: "spelling" | "math"): string {
  const s = value.normalize("NFC").toLowerCase().trim();
  if (subject === "spelling") return s.replace(/[^\p{L}]+/gu, "");
  return s.replace(/[×*]/g, "x").replace(/[÷/]/g, "÷").replace(/[^\p{L}\p{N}x÷=?+\-]+/gu, "");
}

/** Whether the game can put this item on screen and score it (the games skip anything else, with a log line). */
function presentable(id: LibraryGameId, answer: string): boolean {
  if (id === "fable-reina") return /^\d{1,2}$/.test(answer.trim());
  if (id === "opus-reina") return Number.isFinite(Number(answer.trim())) && Number(answer) > 0;
  return /^[a-z][a-z'-]*$/i.test(answer.trim());
}

/** HTML for one stop: the game's index.html with <base href="/games/cookoff/<id>/"> and window.SUNNY_GAME_CONFIG injected, plus the evidence bridge. */
export function libraryGameHtml(input: { id: LibraryGameId; childId: string; nodeId: string; items: Array<{ itemId: string; prompt: string; answer: string }>; rootDir?: string }): { html: string; matchedItemIds: string[]; unmatchedTargets: string[] } {
  const game = LIBRARY_GAMES[input.id];
  if (!game) throw new Error(`library_game_unknown:${input.id}`);
  const publicDir = path.join(input.rootDir ?? process.cwd(), "web", "public", "games", "cookoff");
  const source = fs.readFileSync(path.join(publicDir, input.id, "index.html"), "utf8");
  const bridge = fs.readFileSync(path.join(publicDir, "_library.js"), "utf8");
  if (!source.includes(BRIDGE_TAG)) throw new Error(`library_game_bridge_tag_missing:${input.id}`);
  if (/<\/script/i.test(bridge)) throw new Error("library_game_bridge_unsafe_inline");

  const items = input.items
    .filter((item) => item && typeof item.itemId === "string" && item.itemId.trim() && String(item.answer ?? "").trim())
    .map((item) => ({ itemId: item.itemId, prompt: String(item.prompt ?? ""), answer: String(item.answer).trim() }));
  const skipped = items.filter((item) => !presentable(input.id, item.answer));
  for (const item of skipped) console.warn(` 🎮 [library-game] [content] [skipped] game=${input.id} item=${item.itemId} reason=answer_not_presentable`);
  const shown = items.filter((item) => presentable(input.id, item.answer));

  // A shown item is matched when its text is unique among the stop's items: two items with the same text cannot be told apart.
  const key = (item: { prompt: string; answer: string }) => normalize(game.subject === "spelling" ? item.answer : (item.prompt || item.answer), game.subject);
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  const matchedItemIds = shown.filter((item) => counts.get(key(item)) === 1).map((item) => item.itemId);
  const unmatchedTargets = shown.length
    ? shown.filter((item) => counts.get(key(item))! > 1).map((item) => game.subject === "spelling" ? item.answer : (item.prompt || item.answer))
    : BUILT_IN_TARGETS[input.id];
  for (const target of unmatchedTargets) console.warn(` 🎮 [library-game] [evidence] [unmatched] target=${target} game=${input.id} node=${input.nodeId}`);

  const config = { childId: input.childId, nodeId: input.nodeId, gameId: input.id, subject: game.subject, items: shown };
  // JSON in an inert script tag: "<" escaped so no item text can close the tag.
  const configTag = `<script type="application/json" id="sunny-game-config">${JSON.stringify(config).replace(/</g, "\\u003c")}</script>`;
  const head = `<base href="/games/cookoff/${input.id}/">\n${configTag}`;
  // After <meta charset> when there is one (it must stay in the first bytes), else right after <head>.
  const anchor = /<meta\s+charset=[^>]*>/i.test(source) ? /<meta\s+charset=[^>]*>/i : /<head[^>]*>/i;
  if (!anchor.test(source)) throw new Error(`library_game_head_missing:${input.id}`);
  const html = source
    .replace(anchor, (tag) => `${tag}\n${head}`)
    .replace(BRIDGE_TAG, () => `<script>\n${bridge}\n</script>`)
    // The "Hey Elli" talk trial is not part of this build (owner, 2026-11-11); its script would 404 as HTML.
    .replace(/<script[^>]*src="\/talk\/talk-client\.js"[^>]*><\/script>\s*/i, "")
    // The game draws the companion in 3D, but which companion is Sunny's call (GET /api/companion/current/<child>);
    // this is the anchor the text check asks for. Nothing reads it at runtime today.
    .replace(/<body[^>]*>/i, (tag) => `${tag}\n<div id="sunny-companion" hidden data-companion-rendered-by="library-game"></div>`);
  if (!html.includes('id="sunny-companion"')) throw new Error(`library_game_body_missing:${input.id}`);
  console.log(` 🎮 [library-game] [html] [built] game=${input.id} child=${input.childId} node=${input.nodeId} items=${shown.length} matched=${matchedItemIds.length} unmatched=${unmatchedTargets.length}`);
  return { html, matchedItemIds, unmatchedTargets };
}
