# RECON: Animation Registry + Game Event Injection
Branch: feat/companion-vrm. READ-ONLY recon.

---

## Raw source: src/server/map-coordinator.ts

```ts
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { WebSocket } from "ws";
import type {
  MapState,
  NodeConfig,
  NodeResult,
  NodeRatingLike,
  NodeType,
  SessionTheme,
} from "../shared/adventureTypes";
import { DEFAULT_MAP_WAYPOINTS } from "../shared/mapPathLayout";
import type { ChildQuality } from "../algorithms/types";
import type { ChildProfile } from "../shared/childProfile";
import { buildProfile } from "../profiles/buildProfile";
import { generateTheme, paletteOnlyThemeFromProfile } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { recordReward } from "../engine/bandit";
import { planSession, recordAttempt } from "../engine/learningEngine";
import {
  getSunnyMode,
  isDiagMapMode,
  sunnyPreviewBlocksPersistence,
} from "../utils/runtimeMode";
import { readWordBank } from "../utils/wordBankIO";
import { appendNodeRating } from "../utils/nodeRatingIO";
import { isCompanionEmote } from "../shared/companionEmotes";
import type { CompanionEvent, CompanionTrigger } from "../shared/companionTypes";
import { sessionEventBus, type SessionEventType } from "./session-event-bus";
import { getActiveVoiceSessionIdForChild } from "./voice-session-registry";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";
import { generateStoryImage } from "../utils/generateStoryImage";

/** Grok prompts for homework map nodes (filled when theme has no thumbnail for that type). */
export const NODE_THUMBNAIL_PROMPTS: Record<string, string> = {
  pronunciation:
    "microphone with colorful sound waves, children's educational app icon, bright purple background, cute cartoon style, transparent background",
  "spell-check":
    "golden pencil writing glowing letters, spelling bee trophy, stars, children's game icon, transparent background",
  "word-builder":
    "colorful alphabet blocks stacked in tower, letters glowing, children's educational toy, transparent background",
  karaoke:
    "open magical book with musical notes floating out, glowing pages, children's story, transparent background",
  quest:
    "treasure chest bursting open with gold stars and letters, adventure game icon, transparent background",
  boss: "epic castle with lightning bolts, final challenge, dramatic sky, game icon, transparent background",
};

async function enrichHomeworkNodeThumbnails(
  theme: SessionTheme,
  nodeTypes: string[],
): Promise<void> {
  if (isDiagMapMode()) return;
  const next: Record<string, string | null | undefined> = { ...(theme.nodeThumbnails ?? {}) };
  await Promise.all(
    [...new Set(nodeTypes)].map(async (type) => {
      const prompt = NODE_THUMBNAIL_PROMPTS[type];
      if (!prompt) return;
      const existing = next[type];
      if (existing != null && existing !== "") return;
      const url = await generateStoryImage(prompt, { useDirectScene: true });
      next[type] = url;
    }),
  );
  theme.nodeThumbnails = next as SessionTheme["nodeThumbnails"];
}

/** Must match `buildProfile` normalization so paths and WebSocket keys align. */
function mapCompanionWsKey(childId: string): string {
  return childId.trim().toLowerCase();
}

/** Persisted homework map theme (Grok world + thumbnails). */
export type SavedHomeworkThemeFile = {
  id: string;
  name: string;
  generatedAt: string;
  worldBackgroundUrl: string;
  palette: SessionTheme["palette"];
  thumbnails: Record<string, string | null | undefined>;
  savedBy: string;
};

function themesDirForChild(childId: string): string {
  return path.join(process.cwd(), "src", "context", mapCompanionWsKey(childId), "themes");
}

/** List saved theme JSON files for a child, oldest → newest. */
export function listSavedThemes(childId: string): SavedHomeworkThemeFile[] {
  const dir = themesDirForChild(childId);
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: SavedHomeworkThemeFile[] = [];
  for (const name of names) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ) as SavedHomeworkThemeFile;
      if (raw?.id && typeof raw.worldBackgroundUrl === "string" && raw.worldBackgroundUrl) {
        out.push(raw);
      }
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return out;
}

function sessionThemeFromSaved(doc: SavedHomeworkThemeFile): SessionTheme {
  const p = doc.palette;
  return {
    name: doc.name || "saved",
    palette: {
      ...p,
      cardBackground: p.cardBackground ?? p.particle,
    },
    ambient: { type: "dots", count: 20, speed: 1, color: p.particle ?? "#e0f2fe" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
    castleUrl: null,
    backgroundUrl: doc.worldBackgroundUrl,
    nodeThumbnails: (doc.thumbnails ?? {}) as SessionTheme["nodeThumbnails"],
    mapWaypoints: [...DEFAULT_MAP_WAYPOINTS],
    source: "saved",
  };
}

function homeworkThemePersistenceContext(profile: ChildProfile): boolean {
  return (
    Boolean(profile.pendingHomework?.nodes?.length) ||
    process.env.SUNNY_SUBJECT?.trim() === "homework"
  );
}

export async function resolveThemeForMapSession(
  profile: ChildProfile,
): Promise<{ theme: SessionTheme; shouldPersist: boolean }> {
  if (isDiagMapMode()) {
    return {
      theme: { ...paletteOnlyThemeFromProfile(profile), source: "palette" },
      shouldPersist: false,
    };
  }

  const key = mapCompanionWsKey(profile.childId);
  const persistCtx = homeworkThemePersistenceContext(profile);
  const saved = persistCtx ? listSavedThemes(key) : [];
  const useExisting =
    persistCtx && saved.length > 0 && Math.random() < 0.5;
  if (useExisting) {
    const picked = saved[saved.length - 1]!;
    console.log(`  🎨 Reusing saved theme: ${picked.name}`);
    return { theme: sessionThemeFromSaved(picked), shouldPersist: false };
  }
  const generated = await generateTheme(profile);
  const theme =
    generated != null
      ? { ...generated, source: "generated" as const }
      : { ...paletteOnlyThemeFromProfile(profile), source: "palette" as const };
  return { theme, shouldPersist: persistCtx };
}

function persistHomeworkThemeSnapshot(childId: string, theme: SessionTheme): void {
  if (isDiagMapMode()) return;
  const worldImageUrl = theme.backgroundUrl;
  if (!worldImageUrl) return;
  const themesDir = themesDirForChild(childId);
  fs.mkdirSync(themesDir, { recursive: true });
  const safeName = (theme.name ?? "world").replace(/[^a-zA-Z0-9-_]+/g, "-");
  const themeId = `${safeName}-${Date.now()}`;
  const themeFile = path.join(themesDir, `${themeId}.json`);
  const nodeThumbnails = theme.nodeThumbnails ?? {};
  const payload: SavedHomeworkThemeFile = {
    id: themeId,
    name: theme.name ?? "world",
    generatedAt: new Date().toISOString(),
    worldBackgroundUrl: worldImageUrl,
    palette: theme.palette,
    thumbnails: Object.fromEntries(Object.entries(nodeThumbnails).map(([k, v]) => [k, v])),
    savedBy: "auto",
  };
  fs.writeFileSync(themeFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`  🎨 Theme saved → themes/${path.basename(themeFile)}`);
}

type SessionRecord = {
  childId: string;
  mapState: MapState;
};

const sessions = new Map<string, SessionRecord>();

/** Browser WebSocket.OPEN — avoid importing `ws` runtime in hot paths. */
const WS_OPEN = 1;
/** Keyed by normalized map childId (same as `profile.childId` / `map_session_attach`). */
const mapSessionWebSockets = new Map<string, Set<WebSocket>>();
/** Each map WebSocket → childId from `map_session_attach` (for inbound iframe events). */
const mapSocketAttachedChildId = new WeakMap<WebSocket, string>();

const COMPANION_TRIGGER_SET = new Set<string>([
  "session_start",
  "correct_answer",
  "wrong_answer",
  "mastery_unlock",
  "session_end",
  "idle_too_long",
]);

function isCompanionTriggerValue(v: unknown): v is CompanionTrigger {
  return typeof v === "string" && COMPANION_TRIGGER_SET.has(v);
}

/** Map iframe `CompanionTrigger` → `SessionEventType` when the bus + companion bridge support it. */
export function companionTriggerToSessionEventType(
  t: CompanionTrigger,
): SessionEventType | null {
  switch (t) {
    case "correct_answer":
    case "wrong_answer":
    case "session_end":
      return t;
    case "idle_too_long":
      return "idle_10s";
    case "session_start":
    case "mastery_unlock":
      return null;
    default:
      return null;
  }
}

/**
 * Browser → server: iframe `_contract.js` fired `postMessage({ type: "companion_event" })`;
 * parent forwards over map WebSocket so `sessionEventBus` + RewardEngine + server CompanionBridge run.
 */
export function handleMapSocketIframeCompanionEvent(
  ws: WebSocket,
  msg: unknown,
): boolean {
  const regKey = mapSocketAttachedChildId.get(ws);
  if (!regKey) {
    return false;
  }
  if (!msg || typeof msg !== "object") {
    return true;
  }
  const m = msg as Record<string, unknown>;
  if (m.type !== "map_iframe_companion_event") {
    return false;
  }
  const payload = m.payload;
  if (!payload || typeof payload !== "object") {
    console.warn(
      "[map-coordinator] map_iframe_companion_event ignored: missing payload",
    );
    return true;
  }
  const pl = payload as Record<string, unknown>;
  const triggerRaw = pl.trigger;
  if (!isCompanionTriggerValue(triggerRaw)) {
    console.warn(
      "[map-coordinator] map_iframe_companion_event ignored: invalid trigger",
      triggerRaw,
    );
    return true;
  }
  const childPayload =
    typeof pl.childId === "string" ? pl.childId.trim().toLowerCase() : "";
  if (!childPayload || mapCompanionWsKey(childPayload) !== regKey) {
    console.warn(
      "[map-coordinator] map_iframe_companion_event ignored: childId mismatch",
      { regKey, childPayload },
    );
    return true;
  }
  const st = companionTriggerToSessionEventType(triggerRaw);
  if (!st) {
    console.log(
      "[map-coordinator] iframe companion trigger not routed to EventBus:",
      triggerRaw,
    );
    return true;
  }
  const ts =
    typeof pl.timestamp === "number" && Number.isFinite(pl.timestamp)
      ? pl.timestamp
      : Date.now();
  const voiceSid = getActiveVoiceSessionIdForChild(regKey) ?? "";
  sessionEventBus.fire({
    type: st,
    childId: regKey,
    sessionId: voiceSid,
    timestamp: ts,
  });
  console.log(
    "  🎮 [map-coordinator] iframe companion → EventBus",
    JSON.stringify({ type: st, childId: regKey, voiceSession: voiceSid || null }),
  );
  return true;
}

export function registerMapSessionWebSocket(
  childId: string,
  ws: WebSocket,
): void {
  const key = mapCompanionWsKey(childId);
  if (!key) return;
  mapSocketAttachedChildId.set(ws, key);
  let set = mapSessionWebSockets.get(key);
  if (!set) {
    set = new Set();
    mapSessionWebSockets.set(key, set);
  }
  set.add(ws);
  console.log(
    "[map-coordinator] registerMapSessionWebSocket",
    JSON.stringify({
      childId: key,
      socketCount: set.size,
      thisSocketReadyState: ws.readyState,
      allKeys: [...mapSessionWebSockets.keys()],
    }),
  );
  const onClose = () => {
    mapSocketAttachedChildId.delete(ws);
    set!.delete(ws);
    if (set!.size === 0) {
      mapSessionWebSockets.delete(key);
    }
    ws.off("close", onClose);
  };
  ws.once("close", onClose);
}

export function broadcastCompanionEventToMapChild(
  childId: string,
  data: unknown,
): void {
  const key = mapCompanionWsKey(childId);
  const set = mapSessionWebSockets.get(key);
  if (!set?.size) {
    console.log(
      "[map-coordinator] companion_event skipped WebSocket (no listeners)",
      JSON.stringify({
        lookupChildId: key,
        registeredKeys: [...mapSessionWebSockets.keys()],
      }),
    );
    return;
  }
  const sockets = [...set];
  console.log(
    "[map-coordinator] attempting companion_event broadcast",
    JSON.stringify({
      childId: key,
      socketCount: sockets.length,
      readyStates: sockets.map((w) => w.readyState),
    }),
  );
  const json = JSON.stringify(data);
  for (const w of set) {
    if (w.readyState === WS_OPEN) {
      try {
        w.send(json);
      } catch (err) {
        console.error("  [map-coordinator] map WebSocket send failed:", err);
      }
    }
  }
}

export function __resetAdventureMapSessionsForTests(): void {
  sessions.clear();
  mapSessionWebSockets.clear();
  // WeakMap mapSocketAttachedChildId cannot be cleared; tests use fresh WebSocket mocks.
}

/**
 * TEMP TEST ONLY — do not commit to main. Exercises `broadcastCompanionEventToMapChild`
 * without POST /api/map/node-complete (for broken game iframes).
 */
export function broadcastTestMapCompanionEvent(
  childIdRaw: string,
  triggerRaw: string,
):
  | {
      ok: true;
      childId: string;
      trigger: CompanionTrigger;
      sockets: number;
    }
  | { ok: false; error: string } {
  const allowed: CompanionTrigger[] = [
    "session_start",
    "correct_answer",
    "wrong_answer",
    "mastery_unlock",
    "session_end",
    "idle_too_long",
  ];
  const trigger = allowed.find((t) => t === triggerRaw) ?? null;
  if (!trigger) {
    return { ok: false, error: `invalid trigger: ${triggerRaw}` };
  }
  const key = mapCompanionWsKey(childIdRaw);
  if (!key) {
    return { ok: false, error: "childId required" };
  }
  const set = mapSessionWebSockets.get(key);
  const sockets = set?.size ?? 0;
  const companionEvent: CompanionEvent = {
    type: "companion_event",
    payload: {
      trigger,
      childId: key,
      timestamp: Date.now(),
    },
  };
  broadcastCompanionEventToMapChild(key, companionEvent);
  return { ok: true, childId: key, trigger, sockets };
}

/** TEMP TEST — broadcast emote + intensity on map WebSocket (diag panel). */
export function broadcastTestMapCompanionEmote(
  childIdRaw: string,
  emoteRaw: string,
  intensityRaw: number,
):
  | {
      ok: true;
      childId: string;
      emote: string;
      intensity: number;
      sockets: number;
    }
  | { ok: false; error: string } {
  if (!isCompanionEmote(emoteRaw)) {
    return { ok: false, error: `invalid emote: ${emoteRaw}` };
  }
  const key = mapCompanionWsKey(childIdRaw);
  if (!key) {
    return { ok: false, error: "childId required" };
  }
  const intensity = Math.max(0, Math.min(1, Number.isFinite(intensityRaw) ? intensityRaw : 0.8));
  const set = mapSessionWebSockets.get(key);
  const sockets = set?.size ?? 0;
  const companionEvent: CompanionEvent = {
    type: "companion_event",
    payload: {
      childId: key,
      emote: emoteRaw,
      intensity,
      timestamp: Date.now(),
    },
  };
  broadcastCompanionEventToMapChild(key, companionEvent);
  return { ok: true, childId: key, emote: emoteRaw, intensity, sockets };
}

/** TEMP TEST — validated `companionAct` command on map WebSocket (diag / tooling). */
export function broadcastTestMapCompanionAct(
  childIdRaw: string,
  raw: { type: string; payload: Record<string, unknown> },
):
  | {
      ok: true;
      childId: string;
      type: string;
      sockets: number;
    }
  | { ok: false; error: string } {
  const key = mapCompanionWsKey(childIdRaw);
  if (!key) {
    return { ok: false, error: "childId required" };
  }
  const cmd = validateCompanionCommand(
    { type: raw.type, payload: raw.payload },
    COMPANION_CAPABILITIES,
    { childId: key, source: "diag" },
  );
  if (!cmd) {
    return { ok: false, error: "invalid_companion_command" };
  }
  const set = mapSessionWebSockets.get(key);
  const sockets = set?.size ?? 0;
  broadcastCompanionEventToMapChild(key, {
    type: "companion_command",
    command: cmd,
  });
  return { ok: true, childId: key, type: cmd.type, sockets };
}

export class MapSessionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "MapSessionError";
  }
}

function syncNodeStatuses(state: MapState): void {
  const completed = new Set(state.completedNodes);
  const unlockAll = getSunnyMode() !== "real";
  state.nodes = state.nodes.map((node, idx) => ({
    ...node,
    isCompleted: completed.has(node.id),
    isLocked: unlockAll
      ? false
      : idx > state.currentNodeIndex && !completed.has(node.id),
  }));
}

function clampNodeDifficulty(raw: number | undefined): 1 | 2 | 3 {
  const n = raw ?? 2;
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function isWordDrivenHomeworkNodeType(t: string): boolean {
  return (
    t === "pronunciation" ||
    t === "karaoke" ||
    t === "word-builder" ||
    t === "spell-check" ||
    t === "quest" ||
    t === "boss"
  );
}

/** Adventure map path from `ChildProfile.pendingHomework` (via `buildProfile`). Exported for tests. */
export function pendingHomeworkToNodeConfigs(
  hw: NonNullable<ChildProfile["pendingHomework"]>,
  dueWords: string[],
): NodeConfig[] {
  const words = dueWords.length ? dueWords : hw.wordList;
  return hw.nodes.map((node, i, arr) => ({
    id: node.id,
    type: node.type as NodeType,
    words: isWordDrivenHomeworkNodeType(node.type) ? words : [],
    difficulty: clampNodeDifficulty(node.difficulty),
    gameFile: node.gameFile ?? undefined,
    storyFile: node.storyFile ?? undefined,
    storyText: node.storyText,
    date: node.date ?? hw.weekOf,
    isCastle: node.type === "boss",
    thumbnailUrl: undefined,
    thumbnailPrompt: NODE_THUMBNAIL_PROMPTS[node.type] ?? undefined,
    isLocked: false,
    isCompleted: false,
    isGoal: i === arr.length - 1,
  }));
}

/** Static theme — no Grok / designer image pipeline (`isDiagMapMode()` / diag map session). */
function diagSessionTheme(): SessionTheme {
  const accent = "#1a56db";
  return {
    name: "default",
    palette: {
      sky: "#6ec8ff",
      ground: "#228b5c",
      accent,
      particle: "#e0f2fe",
      glow: accent,
      cardBackground: "#f0f9ff",
    },
    ambient: { type: "dots", count: 20, speed: 1, color: "#e0f2fe" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
    castleUrl: null,
    nodeThumbnails: {},
    mapWaypoints: [...DEFAULT_MAP_WAYPOINTS],
  };
}

/**
 * Isolated diag map: no buildProfile, no Grok, fixed nodes for kiosk QA.
 */
export function buildDiagMapSession(): { sessionId: string; mapState: MapState } {
  const sessionDate = new Date().toISOString();
  const theme = diagSessionTheme();
  let dueWords: string[] = ["seed", "demo"];
  try {
    const plan = planSession("creator", "spelling");
    const picked =
      plan.dueWords?.length && plan.dueWords.length > 0
        ? plan.dueWords
        : [...plan.newWords, ...plan.reviewWords];
    if (picked.length > 0) dueWords = picked;
  } catch (err) {
    console.warn(
      "  🎮 [diag-map] planSession(creator) failed — using placeholder due words:",
      err instanceof Error ? err.message : String(err),
    );
  }
  const nodes: NodeConfig[] = [
    {
      id: "n-riddle",
      type: "riddle",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
      words: [],
    },
    {
      id: "n-wb",
      type: "word-builder",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: [...dueWords],
    },
    {
      id: "n-karaoke",
      type: "karaoke",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: [...dueWords],
    },
    {
      id: "n-coins",
      type: "coin-counter",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: [],
    },
    {
      id: "n-castle",
      type: "boss",
      isLocked: false,
      isCompleted: false,
      isGoal: true,
      difficulty: 3,
      words: [...dueWords],
    },
  ];
  const mapState: MapState = {
    childId: "creator",
    sessionDate,
    nodes,
    currentNodeIndex: 0,
    completedNodes: [],
    theme,
    xp: 0,
    level: 1,
  };
  syncNodeStatuses(mapState);
  const sessionId = randomUUID();
  sessions.set(sessionId, { childId: "creator", mapState });
  return { sessionId, mapState };
}

export async function startMapSession(
  childId: string,
): Promise<{ sessionId: string; mapState: MapState }> {
  const profile = await buildProfile(childId);
  if (!profile) {
    throw new MapSessionError("unknown_child", 404);
  }
  const { theme, shouldPersist } = await resolveThemeForMapSession(profile);
  const nodes =
    profile.pendingHomework?.nodes?.length
      ? (() => {
          const homeworkPlan = planSession(childId, "homework");
          const dueWords =
            homeworkPlan.dueWords?.length && profile.pendingHomework
              ? homeworkPlan.dueWords
              : profile.pendingHomework.wordList;
          return pendingHomeworkToNodeConfigs(profile.pendingHomework, dueWords);
        })()
      : await buildNodeList(profile, theme);
  try {
    await enrichHomeworkNodeThumbnails(theme, nodes.map((n) => n.type as string));
  } catch (err) {
    console.error("🎮 [map-coordinator] enrichHomeworkNodeThumbnails failed", err);
  }
  if (
    shouldPersist &&
    homeworkThemePersistenceContext(profile) &&
    theme.backgroundUrl
  ) {
    try {
      persistHomeworkThemeSnapshot(profile.childId, theme);
    } catch (err) {
      console.error("🎮 [map-coordinator] persistHomeworkThemeSnapshot failed", err);
    }
  }
  const sessionDate = new Date().toISOString();
  const mapState: MapState = {
    childId: profile.childId,
    sessionDate,
    nodes,
    currentNodeIndex: 0,
    completedNodes: [],
    theme,
    xp: 0,
    level: profile.level,
  };
  syncNodeStatuses(mapState);
  const sessionId = randomUUID();
  sessions.set(sessionId, { childId: profile.childId, mapState });
  return { sessionId, mapState };
}

function currentNode(state: MapState): NodeConfig | undefined {
  return state.nodes[state.currentNodeIndex];
}

export function handleMapClientMessage(
  sessionId: string,
  raw: unknown,
): Array<Record<string, unknown>> {
  const rec = sessions.get(sessionId);
  if (!rec) {
    throw new MapSessionError("unknown_session", 404);
  }
  const msg = raw as { type?: string; payload?: Record<string, unknown> };
  const out: Array<Record<string, unknown>> = [];

  if (msg.type === "node_click") {
    const nodeId = String(msg.payload?.nodeId ?? "");
    const cur = currentNode(rec.mapState);
    if (!cur || cur.id !== nodeId) {
      return [{ type: "map_error", payload: { reason: "not_current_node" } }];
    }
    out.push({ type: "node_launched", payload: cur });
    return out;
  }

  return [{ type: "map_error", payload: { reason: "unknown_message" } }];
}

function ratingFromResult(result: NodeResult): NodeRatingLike {
  if (!result.completed) return "dislike";
  return result.accuracy >= 0.5 ? "like" : "dislike";
}

function appendMapSessionNote(
  childId: string,
  sessionDate: string,
  summary: string,
): void {
  try {
    const dateStr = sessionDate.slice(0, 10);
    const dir = path.join(
      process.cwd(),
      "src",
      "context",
      childId,
      "session_notes",
    );
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, `${dateStr}.md`);
    fs.appendFileSync(fp, `\n- ${summary}\n`, "utf-8");
    console.log(`  🎮 [map-coordinator] session note line: ${summary}`);
  } catch (err) {
    console.error("  🔴 [map-coordinator] session note append failed:", err);
  }
}

export async function applyNodeResult(
  sessionId: string,
  result: NodeResult,
  opts?: { clientPreviewFreeOrGoLive?: boolean },
): Promise<{ mapState: MapState; companionEvent: CompanionEvent }> {
  const rec = sessions.get(sessionId);
  if (!rec) {
    throw new MapSessionError("unknown_session", 404);
  }
  const st = rec.mapState;
  const nodeCfg = st.nodes.find((n) => n.id === result.nodeId);
  if (!nodeCfg) {
    throw new MapSessionError("unknown_node", 400);
  }

  if (!st.completedNodes.includes(result.nodeId)) {
    st.completedNodes.push(result.nodeId);
  }

  const rating = ratingFromResult(result);
  const skipPersistence =
    sunnyPreviewBlocksPersistence() || opts?.clientPreviewFreeOrGoLive === true;

  if (!skipPersistence) {
    await appendNodeRating({
      childId: st.childId,
      sessionDate: st.sessionDate,
      nodeType: nodeCfg.type,
      word: "session",
      theme: st.theme.name,
      rating,
      completionTime_ms: result.timeSpent_ms,
      accuracy: result.accuracy,
      abandonedEarly: !result.completed,
    });
  }

  const liked = rating === "like";
  if (!skipPersistence) {
    try {
      await recordReward(
        st.childId,
        nodeCfg.type,
        liked,
        result.completed,
        result.accuracy,
      );
    } catch (err) {
      console.error("  🔴 [map-coordinator] recordReward failed:", err);
    }
  }

  if (!skipPersistence && nodeCfg.type !== "spell-check") {
    const pool =
      nodeCfg.words && nodeCfg.words.length > 0
        ? nodeCfg.words
        : null;
    const nAttempt = Math.max(0, Math.floor(result.wordsAttempted));
    const count = pool ? Math.min(nAttempt, pool.length) : nAttempt;
    for (let i = 0; i < count; i++) {
      const word = pool ? pool[i]! : `attempt-${i + 1}`;
      const correct = result.completed && result.accuracy >= 0.5;
      try {
        recordAttempt(st.childId, {
          word,
          domain: "spelling",
          correct,
          quality: (correct ? 4 : 2) as ChildQuality,
          scaffoldLevel: 2,
          responseTimeMs: result.timeSpent_ms,
        });
      } catch (err) {
        console.error("  🔴 [map-coordinator] recordAttempt failed:", err);
      }
    }
  }

  if (result.completed) {
    let xpDelta = 5;
    const wn = Math.max(0, result.wordsAttempted);
    const correctWords =
      wn === 0 ? 0 : Math.min(wn, Math.round(wn * result.accuracy));
    xpDelta += correctWords * 10;
    const bankAfter = readWordBank(st.childId);
    for (let i = 0; i < Math.min(wn, bankAfter.words.length); i++) {
      if (bankAfter.words[i]?.tracks?.spelling?.mastered === true) {
        xpDelta += 25;
      }
    }
    // Castle bonus (TASK-015).
    if (nodeCfg.isGoal) {
      xpDelta += 50;
    }
    st.xp += xpDelta;
  }

  if (!skipPersistence) {
    appendMapSessionNote(
      st.childId,
      st.sessionDate,
      `Map node ${nodeCfg.type} ${result.nodeId} completed=${result.completed} accuracy=${result.accuracy}`,
    );
  }

  if (st.currentNodeIndex < st.nodes.length - 1) {
    st.currentNodeIndex++;
  }
  syncNodeStatuses(st);

  const trigger =
    rating === "like" ? ("correct_answer" as const) : ("wrong_answer" as const);
  const companionEvent: CompanionEvent = {
    type: "companion_event",
    payload: {
      trigger,
      childId: st.childId,
      timestamp: Date.now(),
    },
  };
  console.log(
    "[map-coordinator] applyNodeResult emitting companion_event",
    JSON.stringify({
      sessionId: sessionId.slice(0, 8),
      mapChildId: st.childId,
      wsLookupKey: mapCompanionWsKey(st.childId),
      trigger,
    }),
  );
  broadcastCompanionEventToMapChild(st.childId, companionEvent);

  return { mapState: st, companionEvent };
}

export function getMapState(sessionId: string): MapState | null {
  return sessions.get(sessionId)?.mapState ?? null;
}

/** Explicit like / dislike / skip (null) after a node (TASK-013). */
export async function recordExplicitMapRating(
  sessionId: string,
  nodeId: string,
  rating: "like" | "dislike" | null,
): Promise<void> {
  const rec = sessions.get(sessionId);
  if (!rec) {
    throw new MapSessionError("unknown_session", 404);
  }
  const nodeCfg = rec.mapState.nodes.find((n) => n.id === nodeId);
  if (!nodeCfg) {
    throw new MapSessionError("unknown_node", 400);
  }
  const like: NodeRatingLike = rating === "like" ? "like" : "dislike";
  await appendNodeRating({
    childId: rec.mapState.childId,
    sessionDate: rec.mapState.sessionDate,
    nodeType: nodeCfg.type,
    word: "session",
    theme: rec.mapState.theme.name,
    rating: like,
    completionTime_ms: 0,
    accuracy: 0,
    abandonedEarly: rating === null,
  });
}
```
## Raw source: src/server/game-bridge.ts

