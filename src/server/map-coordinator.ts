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
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { recordReward } from "../engine/bandit";
import { planSession, recordAttempt } from "../engine/learningEngine";
import { getSunnyMode, sunnyPreviewBlocksPersistence } from "../utils/runtimeMode";
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
    palette: p,
    ambient: { type: "dots", count: 20, speed: 1, color: p.particle ?? "#e0f2fe" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
    castleUrl: null,
    backgroundUrl: doc.worldBackgroundUrl,
    nodeThumbnails: (doc.thumbnails ?? {}) as SessionTheme["nodeThumbnails"],
    mapWaypoints: [...DEFAULT_MAP_WAYPOINTS],
  };
}

function homeworkThemePersistenceContext(profile: ChildProfile): boolean {
  return (
    Boolean(profile.pendingHomework?.nodes?.length) ||
    process.env.SUNNY_SUBJECT?.trim() === "homework"
  );
}

async function resolveThemeForMapSession(
  profile: ChildProfile,
): Promise<{ theme: SessionTheme; shouldPersist: boolean }> {
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
  const theme = await generateTheme(profile);
  return { theme, shouldPersist: persistCtx };
}

function persistHomeworkThemeSnapshot(childId: string, theme: SessionTheme): void {
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

function isDiagMapMode(): boolean {
  return process.env.SUNNY_SUBJECT?.trim() === "diag";
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

/** Static theme — no Grok / designer image pipeline (SUNNY_SUBJECT=diag map only). */
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
  const plan = planSession("creator", "spelling");
  const dueWords =
    plan.dueWords?.length && plan.dueWords.length > 0
      ? plan.dueWords
      : [...plan.newWords, ...plan.reviewWords];
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
  if (isDiagMapMode()) {
    return buildDiagMapSession();
  }
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