```ts
import { getReward, getTool, type GameDefinition } from "./games/registry";

/**
 * Thin bridge: post outbound messages to a game iframe and normalize inbound events.
 * Game-agnostic — no embedded titles or modes.
 */
export class GameBridge {
  onEvent: (type: string, data: unknown) => void = () => {};
  onComplete: (data: unknown) => void = () => {};

  constructor(
    private readonly postMessage?: (payload: Record<string, unknown>) => void,
    private readonly onVoiceFromGame?: (voiceEnabled: boolean) => void,
  ) {}

  startGame(
    _gameUrl: string,
    childName: string,
    config: Record<string, unknown>,
    companionName?: string,
  ): void {
    this.postMessage?.({
      type: "start",
      childName,
      companionName,
      config,
    });
  }

  /**
   * Resolve URL + default config from the games registry, then start.
   */
  launchByName(
    name: string,
    type: "tool" | "reward",
    childName: string,
    config?: Record<string, unknown>,
    companionName?: string,
  ): void {
    const entry: GameDefinition | null =
      type === "tool" ? getTool(name) : getReward(name);
    if (!entry) return;
    this.onVoiceFromGame?.(entry.voiceEnabled);
    const merged = { ...entry.defaultConfig, ...(config ?? {}) };
    this.startGame(entry.url, childName, merged, companionName);
  }

  sendToGame(type: string, data: Record<string, unknown>): void {
    this.postMessage?.({ type, ...data });
  }

  endGame(): void {
    this.postMessage?.({ type: "clear" });
  }

  handleGameEvent(event: Record<string, unknown>): void {
    const t = event.type;
    if (typeof t !== "string") return;

    if (t === "game_complete") {
      const { type: _drop, ...rest } = event;
      this.onComplete(rest);
      return;
    }

    const { type: _drop, ...data } = event;
    this.onEvent(t, data);
  }
}
```
## Raw source: src/shared/adventureTypes.ts

```ts
/**
 * Adventure map shared types (TASK-003). Interfaces only — no runtime logic here.
 */

export type NodeType =
  | "word-builder"
  | "bubble-pop"
  | "karaoke"
  | "clock-game"
  | "coin-counter"
  | "spell-check"
  | "riddle"
  | "space-invaders"
  | "asteroid"
  | "space-frogger"
  | "boss";

export interface NodeConfig {
  id: string;
  type: NodeType;
  isLocked: boolean;
  isCompleted: boolean;
  isGoal: boolean;
  difficulty: 1 | 2 | 3;
  thumbnailUrl?: string;
  /** Grok / designer prompt for on-demand thumbnails (homework map). */
  thumbnailPrompt?: string;
  /** Karaoke passage when `type === "karaoke"`. */
  words?: string[];
  /** Homework node metadata (quest/boss routing). */
  gameFile?: string;
  storyFile?: string;
  storyText?: string;
  date?: string;
  /** Optional node theme label (client / diag). */
  theme?: string;
  isCastle?: boolean;
  /** Curtain / accent override for transitions (optional). */
  accentColor?: string;
}

export type NodeRatingLike = "like" | "dislike";

export interface NodeRating {
  childId: string;
  sessionDate: string;
  nodeType: NodeType;
  word: string;
  theme: string;
  rating: NodeRatingLike;
  completionTime_ms: number;
  accuracy: number;
  abandonedEarly: boolean;
}

export interface NodeResult {
  nodeId: string;
  completed: boolean;
  accuracy: number;
  timeSpent_ms: number;
  wordsAttempted: number;
}

export interface SessionThemePalette {
  sky: string;
  ground: string;
  accent: string;
  particle: string;
  glow: string;
  /** Optional reading / karaoke card fill; client falls back if absent. */
  cardBackground?: string;
}

export interface SessionThemeAmbient {
  type: string;
  count: number;
  speed: number;
  color: string;
}

/** Normalized 0–1 coordinates on the map container; used for arc-length node layout. */
export interface MapWaypoint {
  x: number;
  y: number;
}

export interface SessionTheme {
  name: string;
  palette: SessionThemePalette;
  ambient: SessionThemeAmbient;
  nodeStyle: string;
  pathStyle: string;
  castleVariant: string;
  /** Where this theme came from (diag bundle / generator); optional for wire payloads. */
  source?: "saved" | "palette" | "generated";
  backgroundUrl?: string;
  /** Grok castle asset; null if generation failed or no API key. */
  castleUrl?: string | null;
  /** Grok thumbnails keyed by node type; null per key when that asset failed. */
  nodeThumbnails?: Record<string, string | null>;
  /** Optional path polyline in normalized space; nodes spaced by arc length. */
  mapWaypoints?: ReadonlyArray<MapWaypoint>;
}

export interface MapState {
  childId: string;
  sessionDate: string;
  nodes: NodeConfig[];
  currentNodeIndex: number;
  completedNodes: string[];
  theme: SessionTheme;
  xp: number;
  level: number;
}

/** Canonical arm ordering for bandit / registry (TASK-005). */
export const ALL_NODE_TYPES: readonly NodeType[] = [
  "word-builder",
  "bubble-pop",
  "karaoke",
  "clock-game",
  "coin-counter",
  "spell-check",
  "riddle",
  "space-invaders",
  "asteroid",
  "space-frogger",
  "boss",
] as const;
```
## Raw source: src/shared/companionEmotes.ts

```ts
/**
 * Emotes for `expressCompanion` and optional `CompanionEventPayload.emote`.
 * Single source for server Zod, validation, and web.
 */

export const COMPANION_EMOTES = [
  "happy",
  "sad",
  "thinking",
  "surprised",
  "celebrating",
  "neutral",
  "wink",
] as const;

export type CompanionEmote = (typeof COMPANION_EMOTES)[number];

const EMOTE_SET = new Set<string>(COMPANION_EMOTES);

export function isCompanionEmote(v: unknown): v is CompanionEmote {
  return typeof v === "string" && EMOTE_SET.has(v);
}
```
## Raw source: src/shared/companionTypes.ts

```ts
/**
 * Shared companion pipeline types (COMPANION-001).
 * Transport-agnostic; server and web both import from here.
 */

import type { CompanionEmote } from "./companionEmotes";

export type { CompanionEmote } from "./companionEmotes";

export type CompanionTrigger =
  | "session_start"
  | "correct_answer"
  | "wrong_answer"
  | "mastery_unlock"
  | "session_end"
  | "idle_too_long";

export type CompanionSensitivity = Record<CompanionTrigger, number>;

export interface CompanionFaceCamera {
  position: [number, number, number];
  target: [number, number, number];
}

export interface CompanionConfig {
  /** Preset key from children.config.json (elli | matilda | creator | …). */
  companionId: string;
  vrmUrl: string;
  /** Semantic expression id → VRM blend shape name (see children.config.json). */
  expressions: Record<string, string>;
  faceCamera: CompanionFaceCamera;
  dopamineGames: string[];
  sensitivity: CompanionSensitivity;
  idleFrequency_ms: number;
  randomMomentProbability: number;
  toggledOff: boolean;
}

export interface CompanionEventPayload {
  /** Map / game / sensitivity path */
  trigger?: CompanionTrigger;
  /** Claude `expressCompanion` path */
  emote?: CompanionEmote;
  /** 0–1; default 0.8 when omitted on wire */
  intensity?: number;
  timestamp: number;
  childId: string;
  metadata?: Record<string, unknown>;
}

export interface CompanionEvent {
  type: "companion_event";
  payload: CompanionEventPayload;
}

/** Phase 0.5 defaults; assembled in `buildProfile` (single source of truth). */
export const COMPANION_DEFAULTS: CompanionConfig = {
  companionId: "",
  vrmUrl: "/companions/sample.vrm",
  expressions: {
    idle: "neutral",
    happy: "happy",
    thinking: "lookDown",
    celebrating: "happy",
    concerned: "sad",
    winking: "blinkLeft",
    surprised: "surprised",
    angry: "angry",
    blink: "blink",
  },
  faceCamera: {
    position: [0, 1.4, 0.8],
    target: [0, 1.4, 0],
  },
  dopamineGames: ["space-invaders", "asteroid", "space-frogger"],
  sensitivity: {
    session_start: 0.8,
    correct_answer: 0.9,
    wrong_answer: 0.6,
    mastery_unlock: 1.0,
    session_end: 0.7,
    idle_too_long: 0.5,
  },
  idleFrequency_ms: 8000,
  randomMomentProbability: 0.3,
  toggledOff: false,
};

export function cloneCompanionDefaults(): CompanionConfig {
  return {
    ...COMPANION_DEFAULTS,
    sensitivity: { ...COMPANION_DEFAULTS.sensitivity },
    expressions: { ...COMPANION_DEFAULTS.expressions },
    faceCamera: {
      position: [...COMPANION_DEFAULTS.faceCamera.position],
      target: [...COMPANION_DEFAULTS.faceCamera.target],
    },
    dopamineGames: [...COMPANION_DEFAULTS.dopamineGames],
  };
}

/** Deep-merge API/partial companion objects so missing `sensitivity` keys never break reactions. */
export function mergeCompanionConfigWithDefaults(
  partial: Partial<CompanionConfig> | null | undefined,
): CompanionConfig {
  const d = cloneCompanionDefaults();
  if (!partial) return d;
  return {
    ...d,
    ...partial,
    companionId: partial.companionId ?? d.companionId,
    vrmUrl: partial.vrmUrl ?? d.vrmUrl,
    sensitivity: { ...d.sensitivity, ...(partial.sensitivity ?? {}) },
    expressions: { ...d.expressions, ...(partial.expressions ?? {}) },
    faceCamera: partial.faceCamera
      ? {
          position: [...partial.faceCamera.position] as [number, number, number],
          target: [...partial.faceCamera.target] as [number, number, number],
        }
      : {
          position: [...d.faceCamera.position] as [number, number, number],
          target: [...d.faceCamera.target] as [number, number, number],
        },
    dopamineGames:
      partial.dopamineGames && partial.dopamineGames.length > 0
        ? [...partial.dopamineGames]
        : [...d.dopamineGames],
  };
}

/**
 * Merge learning-profile companion overrides onto a **preset** from children.config.json.
 * Identity fields (vrmUrl, expressions, faceCamera, dopamineGames) always come from the preset;
 * learning_profile may only tune reactions (sensitivity, timers, toggledOff).
 */
export function mergeCompanionPresetWithLearningProfile(
  preset: CompanionConfig,
  partial: Partial<CompanionConfig> | null | undefined,
): CompanionConfig {
  if (!partial) {
    return {
      ...preset,
      sensitivity: { ...preset.sensitivity },
      expressions: { ...preset.expressions },
      faceCamera: {
        position: [...preset.faceCamera.position],
        target: [...preset.faceCamera.target],
      },
      dopamineGames: [...preset.dopamineGames],
    };
  }
  return {
    ...preset,
    companionId: partial.companionId ?? preset.companionId,
    vrmUrl: preset.vrmUrl,
    expressions: { ...preset.expressions },
    faceCamera: {
      position: [...preset.faceCamera.position],
      target: [...preset.faceCamera.target],
    },
    dopamineGames: [...preset.dopamineGames],
    sensitivity: { ...preset.sensitivity, ...(partial.sensitivity ?? {}) },
    idleFrequency_ms: partial.idleFrequency_ms ?? preset.idleFrequency_ms,
    randomMomentProbability:
      partial.randomMomentProbability ?? preset.randomMomentProbability,
    toggledOff: partial.toggledOff ?? preset.toggledOff,
  };
}
```
## Raw source: src/shared/companions/generateCompanionCapabilities.ts

```ts
/**
 * Markdown for Claude system prompts (COMPANION-API-005).
 * Same idea as generateCanvasCapabilities — registry-driven, no hand-written prose per capability.
 */

import type { CompanionCapabilityPhase } from "./companionContract";
import { COMPANION_CAPABILITIES } from "./registry";

const PHASE_ORDER: CompanionCapabilityPhase[] = [0.5, 1, 2, 3];

export function generateCompanionCapabilities(
  maxPhase: CompanionCapabilityPhase = 0.5,
): string {
  const defs = [...COMPANION_CAPABILITIES.values()].filter(
    (d) => d.phase <= maxPhase,
  );
  defs.sort(
    (a, b) =>
      PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
      a.type.localeCompare(b.type),
  );

  const lines: string[] = [
    "# Companion Capabilities",
    "",
    "Use the **companionAct** tool with `type` and `payload` exactly as documented below.",
    "Do not invent capability types or payload fields that are not listed.",
    "",
    "## Available actions",
    "",
  ];

  for (const def of defs) {
    lines.push(`### ${def.type} (v${def.version}, phase ${def.phase})`);
    lines.push(def.description);
    lines.push("");
    lines.push("**When it can help:**");
    for (const w of def.whenToUse) {
      lines.push(`- ${w}`);
    }
    lines.push("");
    lines.push(`**Example:** \`companionAct({ type: "${def.type}", payload: ${JSON.stringify(def.defaultPayload)} })\``);
    lines.push("");
    if (def.type === "animate") {
      lines.push(
        "**Guidance:** Use **animate** for physical actions (wave, dance, think, shrug). Use **emote** only for facial expressions.",
      );
      lines.push(
        "Example: `companionAct({ type: 'animate', payload: { animation: 'wave' } })` — not `companionAct({ type: 'emote', payload: { emote: 'happy' } })` for body language.",
      );
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function getCompanionCapabilities(): string {
  return generateCompanionCapabilities();
}
```
## Raw source: src/utils/generateCanvasCapabilities.ts

```ts
import fs from "fs";
import path from "path";
import { REWARD_GAMES, TEACHING_TOOLS } from "../server/games/registry";

export const CANVAS_CAPABILITIES = {
  teaching: {
    description: "Plain text, word, or equation displayed center screen",
    useFor: ["showing a word", "displaying a math problem", "presenting a sentence"],
    props: ["content: string", "phonemeBoxes?: PhonemeBox[]"],
    example: '{ mode: "teaching", content: "railroad" }',
  },
  spelling: {
    description: "Blank tiles revealed letter by letter as child spells aloud. Word hidden by default.",
    useFor: [
      "spelling practice",
      "spelling tests",
      "compound word morpheme work",
      "competitive streak spelling",
    ],
    props: [
      "spellingWord: string — the full word to spell",
      "spellingRevealed: string[] — letters confirmed so far",
      "showWord: 'hidden' | 'hint' | 'always' — default hidden",
      "compoundBreak?: number — tile index where compound word splits",
      "streakCount?: number — current streak (competitive mode)",
      "personalBest?: number — session personal best (competitive mode)",
    ],
    example: '{ mode: "spelling", spellingWord: "railroad", spellingRevealed: ["r","a"], showWord: "hidden", compoundBreak: 3 }',
  },
  place_value: {
    description: "Column layout showing hundreds, tens, ones with active column highlight",
    useFor: ["multi-digit addition", "multi-digit subtraction", "borrowing and carrying"],
    props: ["operandA: number", "operandB: number", "operation: string", "activeColumn: string", "revealedColumns: string[]"],
    example: '{ mode: "place_value", operandA: 395, operandB: 77, activeColumn: "ones" }',
  },
  reward: {
    description: "Celebration Lottie animation",
    useFor: ["correct answer celebration", "encouragement"],
    props: [],
    example: '{ mode: "reward" }',
  },
  championship: {
    description: "Trophy animation with session score",
    useFor: ["end of session summary", "milestone celebration"],
    props: ["score?: number"],
    example: '{ mode: "championship", score: 8 }',
  },
  "word-builder": {
    description:
      "Fill-in-the-blanks spelling game. Child completes the word with decreasing visual support across 4 rounds. Tap letters on keyboard.",
    useFor: ["reward after a correct spelling", "decoding practice"],
    props: [
      "gameUrl: string (static page)",
      "gameWord: string",
      "gamePlayerName?: string",
      "wordBuilderRound?: number",
      "wordBuilderMode?: \"fill_blanks\"",
    ],
    example:
      '{ mode: "word-builder", gameUrl: "/games/wordd-builder.html", gameWord: "cowboy", wordBuilderRound: 1, wordBuilderMode: "fill_blanks" }',
  },
  "spell-check": {
    description:
      "Typing-only spelling check. Child types the full word on an on-screen keyboard; target word is never shown.",
    useFor: [
      "after repeated voice spelling failures",
      "when ASR may be scrambling letter order",
    ],
    props: [
      "gameUrl: string (static page)",
      "gameWord: string",
      "gamePlayerName?: string",
    ],
    example:
      '{ mode: "spell-check", gameUrl: "/games/spell-check.html", gameWord: "bathroom", gamePlayerName: "Ila" }',
  },
} as const;

export function generateCanvasCapabilities(): string {
  const lines = [
    "# Canvas Capabilities",
    "",
    "Auto-generated at startup from src/utils/generateCanvasCapabilities.ts",
    "DO NOT EDIT MANUALLY — changes will be overwritten on next launch",
    "",
    "## Game names",
    "",
    "- **Only use names that appear exactly** in this manifest under **Teaching Tools** and **Reward Games** (each `###` heading is a valid game id).",
    "- If the request does not match exactly, choose the **closest** name in those sections **by meaning**—never guess a new slug.",
    "- **Never invent** a game name that is not listed in this manifest.",
    "",
    "## Available Modes",
    "",
  ];

  for (const [mode, info] of Object.entries(CANVAS_CAPABILITIES)) {
    lines.push(`### ${mode}`);
    lines.push(info.description);
    lines.push(`**Use for:** ${info.useFor.join(", ")}`);
    if (info.props.length > 0) {
      lines.push(`**Props:** ${info.props.join(", ")}`);
    }
    lines.push(`**Example:** \`${info.example}\``);
    lines.push("");
  }

  lines.push("## Teaching Tools");
  for (const [name, def] of Object.entries(TEACHING_TOOLS)) {
    lines.push(`### ${name}`);
    if (name === "word-builder") {
      lines.push(
        `Launch: **launchGame** with \`{ name: "word-builder", type: "tool", word: "<homework word>" }\`.`,
      );
    } else if (name === "spell-check") {
      lines.push(
        `Launch: **launchGame** with \`{ name: "spell-check", type: "tool", word: "<homework word>" }\`.`,
      );
    } else {
      lines.push(`Launch: launchGame("${name}", "tool")`);
    }
    lines.push(`Voice enabled: ${def.voiceEnabled}`);
    lines.push(`Default config: ${JSON.stringify(def.defaultConfig)}`);
    lines.push("");
  }

  lines.push("## Reward Games");
  for (const [name, def] of Object.entries(REWARD_GAMES)) {
    lines.push(`### ${name}`);
    lines.push(`Launch: launchGame("${name}", "reward")`);
    lines.push(`Voice enabled: ${def.voiceEnabled}`);
    lines.push(`Default config: ${JSON.stringify(def.defaultConfig)}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeCanvasCapabilities(): void {
  const content = generateCanvasCapabilities();
  const outputPath = path.join(process.cwd(), "CANVAS_CAPABILITIES.md");
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log("  📋 Canvas capabilities manifest written");
}

export function getCanvasCapabilities(): string {
  return generateCanvasCapabilities();
}
```
## Raw source: src/server/games/registryDiscover.ts

```ts
import fs from "fs";
import path from "path";

export interface GameDefinition {
  url: string;
  defaultConfig: Record<string, unknown>;
  voiceEnabled: boolean;
}

type GameMetaEntry = {
  type: "tool" | "reward";
  voiceEnabled: boolean;
  defaultConfig?: Record<string, unknown>;
  /** Registry / canvas mode id when it differs from the .html basename */
  key?: string;
};

const GAMES_DIR = path.join(process.cwd(), "web/public/games");

/** Known metadata — reward type, non-default config, or filename ≠ public game id */
export const GAME_META: Record<string, GameMetaEntry> = {
  "wordd-builder": {
    type: "tool",
    voiceEnabled: true,
    key: "word-builder",
  },
  "bd-reversal-game": {
    type: "tool",
    voiceEnabled: true,
    key: "bd-reversal",
    defaultConfig: {
      pairs: ["bd"],
      probeWords: ["bed", "dog", "big", "duck", "bird", "dab"],
    },
  },
  "spell-check": { type: "tool", voiceEnabled: true },
  "coin-counter": { type: "tool", voiceEnabled: true },
  "vault-cracker": { type: "tool", voiceEnabled: true },
  "store-game": {
    type: "tool",
    voiceEnabled: true,
    defaultConfig: { itemPool: [] },
  },
  "clock-game": {
    type: "tool",
    voiceEnabled: true,
    defaultConfig: { hour: 3, minute: 0 },
  },
  "space-invaders": {
    type: "reward",
    voiceEnabled: true,
    defaultConfig: { duration_seconds: 180, level: 1 },
  },
  "space-frogger": {
    type: "reward",
    voiceEnabled: true,
    defaultConfig: { duration_seconds: 180, level: 1 },
  },
  asteroid: {
    type: "reward",
    voiceEnabled: true,
    defaultConfig: { duration_seconds: 180, level: 1 },
  },
};

export function discoverGames(): {
  tools: Record<string, GameDefinition>;
  rewards: Record<string, GameDefinition>;
} {
  const tools: Record<string, GameDefinition> = {};
  const rewards: Record<string, GameDefinition> = {};
  const defaults: GameMetaEntry = { type: "tool", voiceEnabled: true };

  if (!fs.existsSync(GAMES_DIR)) {
    return { tools, rewards };
  }

  for (const file of fs.readdirSync(GAMES_DIR)) {
    if (!file.endsWith(".html")) continue;
    const stem = file.replace(/\.html$/i, "");
    const meta = GAME_META[stem] ?? defaults;
    const registryKey = meta.key ?? stem;

    const def: GameDefinition = {
      url: `/games/${file}`,
      defaultConfig: meta.defaultConfig ?? {},
      voiceEnabled: meta.voiceEnabled,
    };

    if (meta.type === "reward") {
      rewards[registryKey] = def;
    } else {
      tools[registryKey] = def;
    }
  }

  return { tools, rewards };
}
```
## Raw source: web/src/components/CompanionLayer.tsx

```tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  COMPANION_ANIMATE_TO_EXPRESSION_KEY,
  type CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import { CompanionMotor } from "../companion/CompanionMotor";

/** Interim animate→expression pulse keys (Opus will replace with procedural bones). */
export const ANIMATE_TO_EXPRESSION_KEY = COMPANION_ANIMATE_TO_EXPRESSION_KEY;

export interface CompanionLayerProps {
  childId: string | null;
  companion: CompanionConfig | null;
  toggledOff: boolean;
  /** "portrait": 120×120 fixed bottom-right circle (canvas/game overlay). "full": full-screen overlay (default). */
  mode?: "full" | "portrait";
  /** When true, shrink companion to bottom-right for karaoke reading space. Ignored in portrait mode. */
  karaokeActive?: boolean;
  companionEvents?: CompanionEventPayload[];
  /** Validated `companionAct` commands (voice or map WebSocket). */
  companionCommands?: CompanionCommand[];
  /** Screen pixel for LookAt (viewport); null drifts gaze toward screen center. */
  activeNodeScreen?: { x: number; y: number } | null;
  /** Playback analyser from `useSession` for mouth sync; omit in diag/tests (no voice pipeline). */
  analyserNodeRef?: RefObject<AnalyserNode | null>;
  /** Short line above companion (non-interactive). */
  speechBubbleText?: string | null;
  /** Current real mic mute state (from useSession). Controls 🔇 overlay in portrait mode. */
  micMuted?: boolean;
  /** Called when portrait is tapped. Should call useSession's toggleMicMute. */
  onToggleMute?: () => void;
}

type CompanionRenderer = WebGPURenderer | THREE.WebGLRenderer;

function isWebGpuRenderer(r: CompanionRenderer): r is WebGPURenderer {
  return "isWebGPURenderer" in r && r.isWebGPURenderer === true;
}

function resolveModelUrl(vrmUrl: string): string {
  if (vrmUrl.startsWith("http://") || vrmUrl.startsWith("https://")) {
    return vrmUrl;
  }
  if (typeof window === "undefined") {
    return vrmUrl;
  }
  return `${window.location.origin}${vrmUrl.startsWith("/") ? "" : "/"}${vrmUrl}`;
}

/**
 * Full-screen overlay (pointer-events none); WebGPU canvas when supported, else WebGL fallback (COMPANION-002).
 */
export function CompanionLayer({
  childId,
  companion,
  toggledOff,
  mode = "full",
  karaokeActive = false,
  companionEvents = [],
  companionCommands = [],
  activeNodeScreen = null,
  analyserNodeRef: analyserNodeRefProp,
  speechBubbleText,
  micMuted = false,
  onToggleMute,
}: CompanionLayerProps) {
  const fallbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const analyserNodeRef = analyserNodeRefProp ?? fallbackAnalyserRef;

  const micMutedRef = useRef(micMuted);
  const modeRef = useRef(mode);
  useLayoutEffect(() => {
    micMutedRef.current = micMuted;
    modeRef.current = mode;
  }, [micMuted, mode]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const toggledOffRef = useRef(toggledOff);
  /** Head bone world position sampled at VRM load; used for portrait camera framing. */
  const portraitHeadPosRef = useRef<THREE.Vector3 | null>(null);

  const motorRef = useRef<CompanionMotor | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer | null>(null);

  const companionEventsRef = useRef<CompanionEventPayload[]>(companionEvents);
  const childIdRef = useRef<string | null>(childId);
  const companionRef = useRef<CompanionConfig | null>(companion);
  const activeNodeScreenRef = useRef(activeNodeScreen);
  useLayoutEffect(() => {
    companionEventsRef.current = companionEvents;
    toggledOffRef.current = toggledOff;
    childIdRef.current = childId;
    companionRef.current = companion;
    activeNodeScreenRef.current = activeNodeScreen;
  }, [companionEvents, toggledOff, childId, companion, activeNodeScreen]);

  useLayoutEffect(() => {
    motorRef.current?.processCompanionCommands(
      companionCommands,
      childId,
      companionRef.current,
    );
  }, [companionCommands, childId, companion]);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    const motor = motorRef.current;
    if (!mount || !motor?.hasVrm()) return;
    const w = Math.floor(mount.clientWidth || 1);
    const h = Math.floor(mount.clientHeight || 1);
    motor.syncCameraToMount(w, h);
  }, [karaokeActive]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const timer =
      timerRef.current ??
      (() => {
        const t = new THREE.Timer();
        if (typeof document !== "undefined") {
          t.connect(document);
        }
        return t;
      })();
    timerRef.current = timer;

    let tickCount = 0;
    const tick = (time: number) => {
      const motor = motorRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!motor?.hasVrm() || !scene || !camera || !renderer) {
        rafRef.current = null;
        return;
      }
      if (toggledOffRef.current) {
        rafRef.current = null;
        return;
      }
      tickCount += 1;
      if (tickCount % 90 === 0) {
        console.log("companionEvents:", companionEventsRef.current);
      }
      timer.update(time);
      const dt = timer.getDelta();
      /** Cap so RAF gaps / loop restarts do not burn a whole reaction in one tick. */
      const dtMs = Math.min(dt * 1000, 100);
      motor.tick({
        dt,
        dtMs,
        companionEvents: companionEventsRef.current,
        companion: companionRef.current,
        childId: childIdRef.current,
        toggledOff: toggledOffRef.current || micMutedRef.current,
        activeNodeScreen: activeNodeScreenRef.current,
        analyser: analyserNodeRef.current,
      });
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop, analyserNodeRef]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      wrap.style.display = toggledOff ? "none" : "block";
    }
    if (toggledOff) {
      stopLoop();
    } else if (motorRef.current?.hasVrm()) {
      startLoop();
    }
  }, [toggledOff, startLoop, stopLoop]);

  /** New events must be visible to RAF tick immediately (ref sync alone can lag one frame vs WS). */
  useLayoutEffect(() => {
    if (toggledOffRef.current || !motorRef.current?.hasVrm()) return;
    startLoop();
  }, [companionEvents, companionCommands, startLoop]);

  useEffect(() => {
    if (!childId || !companion) {
      stopLoop();
      const r = rendererRef.current;
      const s = sceneRef.current;
      motorRef.current?.dispose();
      motorRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      if (r) {
        const canvas = r.domElement;
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        r.dispose();
      }
      if (s) {
        s.clear();
      }
      return;
    }

    const mount = mountRef.current;
    if (!mount) {
      console.error("CompanionLayer: [effect] mountRef.current is null — skip Three setup");
      return;
    }

    let cancelled = false;
    portraitHeadPosRef.current = null;
    stopLoop();

    const readMountSize = () => {
      const rawW = Math.floor(mountRef.current?.clientWidth ?? 0);
      const rawH = Math.floor(mountRef.current?.clientHeight ?? 0);
      const w = rawW > 0 ? rawW : 1;
      const h = rawH > 0 ? rawH : 1;
      return { w, h };
    };

    const applyPortraitCamera = (cam: THREE.PerspectiveCamera, headPos: THREE.Vector3) => {
      // ─── Portrait framing knobs ───────────────────────────────────────────
      // headPos is the skull-base bone in world space (from vrm.humanoid).
      //
      // CAMERA Z-OFFSET (distance in front of face, metres)
      //   Smaller → zoom in (tighter face crop)
      //   Larger  → zoom out (more body visible)
      const zOffset = 0.65;

      // CAMERA Y-OFFSET (vertical shift of camera body relative to head bone)
      //   More negative → camera lower  → slight upward look angle
      //   Less negative → camera higher → more level / slight downward angle
      const camYOffset = -0.02;

      // LOOK-AT Y-OFFSET (point the camera aims at, relative to head bone)
      //   More negative → aim lower (chin/neck) → head moves toward top of frame
      //   Less negative → aim higher (eyes/forehead) → head moves toward bottom
      const lookAtYOffset = -0.04;

      // FOV (degrees) — affects how much is visible at the given distance
      //   Lower → telephoto / tighter  |  Higher → wider / more context
      const fov = 28;
      // ─────────────────────────────────────────────────────────────────────

      cam.position.set(headPos.x, headPos.y + camYOffset, headPos.z + zOffset);
      cam.fov = fov;
      cam.aspect = 1; // portrait container is always 1:1
      cam.updateProjectionMatrix();
      cam.lookAt(headPos.x, headPos.y + lookAtYOffset, headPos.z);
    };

    const syncRendererToMount = (reason: string) => {
      const cam = cameraRef.current;
      const ren = rendererRef.current;
      const motor = motorRef.current;
      if (!cam || !ren || cancelled) return;
      const { w, h } = readMountSize();
      ren.setSize(w, h);
      const headPos = portraitHeadPosRef.current;
      if (modeRef.current === "portrait" && headPos) {
        applyPortraitCamera(cam, headPos);
      } else {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        if (motor?.hasVrm()) {
          motor.syncCameraToMount(w, h);
        }
      }
      console.log("CompanionLayer: [sync]", reason, { w, h, aspect: cam.aspect });
    };

    const motor = new CompanionMotor();
    motorRef.current = motor;
    motor.resetSessionState();
    console.log("CompanionLayer: [effect] building scene for child", childId);
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const { w: cw0, h: ch0 } = readMountSize();
    const camera = new THREE.PerspectiveCamera(22, cw0 / ch0, 0.05, 50);
    camera.position.set(0, 1, -3);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;
    motor.setCamera(camera);
    console.log("CompanionLayer: [effect] scene + camera ready", {
      aspect: camera.aspect,
      mountCss: {
        w: mountRef.current?.clientWidth ?? 0,
        h: mountRef.current?.clientHeight ?? 0,
      },
      usedSize: { w: cw0, h: ch0 },
    });

    const finishSetup = (renderer: CompanionRenderer, webgpuMaterials: boolean) => {
      console.log("CompanionLayer: [finishSetup] enter", { webgpuMaterials, cancelled });
      if (cancelled) {
        console.log("CompanionLayer: [finishSetup] cancelled, disposing renderer");
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;

      const canvas = renderer.domElement;
      canvas.style.zIndex = "10";
      canvas.style.pointerEvents = "none";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      console.log("CompanionLayer: [finishSetup] canvas styled (already in DOM)");

      const amb = new THREE.AmbientLight(0xffffff, 0.62);
      const dir = new THREE.DirectionalLight(0xffffff, 0.88);
      dir.position.set(1.2, 2.2, 0.8);
      scene.add(amb, dir);
      console.log("CompanionLayer: [finishSetup] lights added, loading VRM...");

      const modelUrl = resolveModelUrl(companion.vrmUrl);
      console.log("CompanionLayer: [finishSetup] calling loadCompanionVrm", modelUrl, {
        webgpu: webgpuMaterials,
      });
      loadCompanionVrm(modelUrl, { webgpu: webgpuMaterials })
      .then((vrm) => {
        if (cancelled) {
          vrm.scene.removeFromParent();
          return;
        }
        const { w: mw, h: mh } = readMountSize();
        motor.attachVrm(vrm, scene, mw, mh);

        if (modeRef.current === "portrait") {
          // Sample head bone world position for accurate face+shoulders framing.
          // Bounding-box fraction math is unreliable for tight close-ups.
          const getNormBone = vrm.humanoid?.getNormalizedBoneNode;
          const headBone =
            typeof getNormBone === "function"
              ? getNormBone.call(vrm.humanoid, "head")
              : null;
          if (headBone) {
            const headPos = new THREE.Vector3();
            headBone.getWorldPosition(headPos);
            portraitHeadPosRef.current = headPos;
          }
        }

        syncRendererToMount("after VRM load");
        requestAnimationFrame(() => syncRendererToMount("rAF1 post VRM"));
        requestAnimationFrame(() =>
          requestAnimationFrame(() => syncRendererToMount("rAF2 post VRM")),
        );

        console.log("CompanionLayer: [VRM] loaded, starting loop if visible");
        if (!toggledOffRef.current) {
          startLoop();
        }
      })
      .catch((err: unknown) => {
        console.error("CompanionLayer: failed to load or validate VRM —", err);
      });
    };

    const onResize = () => {
      syncRendererToMount("window resize");
    };
    window.addEventListener("resize", onResize);

    let mountResizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      mountResizeObserver = new ResizeObserver(() => {
        syncRendererToMount("mount ResizeObserver");
      });
      mountResizeObserver.observe(mount);
    }

    void (async () => {
      console.log("CompanionLayer: [init] async renderer setup started");
      if (cancelled) {
        console.log("CompanionLayer: [init] aborted (cancelled before create)");
        return;
      }

      let renderer: CompanionRenderer | undefined;
      let webgpuAttempt: WebGPURenderer | undefined;

      try {
        console.log("CompanionLayer: [init] constructing WebGPURenderer...");
        webgpuAttempt = new WebGPURenderer({ antialias: true });
        console.log("CompanionLayer: [init] awaiting webgpuAttempt.init()...");
        await webgpuAttempt.init();
        console.log("CompanionLayer: [init] WebGPURenderer init() succeeded");
        renderer = webgpuAttempt;
      } catch (e: unknown) {
        console.error("WebGPU failed, falling back:", e);
        if (webgpuAttempt) {
          try {
            webgpuAttempt.dispose();
          } catch (disposeErr: unknown) {
            console.error("CompanionLayer: [init] WebGPU dispose after failure:", disposeErr);
          }
        }
        console.log("CompanionLayer: [init] constructing THREE.WebGLRenderer fallback...");
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        console.log("CompanionLayer: [init] WebGLRenderer constructed");
      }

      if (cancelled || !renderer) {
        console.log("CompanionLayer: [init] stop after create", { cancelled, hasRenderer: Boolean(renderer) });
        renderer?.dispose();
        return;
      }

      if (!mount) {
        console.error("CompanionLayer: [init] mount ref missing, cannot append canvas");
        renderer.dispose();
        return;
      }

      const { w: iw, h: ih } = readMountSize();
      renderer.setSize(iw, ih);
      renderer.setClearColor(0x000000, 0);
      console.log("CompanionLayer: [init] setClearColor(0x000000, 0)");

      const pr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
      renderer.setPixelRatio(pr);
      console.log("CompanionLayer: [init] setPixelRatio", pr);

      mount.appendChild(renderer.domElement);
      console.log("Renderer canvas appended");

      syncRendererToMount("post-append");
      requestAnimationFrame(() => syncRendererToMount("rAF1 post-append"));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => syncRendererToMount("rAF2 post-append")),
      );

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (!isWebGpuRenderer(renderer)) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }

      const webgpuMaterials = isWebGpuRenderer(renderer);
      console.log("CompanionLayer: [init] material pipeline", webgpuMaterials ? "WebGPU (MToonNode)" : "WebGL (classic MToon)");
      finishSetup(renderer, webgpuMaterials);
    })();

    return () => {
      cancelled = true;
      mountResizeObserver?.disconnect();
      window.removeEventListener("resize", onResize);
      stopLoop();
      motor.dispose();
      motorRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      if (rendererRef.current) {
        const c = rendererRef.current.domElement;
        if (c.parentNode) {
          c.parentNode.removeChild(c);
        }
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [childId, companion?.vrmUrl, mode, startLoop, stopLoop]);

  if (!childId || !companion) {
    return null;
  }

  if (mode === "portrait") {
    return (
      <div
        data-testid="companion-portrait"
        ref={wrapRef}
        onClick={() => onToggleMute?.()}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 120,
          height: 120,
          borderRadius: "50%",
          overflow: "hidden",
          zIndex: 9999,
          cursor: "pointer",
        }}
      >
        <div
          ref={mountRef}
          style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        />
        {micMuted && (
          <div
            data-testid="companion-muted-overlay"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            🔇
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[15]"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {speechBubbleText ? (
        <div
          style={{
            position: "fixed",
            bottom: karaokeActive ? "22vh" : "min(68vh, calc(10vh + min(56vh, 85%) + 8px))",
            right: karaokeActive ? 20 : "max(2vw, 12px)",
            maxWidth: 260,
            padding: "10px 14px",
            borderRadius: 14,
            background: "rgba(15,23,42,0.88)",
            color: "#f8fafc",
            fontSize: 14,
            lineHeight: 1.35,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            zIndex: 16,
          }}
        >
          {speechBubbleText}
        </div>
      ) : null}
      <div
        ref={mountRef}
        className="pointer-events-none overflow-hidden"
        style={{
          position: "fixed",
          width: "min(28vw, 40%)",
          height: "min(56vh, 85%)",
          bottom: karaokeActive ? 12 : "10vh",
          right: karaokeActive ? 12 : "2vw",
          zIndex: 15,
          transform: karaokeActive ? "scale(0.2)" : undefined,
          transformOrigin: karaokeActive ? "bottom right" : undefined,
        }}
      />
    </div>
  );
}
```
## Raw source: src/server/session-manager.ts

_Trim note: File has 2033 lines. Included: (1) full module imports lines 1–164, (2) module exports `tryPushCreatorDiagReadingKaraoke` through `SessionManagerOptions` lines 268–322, (3) `SessionManager` class opening through `private ctx` declaration lines 324–505, (4) `receiveScreenshot` through `playbackDone` 964–1173, (5) `runCompanionResponse` + `buildAgentToolkit` 1545–1619, (6) `applyClientToolCall` + `handleToolCall` 1844–1860. **Omitted:** constructor body, all other private methods, `receiveReadingProgress`, `end()`, Deepgram, `handleEndOfTurn`, worksheet internals, etc. **No `node_result` / map `applyNodeResult` in this file** — those live in `map-coordinator.ts` + `routes.ts`._

```ts
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import type { WebSocket } from "ws";
import {
  getCompanionConfig,
  type ChildName,
  type CompanionConfig,
} from "../companions/loader";
import {
  getTtsNameForChildId,
  getTtsNameForSessionChild,
} from "../profiles/childrenConfig";
import { CHARLOTTE_DIAG_DEFAULT_VOICE_ID } from "../diag-voices";
import { generateStoryImage } from "../utils/generateStoryImage";
import {
  DEMO_MODE_PROMPT,
  HOMEWORK_MODE_PROMPT,
  TEST_MODE_PROMPT,
  buildDebugPrompt,
  buildSessionPrompt,
  extractWordsFromHomework,
  normalizeSessionSubject,
} from "../agents/prompts";
import { loadHomeworkPayload } from "../utils/loadHomeworkFolder";
import { getReadingCanvasPreferencesForChild } from "../utils/learningProfileIO";
import { appendDeferredActivity } from "../utils/appendToContext";
import { classifyAndRoute } from "../agents/classifier/classifier";
import { recordSession } from "../agents/slp-recorder/recorder";
import { connectFlux, type FluxHandle } from "../deepgram-turn";
import {
  checkUserGoodbye,
  checkAssistantGoodbye,
  startMaxDurationTimer,
  getRewardDurations,
} from "./session-triggers";
import { WsTtsBridge } from "./ws-tts-bridge";
import { appendRewardLog } from "../agents/elli/tools/logReward";
import { mathProblem, resetMathProbeSession } from "../agents/elli/tools/mathProblem";
import { resetSessionStart } from "../agents/elli/tools/startSession";
import { resetTransitionToWork } from "../agents/elli/tools/transitionToWork";
import {
  planSession,
  recordAttempt,
  finalizeSession,
  childIdFromName,
} from "../engine/learningEngine";
import { computeProgression } from "../engine/progression";
import { finalizeClockSession } from "../engine/clockTracker";
import { computeQualityFromAttempt } from "../algorithms/spacedRepetition";
import type { AttemptInput, ScaffoldLevel } from "../algorithms/types";
import { type ModelMessage } from "ai";
import {
  extractHomeworkProblems,
  type HomeworkExtractionResult,
} from "../agents/psychologist/psychologist";
import { GameBridge } from "./game-bridge";
import {
  getReward,
  getTool,
  REWARD_GAMES,
  TEACHING_TOOLS,
} from "./games/registry";
import { resolveLaunchGameRequest } from "./games/resolveLaunchGameRequest";
import { TurnStateMachine } from "./session-state";
import {
  type ActivityMode,
  type ActivityPauseState,
  type CanvasOwner,
  type CanvasState,
  type SessionContext,
  createSessionContext,
  buildCanvasContextMessage,
  type WordScaffoldSessionState,
} from "./session-context";
import {
  CANONICAL_AGENT_TOOL_KEYS,
  getSessionTypeConfig,
  resolveSessionType,
  sessionTypeFromSubject,
} from "./session-type-registry";
import {
  buildAssignmentManifestFromWorksheetProblems,
  buildWorksheetPlayerState,
  detectWorksheetInteractionMode,
  resumeAssignmentProblem,
  type AssignmentManifest,
  type WorksheetInteractionMode,
  type WorksheetPlayerState,
} from "./assignment-player";
import {
  validateProblem,
  type CanonicalWorksheetProblem,
} from "./worksheet-problem";
import {
  clearEarnedReward,
  createWorksheetSession as createWSSession,
  saveEarnedReward,
  type WorksheetSession,
} from "./worksheet-tools";
import { createLaunchGameTool } from "../agents/elli/tools/worksheetTools";
import { createCompanionActTool } from "../agents/tools/companionAct";
import { createSixTools } from "../agents/tools/six-tools";
import {
  buildLaunchGameTool,
  SC_ALREADY_ACTIVE,
  WB_ALREADY_ACTIVE,
} from "../agents/elli/tools/launchGame";
import { createTakeGameScreenshotTool } from "../agents/elli/tools/takeGameScreenshot";
import {
  dateTime,
  formatDateTimeEastern,
} from "../agents/elli/tools/dateTime";
import { buildWorksheetToolPrompt } from "../agents/prompts/worksheetSessionPrompt";
import { appendWorksheetAttemptLine, appendAttemptLine } from "../utils/attempts";
import {
  isDebugClaude,
  isDemoMode,
  isHomeworkMode,
  isSunnyTestMode,
  shouldPersistSessionData,
} from "../utils/runtimeMode";
import { readRasterDimensionsFromFile } from "../utils/rasterDimensions";
import {
  REWARD_CHARACTER_SVG,
  generateCanvasCapabilitiesManifest,
} from "./canvas/registry";
import { canvasStatePersistsThroughBargeIn } from "../shared/canvasRenderability";
import { generateToolDocs } from "../agents/elli/tools/generateToolDocs";
import { auditLog, ttsLogLabel } from "./audit-log";
import {
  createSpellingHomeworkGate,
  type SpellingHomeworkGate,
} from "./spelling-homework-gate";
import { sessionEventBus } from "./session-event-bus";
import {
  registerActiveVoiceSession,
  unregisterActiveVoiceSessionIfCurrent,
} from "./voice-session-registry";
import { RewardEngine } from "./reward-engine";
import {
  ServerCompanionBridge,
  markSessionAsPreview,
  clearPreviewSession,
} from "./companion-bridge";
import * as gev from "./game-event-handler";
import { unwrapToolResult } from "./unwrapToolResult";
import { runHandleToolCall } from "./tool-call-router";
import { runSessionStart } from "./session-bootstrap";
import { runCompanionResponseForSession } from "./companion-response-runner";
import {
  hostCanvasClear,
  hostCanvasShow,
  hostCanvasStatus,
  hostSessionEnd,
  hostSessionLog,
  hostSessionStatus,
} from "./host-tool-handlers";
import {
  debugCreatorOpeningLineForSession,
  prependDebugClaudeDeveloperBlock,
} from "./debug-helpers";

/** Creator diag voice session — `POST /api/map/test-reading-mode` pushes karaoke here. */
let creatorDiagSessionForReadingTest: SessionManager | null = null;

export function tryPushCreatorDiagReadingKaraoke(
  text: string,
): { ok: true } | { ok: false; error: string } {
  const s = creatorDiagSessionForReadingTest;
  if (!s) return { ok: false, error: "no_active_creator_diag_voice_session" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "text_required" };
  const words = trimmed.split(/\s+/).filter(Boolean);
  s.applyClientToolCall("canvasShow", {
    type: "karaoke",
    storyText: trimmed,
    words,
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600",
  });
  return { ok: true };
}

const TEST_PRONUNCIATION_WORDS = [
  "blister",
  "carpet",
  "thirteen",
  "orbit",
  "harvest",
  "confirm",
  "interrupt",
  "perfume",
  "hamburger",
  "corner",
  "kindergarten",
  "chimp",
  "inhabit",
  "instruments",
  "band",
];

export function tryPushCreatorDiagPronunciation(): { ok: true } | { ok: false; error: string } {
  const s = creatorDiagSessionForReadingTest;
  if (!s) return { ok: false, error: "no_active_creator_diag_voice_session" };
  s.applyClientToolCall("canvasShow", {
    type: "pronunciation",
    pronunciationWords: TEST_PRONUNCIATION_WORDS,
  });
  return { ok: true };
}

/** Options passed from the client on `start_session` (see ws-handler). */
export type SessionManagerOptions = {
  silentTts?: boolean;
  /** No LLM / no server TTS — Deepgram STT only (e.g. diag reading kiosk). */
  sttOnly?: boolean;
};

export class SessionManager {
  /** When true, child speech is not sent to the companion (silent reward games). */
  public suppressTranscripts: boolean = false;

  private ws: WebSocket;
  private childName: ChildName;
  /** Phonetic / friendly name for strings sent to TTS (from children.config.json). */
  private readonly sessionTtsLabel: string;
  private companion: CompanionConfig;
  private conversationHistory: ModelMessage[] = [];
  private readonly options?: SessionManagerOptions;
  private ttsBridge: WsTtsBridge | null = null;
  private currentAbort: AbortController | null = null;
  private clearSessionTimer: (() => void) | null = null;
  private fluxHandle: FluxHandle | null = null;
  private isEnding = false;
  private sessionStartTime = 0;
  private roundNumber = 0;

  private readonly sessionId = randomUUID();
  private readonly rewardEngine = new RewardEngine();
  private readonly companionBridge = new ServerCompanionBridge();

  private lastTranscript = "";
  private lastTranscriptTime = 0;
  private lastEagerTranscript = "";
  private lastEagerTranscriptTime = 0;
  private speakingStartedAt = 0;
  private lastCanvasWasMath = false;
  private lastCanvasMode: string = "idle";
  /** Latest karaoke story body from canvasShow — used for optional story illustration after reading complete. */
  private lastKaraokeStoryText = "";
  /** While true, block canvasShow so the client can show the Grok illustration without karaoke redraw. */
  private storyImagePending = false;
  /** One automatic illustration per karaoke story; reset when story text changes. Explicit sessionLog generate_image always allowed. */
  private storyImageGeneratedThisStory = false;
  /** After reading_progress event=complete, allow STT through while karaoke canvas may still be visible. */
  private karaokeReadingComplete = false;
  /** Ensures event=complete triggers at most one companion turn per karaoke story. */
  private readingProgressCompleteConsumed = false;

  /** Karaoke on screen and reader has not finished (no reading_progress complete yet). */
  private karaokeReadingInProgress(): boolean {
    if ((this.currentCanvasState as { mode?: string } | null)?.mode !== "karaoke") {
      return false;
    }
    const rp = this.ctx?.readingProgress;
    if (!rp || rp.totalWords <= 0) return false;
    if (rp.event === "complete") return false;
    return rp.wordIndex < rp.totalWords;
  }

  /** Block a second canvasShow karaoke while the child is mid-story (after first word advance). */
  private shouldBlockKaraokeCanvasRefresh(): boolean {
    if ((this.currentCanvasState as { mode?: string } | null)?.mode !== "karaoke") {
      return false;
    }
    const rp = this.ctx?.readingProgress;
    if (!rp || rp.totalWords <= 0) return false;
    if (rp.event === "complete") return false;
    return rp.wordIndex > 0;
  }

  /**
   * Reading mode: child STT is for local word match only — do not run Claude per word.
   * Diag: suppress unless utterance looks like a command to the assistant.
   */
  private shouldSuppressTranscriptDuringKaraoke(transcript: string): boolean {
    const mode = (this.currentCanvasState as { mode?: string } | null)?.mode;
    if (mode !== "karaoke" || this.karaokeReadingComplete) return false;
    const st = this.ctx?.sessionType;
    if (st === "reading") {
      console.log("  📖 [reading] transcript suppressed during karaoke");
      return true;
    }
    if (st === "diag") {
      const t = transcript.trim();
      const words = t.split(/\s+/).filter(Boolean);
      const looksLikeCommand =
        t.includes("?") ||
        /^(hey|charlotte|stop|clear)\b/i.test(t) ||
        words.length > 8;
      if (!looksLikeCommand) {
        console.log("  📖 [diag-reading] transcript suppressed");
        return true;
      }
    }
    return false;
  }
  /** Server-canonical record of what is currently displayed on the canvas.
   *  Updated when the canvas changes; cleared on session end and when the client
   *  is reset to idle (barge-in only does that for ephemeral modes — worksheet/games persist).
   *  Injected into each user turn so the AI knows what's already on screen. */
  private currentCanvasState: Record<string, unknown> | null = null;
  private currentCanvasRevision = 0;
  private toolCallsMadeThisTurn = 0;
  private activeWord: string | null = null;
  private isSpellingSession = false;
  private sessionStartedToolCalled = false;
  private transitionedToWork = false;

  // ── Word Builder — server owns all round state ──────────────────────────
  private wbWord: string = "";
  private wbRound: number = 0;
  private wbActive: boolean = false;
  /** round_* iframe events while SPEAKING or PROCESSING — flushed after playback or agent step */
  private pendingRoundComplete: Record<string, unknown> | null = null;
  /** Hold agent TTS until browser posts `ready` for this canvas revision */
  private gamePendingRevision: number | null = null;
  /** When true, defer ttsBridge.finish + audio_done until canvas_done or game ready */
  private deferredTtsFinish = false;
  private gameTtsFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** Safety: exit Word Builder if no round activity for this long */
  private wbActivityTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Dedup duplicate iframe round_complete for the same round number */
  private wbLastProcessedRound = 0;
  /** After game_complete: block startWordBuilder until child spells wbWord (sessionLog). */
  private wbAwaitingSpell = false;
  /** Prevents two ok:true startWordBuilder executes in one agent step before handleToolCall runs. */
  private wbToolExecuteClaimed = false;
  /** Same for startSpellCheck / one step. */
  private spellCheckToolExecuteClaimed = false;
  // ────────────────────────────────────────────────────────────────────────

  // Legacy aliases kept for spell-check (different flow)
  private activeWordBuilderWord = "";
  private wordBuilderSessionActive = false;
  private activeSpellCheckWord = "";
  private spellCheckSessionActive = false;
  private activeWordContext: string = "";
  private wordAttemptCounts: Map<string, number> = new Map();
  private wordScaffoldState = new Map<string, WordScaffoldSessionState>();
  private pendingGameStart: PendingGameStart | null = null;

  private turnSM: TurnStateMachine;

  private readonly gameBridge = new GameBridge(
    (payload) => this.send("game_message", { forward: payload }),
    (voiceEnabled) => {
      this.suppressTranscripts = !voiceEnabled;
      console.log(`  🎮 Voice: ${voiceEnabled ? "active" : "silent"}`);
    },
  );

  /** Homework spelling list (normalized) — sessionStatus spellingWordsCompleted tracks words with sessionLog(word) */
  private spellingHomeworkWordsByNorm: string[] = [];
  private spellingHomeworkGate: SpellingHomeworkGate =
    createSpellingHomeworkGate([]);
  private spellingWordsWithAttempt = new Set<string>();
  private spaceInvadersRewardActive = false;
  private spaceInvadersRewardLaunched = false;

  /** Option C worksheet session — pure state, Claude calls tools */
  private worksheetSession: WorksheetSession | null = null;

  /** Worksheet mode — companion prompt + canvas context for assignment flow */
  private worksheetMode = false;
  private worksheetProblems: CanonicalWorksheetProblem[] = [];
  private assignmentManifest: AssignmentManifest | null = null;
  private worksheetPlayerState: WorksheetPlayerState | null = null;
  private worksheetInteractionMode: WorksheetInteractionMode = "answer_entry";
  private worksheetProblemIndex = 0;
  private worksheetRewardAfterN = 5;
  private worksheetSubjectLabel = "";
  /** Per-problem trusted/suspect cents and reveal eligibility — single source for pool + reveals. */
  /** Actual worksheet PDF/image bytes — pinned into conversation so the model sees the real worksheet */
  private worksheetPageFile: { data: Buffer; mimeType: string } | null = null;
  private activeCanvasActivity: {
    mode: ActivityMode;
    pauseState: ActivityPauseState;
    resumable: boolean;
    snapshot: CanvasActivitySnapshot | null;
    reason?: string;
  } = {
    mode: "none",
    pauseState: "active",
    resumable: false,
    snapshot: null,
  };

  /** Canonical session state — drives tool filtering, canvas ownership, context injection. */
  private ctx: SessionContext | null = null;

  receiveScreenshot(data: string | null): void {
    const p = this.screenshotPending;
    if (!p) return;
    clearTimeout(p.timer);
    this.screenshotPending = null;
    p.resolve(data);
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(
        JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      );
    }
  }

  private emitRewardAttempt(correct: boolean, word?: string, domain?: string): void {
    const cid = childIdFromName(this.childName);
    const ts = Date.now();
    if (correct) {
      sessionEventBus.fire({
        type: "correct_answer",
        childId: cid,
        sessionId: this.sessionId,
        data:
          word !== undefined
            ? { word, ...(domain !== undefined ? { domain } : {}) }
            : undefined,
        timestamp: ts,
      });
    } else {
      sessionEventBus.fire({
        type: "wrong_answer",
        childId: cid,
        sessionId: this.sessionId,
        data: word !== undefined ? { word } : undefined,
        timestamp: ts,
      });
    }
  }
  async start(): Promise<void> {
    await runSessionStart(this, {
      registerCreatorDiagReadingSession: (s) => {
        creatorDiagSessionForReadingTest = s as SessionManager;
      },
    });
  }

  /** Inject a transcript directly — used by test harness to bypass Deepgram */
  injectTranscript(text: string): void {
    this.handleEndOfTurn(text).catch(console.error);
  }

  private recordWorksheetAttempt(transcript: string, correct: boolean): void {
    if (!this.ctx?.assignment) return;
    this.ctx.assignment.attempts.push({
      questionIndex: this.worksheetProblemIndex,
      answer: transcript,
      correct,
      timestamp: new Date().toISOString(),
    });
  }

  private retireWorksheetSession(): void {
    this.worksheetMode = false;
    this.worksheetPlayerState = null;
    this.worksheetPageFile = null;
    this.currentCanvasState = null;
    this.clearActiveCanvasActivity();
    this.send("canvas_draw", { mode: "idle" });
    if (this.ctx) {
      const freeformConfig = getSessionTypeConfig("freeform");
      this.ctx.sessionType = "freeform";
      this.ctx.availableToolNames = Object.keys(freeformConfig.tools);
      this.ctx.canvas.owner = freeformConfig.canvasOwner;
      this.ctx.canvas.locked = false;
      if (this.ctx.assignment) {
        this.ctx.assignment.currentIndex = this.ctx.assignment.questions.length;
      }
      this.ctx.updateCanvas({
        mode: "idle",
        content: undefined,
        label: undefined,
        svg: undefined,
        sceneDescription: undefined,
        problemAnswer: undefined,
        problemHint: undefined,
        pdfAssetUrl: undefined,
        pdfPage: undefined,
        pdfPageWidth: undefined,
        pdfPageHeight: undefined,
        activeProblemId: undefined,
        activeFieldId: undefined,
        overlayFields: undefined,
        interactionMode: undefined,
      });
      this.broadcastContext();
    }
  }

  receiveWorksheetAnswer(payload: {
    problemId?: string;
    fieldId?: string;
    value?: string;
  }): void {
    const value = String(payload.value ?? "").trim();
    if (!value || !this.assignmentManifest || !this.worksheetPlayerState)
      return;
    if (
      payload.problemId &&
      String(payload.problemId) !== this.worksheetPlayerState.activeProblemId
    ) {
      console.warn(
        `  ⚠️  worksheet_answer ignored — stale problem ${String(payload.problemId)} vs ${this.worksheetPlayerState.activeProblemId}`,
      );
      return;
    }
    if (payload.fieldId) {
      this.worksheetPlayerState = {
        ...this.worksheetPlayerState,
        activeFieldId: String(payload.fieldId),
      };
    }
    this.send("echo_answer", { text: value });
    this.handleEndOfTurn(value).catch(console.error);
  }

  receiveAudio(pcm: Buffer): void {
    if (this.fluxHandle) {
      this.fluxHandle.sendAudio(pcm);
    }
  }

  bargeIn(): void {
    const ts = new Date().toISOString();
    console.log(`  🛑 [${ts}] Barge-in received`);

    this.pendingRoundComplete = null;
    gev.abortGameTtsGate(this);
    this.deferredTtsFinish = false;

    const stateBefore = this.turnSM.getState();
    this.turnSM.onInterrupt();
    auditLog("turn", {
      action: "barge_in",
      stateBefore,
      turnState: this.turnSM.getState(),
      tts: ttsLogLabel(),
      childName: this.childName,
      round: this.roundNumber,
    });

    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.stop();
    }

    this.send("audio_done");
    // Ephemeral assistant canvas (teaching SVG, etc.) is stale after interrupt.
    // Worksheet PDF, iframe games, word-builder, spell-check stay visible.
    if (!canvasStatePersistsThroughBargeIn(this.currentCanvasState)) {
      this.send("canvas_draw", { mode: "idle" });
    } else {
      const m = (this.currentCanvasState as { mode?: string } | null)?.mode;
      console.log(`  🛑 Barge-in — preserving canvas (mode=${m ?? "?"})`);
    }
  }

  flushPendingRoundComplete(): void {
    gev.flushPendingRoundCompleteForSession(this);
  }

  /** Iframe game events (word-builder fill-blanks) forwarded from the browser. */
  handleGameEvent(event: Record<string, unknown>, fromPendingFlush = false): void {
    gev.handleGameEventForSession(this, event, fromPendingFlush);
  }

  canvasDone(payload?: Record<string, unknown>): void {
    const revision = Number(payload?.canvasRevision);
    const resolvedRevision =
      Number.isFinite(revision) && revision > 0
        ? revision
        : this.currentCanvasRevision;
    if (this.ctx && resolvedRevision > 0) {
      this.ctx.markCanvasRendered(resolvedRevision);
      console.log(
        `  🖼️  Browser confirmed canvas revision ${resolvedRevision} (${this.ctx.canvas.current.mode})`,
      );
      this.broadcastContext();
    }
    this.turnSM.onCanvasDone();
    void gev.tryCompleteTtsTurnAsync(this);
  }

  playbackDone(): void {
    this.turnSM.onPlaybackComplete();
    this.flushPendingRoundComplete();
    const pending = this.turnSM.consumePendingTranscript();
    if (pending) {
      void this.handleEndOfTurn(pending, true);
    }
  }

  private async runCompanionResponse(userMessage: string): Promise<void> {
    await runCompanionResponseForSession(this, userMessage);
  }

  private buildAgentToolkit(): Record<string, unknown> {
    const six = createSixTools({
      canvasShow: (a) => this.hostCanvasShow(a),
      canvasClear: () => this.hostCanvasClear(),
      canvasStatus: () => this.hostCanvasStatus(),
      sessionLog: (a) => this.hostSessionLog(a),
      sessionStatus: () => this.hostSessionStatus(),
      sessionEnd: (a) => this.hostSessionEnd(a),
      expressCompanion: (a) => this.companionBridge.expressCompanion(a),
    });
    const companionActTool = createCompanionActTool({
      companionAct: (a) => this.companionBridge.companionAct(a),
    });
    const baseTools = { ...six, companionAct: companionActTool };
    const screenshotTools = {
      takeGameScreenshot: createTakeGameScreenshotTool(this),
    };
    if (this.worksheetSession && this.worksheetMode) {
      return {
        ...baseTools,
        launchGame: createLaunchGameTool(this.worksheetSession),
        dateTime,
        ...screenshotTools,
      };
    }
    const launchGameKaraokeGuard = {
      blockDuringKaraokeReading: () => this.karaokeReadingInProgress(),
    };
    if (this.ctx?.sessionType === "math") {
      return {
        ...baseTools,
        mathProblem,
        launchGame: buildLaunchGameTool(undefined, launchGameKaraokeGuard),
        dateTime,
        ...screenshotTools,
      };
    }
    if (this.isSpellingSession) {
      return {
        ...baseTools,
        launchGame: buildLaunchGameTool(
          {
            isWordBuilderSessionActive: () => this.wordBuilderSessionActive,
            tryClaimWordBuilderToolSlot: () => {
              if (this.wbToolExecuteClaimed) return false;
              this.wbToolExecuteClaimed = true;
              return true;
            },
            isSpellCheckSessionActive: () => this.spellCheckSessionActive,
            tryClaimSpellCheckToolSlot: () => {
              if (this.spellCheckToolExecuteClaimed) return false;
              this.spellCheckToolExecuteClaimed = true;
              return true;
            },
            isHomeworkSpellingWordAllowed: (w) => this.spellingHomeworkGate.allows(w),
            getHomeworkSpellingRejectMessage: (w) =>
              this.spellingHomeworkGate.explainReject(w),
          },
          launchGameKaraokeGuard,
        ),
        dateTime,
        ...screenshotTools,
      };
    }
    return {
      ...baseTools,
      launchGame: buildLaunchGameTool(undefined, launchGameKaraokeGuard),
      dateTime,
      ...screenshotTools,
    };
  }

  /** Browser test overlay — run tool handler and push canvas_draw. */
  applyClientToolCall(tool: string, args: Record<string, unknown>): void {
    const t = this.normalizeToolName(tool);
    this.handleToolCall(t, args, {});
    if (t === "canvasShow" && this.currentCanvasState) {
      const payload = { ...this.currentCanvasState };
      this.send("canvas_draw", this.withCanvasRevision(payload));
    }
  }

  handleToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: unknown,
  ): void {
    runHandleToolCall(this, tool, args, result);
  }
```
## Raw source: src/agents/tools/six-tools.ts

_Trim note: File has 432 lines. `companionAct` tool schema lives in `src/agents/tools/companionAct.ts`, not here. Included: lines 1–17 (imports + `SixToolsHost` through `expressCompanion` method) and lines 405–432 (`expressCompanion` tool definition). Omitted: `canvasShow` schema and other tools._

```ts
import { tool } from "ai";
import { z } from "zod";
import { REWARD_CHARACTER_SVG } from "../../server/canvas/registry";
import { COMPANION_EMOTES } from "../../shared/companionEmotes";

/** Implemented by SessionManager (or test harness). */
export interface SixToolsHost {
  canvasShow(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  canvasClear(): Promise<Record<string, unknown>>;
  canvasStatus(): Promise<Record<string, unknown>>;
  sessionLog(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  sessionStatus(): Promise<Record<string, unknown>>;
  sessionEnd(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  expressCompanion(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

    sessionEnd: tool({
      description:
        "End the session only when the child or parent says exactly 'end session' or 'end the session'.",
      inputSchema: z.object({
        childName: z.string(),
        reason: z.enum(["child_requested", "session_complete", "goodbye"]),
      }),
      execute: async (args) => host.sessionEnd(args as Record<string, unknown>),
    }),
    expressCompanion: tool({
      description:
        "Make the companion react expressively. Use to show emotion intentionally alongside speech. Never describe emotion in words — show it through Elli's body and face.",
      inputSchema: z.object({
        emote: companionEmoteSchema.describe(
          "Facial/body expression to show on the companion.",
        ),
        intensity: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Expression strength 0–1; default 0.8."),
      }),
      execute: async (args) =>
        host.expressCompanion(args as Record<string, unknown>),
    }),
  } as const;
}
```
## Directory: src/scripts/

```text
total 352
drwxr-xr-x  22 jamaltaylor  staff    704 Apr 22 21:50 .
drwxr-xr-x  42 jamaltaylor  staff   1344 Apr 23 12:56 ..
-rw-r--r--   1 jamaltaylor  staff    531 Mar 22 18:58 canvas-test-presets.ts
-rw-r--r--   1 jamaltaylor  staff   8450 Apr 12 13:25 compare-branches.ts
-rw-r--r--   1 jamaltaylor  staff   1421 Mar 14 16:44 convert-pdfs-to-txt.ts
-rw-r--r--   1 jamaltaylor  staff   4274 Apr 19 23:18 diag-dry-run.ts
-rw-r--r--   1 jamaltaylor  staff  21593 Apr 22 10:45 generateGame.ts
-rw-r--r--   1 jamaltaylor  staff   3688 Apr 21 11:36 goLivePreview.ts
-rw-r--r--   1 jamaltaylor  staff   6322 Apr 22 21:42 homeworkPlanner.ts
-rw-r--r--   1 jamaltaylor  staff  20231 Apr 22 23:13 ingestHomework.ts
-rw-r--r--   1 jamaltaylor  staff  12833 Apr 23 11:51 ingestScanResult.ts
-rw-r--r--   1 jamaltaylor  staff   4752 Apr 20 11:24 ingestTutoring.ts
-rw-r--r--   1 jamaltaylor  staff   4690 Mar 19 18:43 launch-kiosk.ts
-rw-r--r--   1 jamaltaylor  staff   5181 Apr  6 11:59 migrateLogsToWordBank.ts
-rw-r--r--   1 jamaltaylor  staff   3819 Apr 21 11:36 previewHomework.ts
-rw-r--r--   1 jamaltaylor  staff   2949 Apr 12 13:25 run-comparison.md
-rw-r--r--   1 jamaltaylor  staff    976 Apr 22 23:13 sync.ts
-rw-r--r--   1 jamaltaylor  staff   3982 Mar 22 18:58 test-canvas.ts
-rw-r--r--   1 jamaltaylor  staff   1872 Mar 11 20:19 test-latency.ts
-rw-r--r--   1 jamaltaylor  staff  20553 Apr 19 11:25 test-pipeline.ts
-rw-r--r--   1 jamaltaylor  staff    390 Mar 11 20:36 test-psychologist.ts
-rw-r--r--   1 jamaltaylor  staff   2234 Apr 20 23:04 validateGeneratedGame.ts

```
## Directory: src/shared/companions/

```text
total 40
drwxr-xr-x   7 jamaltaylor  staff   224 Apr 13 20:12 .
drwxr-xr-x  23 jamaltaylor  staff   736 Apr 23 09:40 ..
-rw-r--r--   1 jamaltaylor  staff  2087 Apr 21 13:11 companionAnimateBridge.ts
-rw-r--r--   1 jamaltaylor  staff  4383 Apr 22 17:10 companionContract.ts
-rw-r--r--   1 jamaltaylor  staff  1971 Apr 15 17:24 generateCompanionCapabilities.ts
drwxr-xr-x   7 jamaltaylor  staff   224 Apr 13 19:47 registry
-rw-r--r--   1 jamaltaylor  staff  1549 Apr 13 20:09 validateCompanionCommand.ts

```
## Directory: assets/

```text
DIRECTORY NOT FOUND
```
## Directory: assets/animations/

```text
DIRECTORY NOT FOUND (parent `assets/` missing)
```
## Directory: web/public/animations/

```text
total 20400
drwxr-xr-x   8 jamaltaylor  staff      256 Apr 15 17:03 .
drwxr-xr-x  12 jamaltaylor  staff      384 Apr 19 14:30 ..
-rw-r--r--   1 jamaltaylor  staff      731 Apr 17 16:02 README.md
-rw-r--r--@  1 jamaltaylor  staff  2017760 Apr 15 18:03 dance_victory.fbx
-rw-r--r--@  1 jamaltaylor  staff  2580816 Apr 15 18:03 idle.fbx
-rw-r--r--@  1 jamaltaylor  staff  1893456 Apr 15 18:03 shrug.fbx
-rw-r--r--@  1 jamaltaylor  staff  2108784 Apr 15 18:03 think.fbx
-rw-r--r--@  1 jamaltaylor  staff  1827760 Apr 15 18:03 wave.fbx

```
## Directory: src/server/games/

```text
total 24
drwxr-xr-x   5 jamaltaylor  staff   160 Apr  6 11:59 .
drwxr-xr-x  37 jamaltaylor  staff  1184 Apr 23 09:38 ..
-rw-r--r--   1 jamaltaylor  staff   523 Mar 25 08:25 registry.ts
-rw-r--r--   1 jamaltaylor  staff  2561 Apr 19 11:25 registryDiscover.ts
-rw-r--r--   1 jamaltaylor  staff  1927 Apr 19 11:25 resolveLaunchGameRequest.ts

```
## Grep: companionEmotes | CompanionEmote | EMOTES (src/, web/src/)

```text
src//tests/test-companion-types.ts:4:import { isCompanionEmote } from "../shared/companionEmotes";
src//tests/test-companion-types.ts:96:  it("isCompanionEmote accepts expressCompanion enum and rejects unknown", () => {
src//tests/test-companion-types.ts:97:    expect(isCompanionEmote("happy")).toBe(true);
src//tests/test-companion-types.ts:98:    expect(isCompanionEmote("celebrating")).toBe(true);
src//tests/test-companion-types.ts:99:    expect(isCompanionEmote("angry")).toBe(false);
src//tests/test-companion-types.ts:100:    expect(isCompanionEmote(null)).toBe(false);
src//agents/tools/six-tools.ts:4:import { COMPANION_EMOTES } from "../../shared/companionEmotes";
src//agents/tools/six-tools.ts:19:const companionEmoteSchema = z.enum(COMPANION_EMOTES);
src//server/routes.ts:14:  broadcastTestMapCompanionEmote,
src//server/routes.ts:768:      const out = broadcastTestMapCompanionEmote(childId, emoteRaw.trim(), intensity);
src//server/companion-bridge.ts:6:import { isCompanionEmote } from "../shared/companionEmotes";
src//server/companion-bridge.ts:99:    if (!isCompanionEmote(emoteRaw)) {
src//server/map-coordinator.ts:28:import { isCompanionEmote } from "../shared/companionEmotes";
src//server/map-coordinator.ts:428:export function broadcastTestMapCompanionEmote(
src//server/map-coordinator.ts:441:  if (!isCompanionEmote(emoteRaw)) {
src//shared/companionEmotes.ts:6:export const COMPANION_EMOTES = [
src//shared/companionEmotes.ts:16:export type CompanionEmote = (typeof COMPANION_EMOTES)[number];
src//shared/companionEmotes.ts:18:const EMOTE_SET = new Set<string>(COMPANION_EMOTES);
src//shared/companionEmotes.ts:20:export function isCompanionEmote(v: unknown): v is CompanionEmote {
src//shared/companions/companionAnimateBridge.ts:5:import type { CompanionEmote } from "../companionEmotes";
src//shared/companions/companionAnimateBridge.ts:23:export function mapAnimationToEmote(animation: string): CompanionEmote | null {
src//shared/companions/registry/emote.capability.ts:2:import { COMPANION_EMOTES } from "../../companionEmotes";
src//shared/companions/registry/emote.capability.ts:7:    emote: z.enum(COMPANION_EMOTES),
src//shared/companions/registry/emote.capability.ts:31:      options: [...COMPANION_EMOTES],
src//shared/companionTypes.ts:6:import type { CompanionEmote } from "./companionEmotes";
src//shared/companionTypes.ts:8:export type { CompanionEmote } from "./companionEmotes";
src//shared/companionTypes.ts:43:  emote?: CompanionEmote;
web/src//utils/companionExpressions.ts:9:  type CompanionEmote,
web/src//utils/companionExpressions.ts:10:  isCompanionEmote,
web/src//utils/companionExpressions.ts:11:} from "../../../src/shared/companionEmotes";
web/src//utils/companionExpressions.ts:203:  emote: CompanionEmote,
web/src//utils/companionExpressions.ts:417:): Array<{ emote: CompanionEmote; intensity: number }> {
web/src//utils/companionExpressions.ts:419:  const out: Array<{ emote: CompanionEmote; intensity: number }> = [];
web/src//utils/companionExpressions.ts:422:    if (!p.emote || !isCompanionEmote(p.emote)) continue;
web/src//components/DiagPanel.tsx:3:  COMPANION_EMOTES,
web/src//components/DiagPanel.tsx:4:  type CompanionEmote,
web/src//components/DiagPanel.tsx:5:} from "../../../src/shared/companionEmotes";
web/src//components/DiagPanel.tsx:116:  const [emote, setEmote] = useState<CompanionEmote>("neutral");
web/src//components/DiagPanel.tsx:177:          onChange={(e) => setEmote(e.target.value as CompanionEmote)}
web/src//components/DiagPanel.tsx:179:          {COMPANION_EMOTES.map((e) => (
web/src//hooks/useMapSession.ts:10:import { isCompanionEmote } from "../../../src/shared/companionEmotes";
web/src//hooks/useMapSession.ts:28:  const hasEmote = isCompanionEmote(pl.emote);
web/src//companion/CompanionMotor.ts:13:import { isCompanionEmote } from "../../../src/shared/companionEmotes";
web/src//companion/CompanionMotor.ts:331:        if (isCompanionEmote(em)) {
web/src//companion/CompanionMotor.ts:481:    if (em && isCompanionEmote(em)) {

```
## Grep: expressCompanion | companionAct (src/, web/src/)

```text
src//tests/test-six-tools.ts:5:import { createCompanionActTool } from "../agents/tools/companionAct";
src//tests/test-six-tools.ts:68:  it("expressCompanion tool executes against host", async () => {
src//tests/test-six-tools.ts:71:    const exec = tools.expressCompanion.execute;
src//tests/test-six-tools.ts:80:  it("companionAct tool executes against harness host", async () => {
src//tests/test-six-tools.ts:83:      companionAct: (a) => h.companionAct(a),
src//tests/test-server-companion-bridge.ts:37:  it("expressCompanion still sends when bridge attached", async () => {
src//tests/test-server-companion-bridge.ts:48:    await bridge.expressCompanion({ emote: "happy" });
src//tests/test-companion-types.ts:63:  it("CompanionEvent may carry emote + intensity without trigger (expressCompanion)", () => {
src//tests/test-companion-types.ts:96:  it("isCompanionEmote accepts expressCompanion enum and rejects unknown", () => {
src//tests/test-companion-generate-capabilities.ts:9:    expect(md).toContain("companionAct");
src//tests/test-today-plan.ts:257:      expressCompanion: vi.fn(async () => ({ ok: true })),
src//agents/tools/six-tools-apply.ts:211:  async expressCompanion(
src//agents/tools/six-tools-apply.ts:217:  async companionAct(
src//agents/tools/companionAct.ts:5:  companionAct(args: Record<string, unknown>): Promise<Record<string, unknown>>;
src//agents/tools/companionAct.ts:11:const companionActInputSchema = z.object({
src//agents/tools/companionAct.ts:26:    inputSchema: companionActInputSchema,
src//agents/tools/companionAct.ts:28:      host.companionAct(args as Record<string, unknown>),
src//agents/tools/six-tools.ts:14:  expressCompanion(
src//agents/tools/six-tools.ts:414:    expressCompanion: tool({
src//agents/tools/six-tools.ts:429:        host.expressCompanion(args as Record<string, unknown>),
src//agents/prompts.ts:609:VRM: A 3D companion body is visible at the bottom-right of the UI. \`companionAct\` controls it (emotes, movement, camera).
src//agents/elli/tools/generateToolDocs.ts:4:import { createCompanionActTool } from "../../tools/companionAct";
src//agents/elli/tools/generateToolDocs.ts:11:const _companionAct = createCompanionActTool({
src//agents/elli/tools/generateToolDocs.ts:12:  companionAct: (a) => _defaultSixHost.companionAct(a),
src//agents/elli/tools/generateToolDocs.ts:18:  companionAct: _companionAct,
src//server/companion-bridge.ts:94:  /** Claude `expressCompanion` tool — not suppressed in preview (explicit companion act). */
src//server/companion-bridge.ts:95:  async expressCompanion(
src//server/companion-bridge.ts:126:      `  [companion] expressCompanion emote=${emoteRaw} intensity=${intensity} childId=${childId}`,
src//server/companion-bridge.ts:131:  /** Claude `companionAct` tool — not suppressed in preview. */
src//server/companion-bridge.ts:132:  async companionAct(
src//server/companion-bridge.ts:151:    console.log(`  [companion] companionAct type=${cmd.type} childId=${childId}`);
src//server/session-manager.ts:104:import { createCompanionActTool } from "../agents/tools/companionAct";
src//server/session-manager.ts:1557:      expressCompanion: (a) => this.companionBridge.expressCompanion(a),
src//server/session-manager.ts:1559:    const companionActTool = createCompanionActTool({
src//server/session-manager.ts:1560:      companionAct: (a) => this.companionBridge.companionAct(a),
src//server/session-manager.ts:1562:    const baseTools = { ...six, companionAct: companionActTool };
src//server/session-manager.ts:1667:    if (tool === "express_companion") return "expressCompanion";
src//server/session-manager.ts:1668:    if (tool === "companion_act") return "companionAct";
src//server/companion-response-runner.ts:161:            if (toolName === "express_companion") toolName = "expressCompanion";
src//server/companion-response-runner.ts:162:            if (toolName === "companion_act") toolName = "companionAct";
src//server/session-type-registry.ts:19:  "expressCompanion",
src//server/session-type-registry.ts:20:  "companionAct",
src//server/map-coordinator.ts:464:/** TEMP TEST — validated `companionAct` command on map WebSocket (diag / tooling). */
src//shared/companionEmotes.ts:2: * Emotes for `expressCompanion` and optional `CompanionEventPayload.emote`.
src//shared/companions/generateCompanionCapabilities.ts:26:    "Use the **companionAct** tool with `type` and `payload` exactly as documented below.",
src//shared/companions/generateCompanionCapabilities.ts:42:    lines.push(`**Example:** \`companionAct({ type: "${def.type}", payload: ${JSON.stringify(def.defaultPayload)} })\``);
src//shared/companions/generateCompanionCapabilities.ts:49:        "Example: `companionAct({ type: 'animate', payload: { animation: 'wave' } })` — not `companionAct({ type: 'emote', payload: { emote: 'happy' } })` for body language.",
src//shared/companions/companionContract.ts:16:// --- Claude-facing enums (companionAct payloads; single source of truth) ---
src//shared/companions/companionContract.ts:18:/** Named companion animations (`companionAct` type `animate`). */
src//shared/companions/companionContract.ts:60:/** Camera framing presets (`companionAct` type `camera`). */
src//shared/companions/companionContract.ts:124:/** Symbolic move anchors (`companionAct` type `move`). */
src//shared/companions/companionAnimateBridge.ts:2: * Maps companionAct **animate** / **move** payloads to values the web VRM layer can apply * without a full animation graph (COMPANION-API-009).
src//shared/companionTypes.ts:42:  /** Claude `expressCompanion` path */
web/src//utils/companionExpressions.ts:198: * Emote-driven reactions (`expressCompanion`). Applied before trigger/sensitivity path.
web/src//components/CompanionLayer.tsx:33:  /** Validated `companionAct` commands (voice or map WebSocket). */
web/src//companion/animationRegistry.ts:14:  /** Default loop when `companionAct` animate omits `loop`. */

```
## Grep: .vrma | .vrm | .fbx | .glb | .gltf (src/, web/src/, web/public/ text files)

```text
src//context/reina/learning_profile.json:96:    "vrmUrl": "/companions/matilda.vrm",
src//context/creator/learning_profile.json:8:    "vrmUrl": "/companions/sample.vrm",
src//context/ila/learning_profile.json:196:    "vrmUrl": "/companions/sample.vrm",
src//tests/test-node-routing.ts:79:        vrmUrl: "/companions/sample.vrm",
src//tests/test-node-routing.ts:83:        expect(params.get("companionVrmUrl")).toBe("/companions/sample.vrm");
src//tests/test-companion-avatar.ts:20:    expect(p?.companion.vrmUrl).toBe("/companions/sample.vrm");
src//tests/test-companion-avatar.ts:23:    expect(matilda.vrmUrl).toBe("/companions/sample.vrm");
src//tests/test-companion-avatar.ts:40:        vrmUrl: "/companions/sample.vrm",
src//tests/test-companion-avatar.ts:44:        expect(params.get("companionVrmUrl")).toBe("/companions/sample.vrm");
src//tests/test-companion-types.ts:25:  expect(typeof c.vrmUrl).toBe("string");
src//tests/test-companion-types.ts:92:    expect(COMPANION_DEFAULTS.vrmUrl).toBe("/companions/sample.vrm");
src//tests/test-companion-types.ts:105:      vrmUrl: "/custom.vrm",
src//tests/test-companion-types.ts:108:    expect(m.vrmUrl).toBe("/custom.vrm");
src//tests/test-companion-types.ts:118:    expect(p.companion.vrmUrl).toBe("/companions/sample.vrm");
src//tests/test-companion-types.ts:130:    expect(p.companion.vrmUrl).toBe("/companions/sample.vrm");
src//tests/test-companion-types.ts:140:      vrmUrl: "/companions/sample.vrm",
src//tests/test-companion-types.ts:149:      vrmUrl: "/companions/legacy-missing.vrm",
src//tests/test-companion-types.ts:152:    expect(merged.vrmUrl).toBe("/companions/sample.vrm");
src//shared/homeworkNodeRouting.ts:58:    vrmUrl: ctx.vrmUrl,
src//shared/homeworkNodeRouting.ts:76:    vrmUrl: ctx.vrmUrl,
src//shared/nodeRegistry.ts:41:    companionVrmUrl: ctx.vrmUrl ?? "",
src//shared/companionTypes.ts:59:  vrmUrl: "/companions/sample.vrm",
src//shared/companionTypes.ts:112:    vrmUrl: partial.vrmUrl ?? d.vrmUrl,
src//shared/companionTypes.ts:155:    vrmUrl: preset.vrmUrl,
src//prompts/companions/elli/companion.json:6:  "vrmPath": "assets/vrm/elli.vrm",
src//prompts/companions/matilda/companion.json:6:  "vrmPath": "assets/vrm/matilda.vrm",
src//profiles/childrenConfig.ts:88:    vrmUrl: block.vrmUrl,
web/src//tests/test-mixamo-retarget.ts:120:  loadMixamoFbxRoot: vi.fn().mockRejectedValue(new Error("idle.fbx not found (test)")),
web/src//tests/test-mixamo-retarget.ts:137:  it("does not throw when idle.fbx is missing (loadMixamoFbxRoot rejects)", async () => {
web/src//tests/test-mixamo-retarget.ts:138:    vi.mocked(loadMixamoFbxRoot).mockRejectedValue(new Error("idle.fbx not found"));
web/src//tests/test-mixamo-retarget.ts:154:  it("attempts to load idle.fbx after VRM loads (via CompanionMotor)", async () => {
web/src//tests/test-mixamo-retarget.ts:168:        expect.stringContaining("/animations/idle.fbx"),
web/src//utils/loadCompanionVrm.ts:37:  const vrm = gltf.userData.vrm as VRM | undefined;
web/src//utils/loadCompanionVrm.ts:39:    throw new Error("CompanionLayer: glTF loaded but userData.vrm is missing (not a VRM?)");
web/src//components/CompanionDiag.tsx:99:          <span className="text-zinc-400">Audition VRM (.vrm)</span>
web/src//components/CompanionDiag.tsx:102:            accept=".vrm"
web/src//components/CompanionLayer.tsx:347:      const modelUrl = resolveModelUrl(companion.vrmUrl);
web/src//components/CompanionLayer.tsx:499:  }, [childId, companion?.vrmUrl, mode, startLoop, stopLoop]);
web/src//components/AdventureMap.tsx:501:        vrmUrl: props.mapCompanion?.vrmUrl,
web/src//companion/animationRegistry.ts:12:  /** URL path served from `web/public` (e.g. `/animations/wave.fbx`). */
web/src//companion/animationRegistry.ts:25:  idle: { path: "/animations/idle.fbx", defaultLoop: false },
web/src//companion/animationRegistry.ts:28:    path: "/animations/dance_victory.fbx",
web/src//companion/animationRegistry.ts:31:  think: { path: "/animations/think.fbx", defaultLoop: false },
web/src//companion/animationRegistry.ts:34:  wave: { path: "/animations/wave.fbx", defaultLoop: false },
web/src//companion/animationRegistry.ts:35:  shrug: { path: "/animations/shrug.fbx", defaultLoop: false },
web/src//companion/CompanionMotor.ts:140:    this.vrm = vrm;
web/src//companion/CompanionMotor.ts:175:    const vrm = this.vrm;
web/src//companion/CompanionMotor.ts:185:    if (!vrm || vrm !== this.vrm || !camera) return;
web/src//companion/CompanionMotor.ts:279:    const v = this.vrm;
web/src//companion/CompanionMotor.ts:297:    this.vrm = null;
web/src//companion/CompanionMotor.ts:387:    const vrm = this.vrm;
web/src//companion/CompanionMotor.ts:476:    return this.vrm !== null;
web/src//companion/CompanionMotor.ts:513:    const vrm = this.vrm;
web/src//companion/CompanionMotor.ts:533:    if (!clip || !this.animationMixer || !this.vrm) {
web/public//animations/README.md:3:Place Mixamo (or compatible) **FBX** files here. They are loaded at runtime from `/animations/<filename>.fbx`.
web/public//animations/README.md:8:2. Copy it into this directory (keep names stable, e.g. `wave.fbx`).
web/public//animations/README.md:9:3. In `web/src/companion/animationRegistry.ts`, set the matching `AnimationName` row to `{ path: "/animations/wave.fbx", ... }`.
```

## Grep: streamText (src/)

```text
src//agents/elli/run.ts:1:import { stepCountIs, streamText, type ModelMessage } from "ai";
src//agents/elli/run.ts:44:  const result = streamText({

```
## Grep: messages.push | appendMessage | injectContext | injectTurn (src/, web/src/)

```text
(no matches)

```
## Grep: zod | parseEmote | validateEmote | validateCapability (src/, web/src/)

```text
src//tests/test-adventure-types.ts:2:import { z } from "zod";
src//tests/test-adventure-types.ts:22:  it("NodeRating shape validates with zod", () => {
src//agents/tools/companionAct.ts:2:import { z } from "zod";
src//agents/tools/six-tools.ts:2:import { z } from "zod";
src//agents/elli/tools/showCanvas.ts:2:import { z } from "zod";
src//agents/elli/tools/worksheetGetStatus.ts:2:import { z } from "zod";
src//agents/elli/tools/dateTime.ts:2:import { z } from "zod";
src//agents/elli/tools/transitionToWork.ts:2:import { z } from "zod";
src//agents/elli/tools/worksheetSubmitAnswer.ts:2:import { z } from "zod";
src//agents/elli/tools/riddleTracker.ts:4:import { z } from "zod";
src//agents/elli/tools/launchGame.ts:2:import { z } from "zod";
src//agents/elli/tools/worksheetLaunchGame.ts:2:import { z } from "zod";
src//agents/elli/tools/logAttempt.ts:3:import { z } from "zod";
src//agents/elli/tools/mathProblem.ts:4:import { z } from "zod";
src//agents/elli/tools/endSession.ts:2:import { z } from "zod";
src//agents/elli/tools/logWorksheetAttempt.ts:2:import { z } from "zod";
src//agents/elli/tools/startSession.ts:2:import { z } from "zod";
src//agents/elli/tools/takeGameScreenshot.ts:2:import { z } from "zod";
src//agents/elli/tools/requestPauseForCheckIn.ts:2:import { z } from "zod";
src//agents/elli/tools/worksheetClearCanvas.ts:2:import { z } from "zod";
src//agents/elli/tools/blackboard.ts:2:import { z } from "zod";
src//agents/elli/tools/worksheetGetNext.ts:2:import { z } from "zod";
src//agents/elli/tools/requestResumeActivity.ts:2:import { z } from "zod";
src//agents/matilda/tools/endSession.ts:2:import { z } from "zod";
src//agents/psychologist/tools/querySessions.ts:4:import { z } from "zod";
src//agents/psychologist/tools/flagGap.ts:4:import { z } from "zod";
src//agents/psychologist/today-plan.ts:5:import { z } from "zod";
src//server/assignment-player.ts:1:import { z } from "zod";
src//shared/companions/companionContract.ts:6:import type { z } from "zod";
src//shared/companions/registry/animate.capability.ts:1:import { z } from "zod";
src//shared/companions/registry/move.capability.ts:1:import { z } from "zod";
src//shared/companions/registry/camera.capability.ts:1:import { z } from "zod";
src//shared/companions/registry/emote.capability.ts:1:import { z } from "zod";

```
## Grep: NodeResult (src/, web/src/)

```text
src//tests/test-map-coordinator.ts:2:import type { MapState, NodeResult } from "../shared/adventureTypes";
src//tests/test-map-coordinator.ts:38:  applyNodeResult,
src//tests/test-map-coordinator.ts:132:  it("applyNodeResult increments XP and appends NodeRating", async () => {
src//tests/test-map-coordinator.ts:135:    const result: NodeResult = {
src//tests/test-map-coordinator.ts:142:    const { mapState: next } = await applyNodeResult(sessionId, result);
src//tests/test-post-node-pipeline.ts:3:import type { MapState, NodeResult } from "../shared/adventureTypes";
src//tests/test-post-node-pipeline.ts:35:  applyNodeResult,
src//tests/test-post-node-pipeline.ts:141:    const result: NodeResult = {
src//tests/test-post-node-pipeline.ts:148:    await applyNodeResult(sessionId, result);
src//tests/test-post-node-pipeline.ts:175:    const result: NodeResult = {
src//tests/test-post-node-pipeline.ts:182:    const { mapState: next } = await applyNodeResult(sessionId, result);
src//tests/test-post-node-pipeline.ts:201:    const result: NodeResult = {
src//tests/test-post-node-pipeline.ts:208:    const { mapState: next } = await applyNodeResult(sessionId, result);
src//server/routes.ts:10:import type { NodeResult } from "../shared/adventureTypes";
src//server/routes.ts:12:  applyNodeResult,
src//server/routes.ts:645:      result?: NodeResult;
src//server/routes.ts:674:        const { mapState, companionEvent } = await applyNodeResult(
src//server/map-coordinator.ts:8:  NodeResult,
src//server/map-coordinator.ts:747:function ratingFromResult(result: NodeResult): NodeRatingLike {
src//server/map-coordinator.ts:775:export async function applyNodeResult(
src//server/map-coordinator.ts:777:  result: NodeResult,
src//server/map-coordinator.ts:895:    "[map-coordinator] applyNodeResult emitting companion_event",
src//shared/adventureTypes.ts:56:export interface NodeResult {
web/src//components/AdventureMap.tsx:3:import type { NodeConfig, NodeResult } from "../../../src/shared/adventureTypes";
web/src//components/AdventureMap.tsx:142:    sendNodeResult,
web/src//components/AdventureMap.tsx:241:        void sendNodeResult(d as NodeResult);
web/src//components/AdventureMap.tsx:279:      const nr: NodeResult = {
web/src//components/AdventureMap.tsx:288:      void sendNodeResult(nr);
web/src//components/AdventureMap.tsx:292:  }, [sendNodeResult, resolved, props.previewMode]);
web/src//hooks/useMapSession.ts:14:  NodeResult,
web/src//hooks/useMapSession.ts:147:  sendNodeResult: (result: NodeResult) => Promise<MapState | null>;
web/src//hooks/useMapSession.ts:338:  const sendNodeResult = useCallback(
web/src//hooks/useMapSession.ts:339:    async (result: NodeResult) => {
web/src//hooks/useMapSession.ts:400:    sendNodeResult,

```
## Questions (file:line)

### Q1
**Answer:** `COMPANION_EMOTES` const array and exported `CompanionEmote` type alias; canonical list in `src/shared/companionEmotes.ts` lines 6–16.

### Q2
**Answer:** `CompanionLayer` loads the **VRM model URL** from config (`loadCompanionVrm(resolveModelUrl(companion.vrmUrl))`); facial/semantic mapping is **`CompanionConfig.expressions`** (semantic id → VRM blend shape name) in `companionTypes.ts` `COMPANION_DEFAULTS.expressions` lines 60–70. Separate **FBX** body animations are referenced from `web/src/companion/animationRegistry.ts` (loaded by `CompanionMotor`, not in `CompanionLayer.tsx` itself).

### Q3
**Answer:** Yes — `generateCompanionCapabilities()` at `src/shared/companions/generateCompanionCapabilities.ts` lines 11–56 returns a markdown string for prompts.

### Q4
**Answer:** **Enumerated** static object `CANVAS_CAPABILITIES` plus iteration over imported `TEACHING_TOOLS` / `REWARD_GAMES` from `../server/games/registry` (not a directory scan for canvas modes); directory scan is only for **games HTML** in `registryDiscover.ts`. See `generateCanvasCapabilities.ts` lines 79–133 and imports lines 3–4.

### Q5
**Answer:** `expressCompanion`: Zod `z.enum(COMPANION_EMOTES)` in `six-tools.ts` line 19; runtime `isCompanionEmote` in `companion-bridge.ts` lines 99–100; map test emote `broadcastTestMapCompanionEmote` `map-coordinator.ts` lines 441–442; web motor `CompanionMotor.ts` lines 331, 481; `pickEmotesToApply` path uses `isCompanionEmote` in `companionExpressions.ts` line 422.

### Q6
**Answer:** `map-coordinator.ts` does **not** reference `SessionManager`. Map sessions use module `sessions: Map<string, SessionRecord>` (lines 195, 662–664, 714–715). Voice `SessionManager` is created once per WebSocket `start_session` in `ws-handler.ts` line 111. Node launch is client `node_click` → `handleMapClientMessage` returning `node_launched` (lines 734–741), not a new server session object.

### Q7
**Answer:** `SessionManager` private field `conversationHistory: ModelMessage[]` (`session-manager.ts` line 333). It **persists** across turns; appended after each `runAgent` completion in `companion-response-runner.ts` lines 520–523. Map nodes do not reset it (separate subsystem).

### Q8
**Answer:** **Flat interface** — `export interface NodeResult` with `nodeId`, `completed`, `accuracy`, `timeSpent_ms`, `wordsAttempted` only (`adventureTypes.ts` lines 56–62).

### Q9
**Answer:** Client `sendNodeResult` POSTs to `/api/map/node-complete` (`useMapSession.ts` 338–351); `routes.ts` 670–678 calls `applyNodeResult`, which updates completed nodes, XP, persistence hooks, then builds a `companion_event` with trigger `correct_answer` or `wrong_answer` and broadcasts to map WebSockets (`map-coordinator.ts` 775–905).

### Q10
**Answer:** Yes — `SessionManager.injectTranscript` (lines 1016–1018) calls `handleEndOfTurn` as if the child spoke; also `receiveWorksheetAnswer` (1091–1092) and reading-complete synthetic prompt (`receiveReadingProgress` / `handleEndOfTurn` at 1961–1965). No literal `messages.push` on an in-memory Claude array — history is updated post-`runAgent` in `companion-response-runner.ts` 520–523.

### Q11
**Answer:** Built **fresh per `streamText` call**: `runAgent` passes `messages: [...history.filter(...), { role: "user", content: userMessage }]` (`src/agents/elli/run.ts` lines 47–50). Persistent array is `conversationHistory`; each call receives a slice/window from `companion-response-runner.ts` 58–86 then merged with pins.

---

## Output

Final file path: `/Users/jamaltaylor/Development/sunny/docs/recon/animation-injection-recon-2026-04-23T17:09:11-04:00.md`  
Line count (`wc -l`): 3409
