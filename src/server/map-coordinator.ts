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
import {
  planSession,
  registerMysteryGameForSessionFinalize,
} from "../engine/learningEngine";
import { computeQuestThreshold } from "../engine/error-signals/questThreshold";
import { recordHomeworkNodeMeasurement } from "../engine/homeworkCycleLoop";
import { recordLearningAttempt } from "./learningAttemptEvents";
import { recordAttentionSignal, type AttentionSignal } from "../engine/attentionVitals";
import {
  isDiagMapMode,
  sunnyPreviewBlocksPersistence,
} from "../utils/runtimeMode";
import { buildMapSummaryFromPendingNodes } from "../shared/mapSummary";
import { readWordBank } from "../utils/wordBankIO";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { selectHomeworkSessionWords, daysUntilHomeworkTest } from "../shared/homeworkWordSelection";
import { appendNodeRating } from "../utils/nodeRatingIO";
import { isCompanionEmote } from "../shared/companionEmotes";
import type { CompanionEvent, CompanionTrigger } from "../shared/companionTypes";
import { sessionEventBus, type SessionEventType } from "./session-event-bus";
import {
  getActiveVoiceSessionIdForChild,
  getActiveVoiceSessionManagerForChild,
} from "./voice-session-registry";
import { formatNodeResultForCompanion } from "./companion-context/nodeResultFormatter";
import { buildNodeCompletionHandoffState } from "./companion-context/nodeCompletionHandoff";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";
import { generateStoryImage } from "../utils/generateStoryImage";
import { reconcileCompanionCurrencyAward } from "./currencyAward";
import childrenCfg from "../../children.config.json";
import { getDopamineGameSlugsForChild } from "../profiles/childrenConfig";
import {
  applySunnyRuntimeOverrides,
  resolveSunnyRuntimeConfig,
  type SunnyRuntimeConfig,
  type SunnyRuntimeOverrides,
} from "../shared/runtimeConfig";
import { createOnboardingPlan, type OnboardingNode } from "../engine/onboardingPlan";

/** Grok prompts for homework map nodes (filled when theme has no thumbnail for that type). */
export const NODE_THUMBNAIL_PROMPTS: Record<string, string> = {
  mystery:
    "A glowing magical treasure chest with a question mark, floating in a fantasy adventure world, colorful, child-friendly, cartoon style, warm lighting",
  pronunciation:
    "microphone with colorful sound waves, children's educational app icon, bright purple background, cute cartoon style, transparent background",
  "spell-check":
    "golden pencil writing glowing letters, spelling bee trophy, stars, children's game icon, transparent background",
  wordle:
    "colorful letter tiles floating in space, word puzzle game, children's game icon, transparent background",
  "word-builder":
    "colorful alphabet blocks stacked in tower, letters glowing, children's educational toy, transparent background",
  karaoke:
    "open magical book with musical notes floating out, glowing pages, children's story, transparent background",
  "word-radar":
    "radar dish scanning a starfield with glowing word tiles, deep purple space, children's game icon, transparent background",
  "bubble-pop": "A bright focus bubble with sparkles, kid-friendly attention check icon",
  "fish-flanker": "A cheerful fish attention challenge icon with arrows, kid-friendly and uncluttered",
  "target-blaster": "A clean target blaster attention icon with one highlighted target and simple decoys",
  "hero-shield": "A friendly hero shield attention icon with a glowing shield and calm mission energy",
  quest:
    "treasure chest bursting open with gold stars and letters, adventure game icon, transparent background",
  boss: "epic castle with lightning bolts, final challenge, dramatic sky, game icon, transparent background",
  "wheel-of-fortune": "colorful carnival wheel spinning in space, gold coins flying",
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
  runtime?: SunnyRuntimeConfig,
): Promise<{ theme: SessionTheme; shouldPersist: boolean }> {
  if (isDiagMapMode()) {
    return {
      theme: { ...paletteOnlyThemeFromProfile(profile), source: "palette" },
      shouldPersist: false,
    };
  }

  const key = mapCompanionWsKey(profile.childId);
  const persistCtx = homeworkThemePersistenceContext(profile);
  const previewCtx = runtime
    ? runtime.previewMode !== "off"
    : sunnyPreviewBlocksPersistence();
  const saved = persistCtx || previewCtx ? listSavedThemes(key) : [];
  const useExisting =
    saved.length > 0 && (previewCtx || (persistCtx && Math.random() < 0.5));
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
  runtime: SunnyRuntimeConfig;
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
  "session_complete",
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
    case "session_complete":
      return "session_complete";
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
    // Emote-only events (e.g. quest unlock animations) have no trigger — silently drop.
    if (!isCompanionEmote(pl.emote)) {
      console.warn(
        "[map-coordinator] map_iframe_companion_event ignored: invalid trigger",
        triggerRaw,
      );
    }
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
    "session_complete",
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

function syncNodeStatuses(state: MapState, runtime: SunnyRuntimeConfig): void {
  const completed = new Set(state.completedNodes);
  const unlockAll = runtime.nodeAccess === "inspect-all";
  state.nodes = state.nodes.map((node, idx) => ({
    ...node,
    isCompleted: completed.has(node.id),
    isLocked:
      node.type === "boss" && !node.gameHtmlPath
        ? true
        : unlockAll
          ? false
          : idx > state.currentNodeIndex && !completed.has(node.id),
  }));
}

/** Intersect persisted homework completion ids with the current map node list (order preserved). */
export function hydrateHomeworkCompletedNodeIds(
  nodes: NodeConfig[],
  persisted: string[] | undefined,
): string[] {
  const set = new Set(persisted ?? []);
  return nodes.filter((n) => set.has(n.id)).map((n) => n.id);
}

/** Index of first node not in `completed`; if all complete, last node index. */
export function firstIncompleteNodeIndex(
  nodes: NodeConfig[],
  completed: ReadonlySet<string>,
): number {
  const idx = nodes.findIndex((n) => !completed.has(n.id));
  if (idx < 0) return Math.max(0, nodes.length - 1);
  return idx;
}

function clampNodeDifficulty(raw: number | undefined): 1 | 2 | 3 {
  const n = raw ?? 2;
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

export function isWordDrivenHomeworkNodeType(t: string): boolean {
  return (
    t === "word-radar" ||
    t === "pronunciation" ||
    t === "karaoke" ||
    t === "word-builder" ||
    t === "spell-check" ||
    t === "wordle" ||
    t === "wheel-of-fortune" ||
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
  return hw.nodes.map((node, i, arr) => {
    const persistedItems = (node as { wordRadarItems?: NodeConfig["wordRadarItems"] })
      .wordRadarItems;
    const wordRadarItems =
      node.type === "word-radar"
        ? Array.isArray(persistedItems) && persistedItems.length > 0
          ? persistedItems
          : words.map((w) => ({
              display: w,
              acceptedResponses: [w.toLowerCase()],
              label: "Spelling",
            }))
        : undefined;
    return {
      id: node.id,
      type: node.type as NodeType,
      words:
        node.type === "karaoke" && node.storyText
          ? node.words
          : isWordDrivenHomeworkNodeType(node.type)
            ? words
            : [],
      wordRadarItems,
      difficulty: clampNodeDifficulty(node.difficulty),
      gameFile: node.gameFile ?? undefined,
      storyFile: node.storyFile ?? undefined,
      storyText: node.storyText,
      storyTitle: node.storyTitle,
      storyImagePrompt: node.storyImagePrompt,
      date: node.date ?? hw.weekOf,
      isCastle: node.type === "boss",
      thumbnailUrl: undefined,
      thumbnailPrompt:
        node.type === "karaoke" && node.storyImagePrompt
          ? node.storyImagePrompt
          : NODE_THUMBNAIL_PROMPTS[node.type] ?? undefined,
      isLocked: false,
      isCompleted: false,
      isGoal: i === arr.length - 1,
    };
  });
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
  let dueWords: string[] = [];
  try {
    const plan = planSession("creator", "spelling");
    const picked =
      plan.dueWords?.length && plan.dueWords.length > 0
        ? plan.dueWords
        : [...plan.newWords, ...plan.reviewWords];
    if (picked.length > 0) dueWords = picked;
  } catch (err) {
    console.warn(
      "  🎮 [diag-map] planSession(creator) failed — empty due words:",
      err instanceof Error ? err.message : String(err),
    );
  }
  const nodes: NodeConfig[] = [
    {
      id: "n-word-radar",
      type: "word-radar",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
      words: [],
      wordRadarItems: [
        { display: "star", acceptedResponses: ["star"] },
        { display: "moon", acceptedResponses: ["moon", "luna"] },
      ],
    },
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
  const runtime = applySunnyRuntimeOverrides(
    resolveSunnyRuntimeConfig(process.env),
    { childId: "creator" },
  );
  syncNodeStatuses(mapState, runtime);
  const sessionId = randomUUID();
  sessions.set(sessionId, { childId: "creator", mapState, runtime });
  return { sessionId, mapState };
}

/** Map overview for companion prompts (exported for tests). */
export function buildMapSummary(mapState: MapState): string {
  return buildMapSummaryFromPendingNodes(mapState.nodes);
}

/** Spelling homework baseline order through wheel, then mystery, then quest/boss. */
const HOMEWORK_NODE_ORDER = [
  "word-radar",
  "karaoke",
  "pronunciation",
  "word-builder",
  "spell-check",
  "wheel-of-fortune",
] as const;

// TODO: Level 5 unlock — companion picks based on session energy
// TODO: Level 10 unlock — child picks from menu

/** Re-export for callers/tests that want the mystery pool without importing childrenConfig. */
export { getDopamineGameSlugsForChild as getMysteryDopaminePoolForChild };

/**
 * Homework quest when not using a generated HTML game: always one of these two
 * spelling iframes (`web/public/games/<slug>.html`).
 */
export const HOMEWORK_QUEST_SPELLING_SLUGS = [
  "monster-stampede",
  "speed-catcher",
] as const;

const QUEST_GAME_FILES = [
  `${HOMEWORK_QUEST_SPELLING_SLUGS[0]}.html`,
  `${HOMEWORK_QUEST_SPELLING_SLUGS[1]}.html`,
] as const;

function selectQuestGameFile(): (typeof QUEST_GAME_FILES)[number] {
  return QUEST_GAME_FILES[Math.floor(Math.random() * QUEST_GAME_FILES.length)]!;
}

/**
 * Picks a dopamine iframe game for the homework mystery node (uniform random over
 * that child's companion `dopamineGames` in `children.config.json`).
 * Persisted to profile via `finalizeSession` after `registerMysteryGameForSessionFinalize`.
 */
export function selectMysteryGame(childId: string): string {
  const games = getDopamineGameSlugsForChild(childId);
  return games[Math.floor(Math.random() * games.length)]!;
}

function hasManualQuestUnlock(childId: string): boolean {
  const profiles = childrenCfg.childProfiles as
    | Record<string, { questUnlocked?: boolean }>
    | undefined;
  const id = childId.trim().toLowerCase();
  return profiles?.[id]?.questUnlocked === true;
}

function hasQuestUnlock(childId: string): boolean {
  try {
    if (computeQuestThreshold(childId)) return true;
  } catch (err) {
    console.error("  🔴 [map-coordinator] quest threshold check failed:", err);
  }
  return hasManualQuestUnlock(childId);
}

function orderHomeworkBaselineNodes(nodes: NodeConfig[]): NodeConfig[] {
  const out: NodeConfig[] = [];
  for (const t of HOMEWORK_NODE_ORDER) {
    for (const n of nodes.filter((node) => node.type === t)) {
      out.push({ ...n, isGoal: false });
    }
  }
  return out;
}

function onboardingNodeToMapNode(
  node: OnboardingNode,
  theme: SessionTheme,
  idx: number,
  total: number,
): NodeConfig {
  const common = {
    id: node.id,
    isLocked: false,
    isCompleted: false,
    isGoal: idx === total - 1,
    difficulty: 1 as const,
  };
  if (node.purpose === "attention_screening") {
    return {
      ...common,
      type: node.activityId as NodeConfig["type"],
      thumbnailUrl: theme.nodeThumbnails?.[node.activityId] ?? undefined,
      thumbnailPrompt: NODE_THUMBNAIL_PROMPTS[node.activityId] ?? NODE_THUMBNAIL_PROMPTS["bubble-pop"],
      words: [node.activityId],
      attentionConfig: node.config,
    };
  }
  if (node.purpose === "dopamine_reward") {
    return {
      ...common,
      type: "mystery",
      gameFile: "space-frogger.html",
      thumbnailUrl: theme.nodeThumbnails?.mystery ?? undefined,
      thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.mystery,
      words: [],
    };
  }
  return {
    ...common,
    type: "karaoke",
    thumbnailUrl: theme.nodeThumbnails?.karaoke ?? undefined,
    thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.karaoke,
    storyTitle: "Tiny academic load check",
    storyText:
      "Sunny checks how much learning you can handle today. Try a short question set, then take a breath.",
    words: ["Sunny", "checks", "learning", "focus"],
  };
}

function buildOnboardingPreviewNodes(childId: string, theme: SessionTheme): NodeConfig[] {
  const plan = createOnboardingPlan(childId);
  return plan.nodes.map((node, idx) =>
    onboardingNodeToMapNode(node, theme, idx, plan.nodes.length),
  );
}

export async function startMapSession(
  childId: string,
  runtimeOverrides: SunnyRuntimeOverrides = {},
): Promise<{ sessionId: string; mapState: MapState }> {
  const runtime = applySunnyRuntimeOverrides(
    resolveSunnyRuntimeConfig(process.env),
    {
      ...runtimeOverrides,
      childId: runtimeOverrides.childId ?? childId,
    },
  );
  const profile = await buildProfile(childId);
  if (!profile) {
    throw new MapSessionError("unknown_child", 404);
  }
  const { theme, shouldPersist } = await resolveThemeForMapSession(profile, runtime);
  let nodes: NodeConfig[];
  const homeworkId =
    (
      profile.pendingHomework as
        | (NonNullable<ChildProfile["pendingHomework"]> & { homeworkId?: string })
        | undefined
    )?.homeworkId ??
    profile.pendingHomework?.weekOf ??
    "session";
  const questConfig = profile.games?.quest;
  const bossConfig = profile.games?.boss;
  console.log("🎯 [quest-boss-check]", {
    questDataThresholdMet: questConfig?.dataThresholdMet,
    questGeneratedGamePath: questConfig?.generatedGamePath,
    questGenerationModel: questConfig?.generationModel,
    dataThresholdMet: bossConfig?.dataThresholdMet,
    generatedGamePath: bossConfig?.generatedGamePath,
    generationModel: bossConfig?.generationModel,
  });
  if (runtime.subject === "onboarding") {
    nodes = buildOnboardingPreviewNodes(profile.childId, theme);
  } else if (profile.pendingHomework?.nodes?.length) {
    const hw = profile.pendingHomework;
    const sm2Plan = planSession(childId, "spelling", {
      homeworkFallbackWords: hw.wordList,
    });
    const bank = readWordBank(childId);
    const reinforce = hw.reinforceWords ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const maxWords =
      profile.games?.["word-radar"]?.maxWords ??
      profile.games?.["spell-check"]?.maxWords ??
      5;
    const sessionWords = selectHomeworkSessionWords({
      wordList: hw.wordList,
      sm2Plan,
      missedWords: reinforce,
      testDate: hw.testDate,
      maxWords,
      testImminent: daysUntilHomeworkTest(hw.testDate, today) <= 5,
      wordBankWords: bank.words,
      todayIso: today,
    });
    /** Same source as node-completion handoff misses — URL `words` for mystery iframes. */
    const pendingHandoffMissedWords =
      reinforce.length > 0 ? [...reinforce] : [...sessionWords];
    if (reinforce.length > 0) {
      try {
        const lp = readLearningProfile(childId);
        if (lp?.pendingHomework?.reinforceWords?.length) {
          writeLearningProfile(childId, {
            ...lp,
            pendingHomework: { ...lp.pendingHomework, reinforceWords: [] },
          });
        }
      } catch (err) {
        console.error("  🔴 [map-coordinator] clear reinforceWords failed:", err);
      }
    }
    const rawBaseline = pendingHomeworkToNodeConfigs(hw, sessionWords).filter(
      (node) =>
        node.type !== "quest" &&
        node.type !== "boss" &&
        node.type !== "mystery",
    );
    const baselineOrdered = orderHomeworkBaselineNodes(rawBaseline);
    const mysterySlug = selectMysteryGame(childId);
    const mysteryGameFile = `${mysterySlug}.html`;
    registerMysteryGameForSessionFinalize(childId, mysterySlug);
    console.log(`🎮 [mystery] picked mystery game: ${mysteryGameFile}`);
    const wheelIdx = baselineOrdered.findIndex((n) => n.type === "wheel-of-fortune");
    let head: NodeConfig[];
    let tail: NodeConfig[];
    if (wheelIdx >= 0) {
      head = baselineOrdered.slice(0, wheelIdx + 1);
      tail = baselineOrdered.slice(wheelIdx + 1);
    } else {
      head = [...baselineOrdered];
      tail = [];
    }

    const mysteryNode: NodeConfig = {
      id: `n-mystery-${homeworkId}`,
      type: "mystery",
      words: pendingHandoffMissedWords,
      difficulty: 2,
      gameFile: mysteryGameFile,
      thumbnailUrl: theme.nodeThumbnails?.mystery ?? undefined,
      thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.mystery,
      isLocked: false,
      isCompleted: false,
      isGoal: false,
    };

    const ordered: NodeConfig[] = [...head, mysteryNode, ...tail];
    const questGamePath =
      typeof questConfig?.generatedGamePath === "string" &&
      questConfig.generatedGamePath.length > 0
        ? questConfig.generatedGamePath
        : undefined;
    const questGenerationModel = questConfig?.generationModel;
    const questGameReady = Boolean(
      questConfig?.dataThresholdMet &&
      questGamePath &&
      questGenerationModel,
    );
    const manualQuest = hasQuestUnlock(childId);
    if (questGameReady || manualQuest) {
      ordered.push({
        id: `n-quest-${homeworkId}`,
        type: "quest",
        words: pendingHandoffMissedWords,
        difficulty: 2,
        isLocked: false,
        isCompleted: false,
        isGoal: false,
        thumbnailUrl: theme?.nodeThumbnails?.["quest"] ?? undefined,
        thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.quest,
        gameFile: questGameReady ? undefined : selectQuestGameFile(),
        gameHtmlPath: questGameReady ? questGamePath : undefined,
        generationModel: questGameReady ? questGenerationModel : undefined,
      });
    }
    const bossGamePath =
      typeof bossConfig?.generatedGamePath === "string" &&
      bossConfig.generatedGamePath.length > 0
        ? bossConfig.generatedGamePath
        : undefined;
    const bossGameReady = Boolean(
      bossConfig?.dataThresholdMet &&
      bossGamePath &&
      bossConfig?.generationModel === "opus",
    );
    ordered.push({
      id: `n-boss-${homeworkId}`,
      type: "boss",
      words: [],
      difficulty: 3,
      isLocked: !bossGameReady,
      isCompleted: false,
      isGoal: false,
      thumbnailUrl: theme?.nodeThumbnails?.["boss"] ?? undefined,
      thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.boss,
      gameHtmlPath: bossGameReady ? bossGamePath : undefined,
      generationModel: bossGameReady ? "opus" : undefined,
    });
    ordered.forEach((node, i) => {
      node.isGoal = i === ordered.length - 1;
    });
    nodes = ordered;
  } else {
    nodes = await buildNodeList(profile, theme);
  }
  console.log("🗺️ [map] final node order:", nodes.map((n) => n.type));
  if (runtime.nodeAccess === "inspect-all") {
    nodes.forEach((node) => {
      if (node.type === "boss") {
        node.isLocked = !node.gameHtmlPath;
        node.isCompleted = false;
        return;
      }
      node.isLocked = false;
      node.isCompleted = false;
    });
    console.log("🔓 [runtime] inspect-all active — all eligible nodes unlocked");
  }
  try {
    await enrichHomeworkNodeThumbnails(theme, nodes.map((n) => n.type as string));
    const mysteryThumb = theme.nodeThumbnails?.mystery;
    if (mysteryThumb) {
      const idx = nodes.findIndex((n) => n.type === "mystery");
      if (idx >= 0) nodes[idx] = { ...nodes[idx], thumbnailUrl: mysteryThumb };
    }
  } catch (err) {
    console.error("🎮 [map-coordinator] enrichHomeworkNodeThumbnails failed", err);
  }
  if (
    shouldPersist &&
    runtime.persistenceMode === "live" &&
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
  if (runtime.nodeAccess === "inspect-all") {
    mapState.completedNodes = [];
    mapState.currentNodeIndex = 0;
  } else if (profile.pendingHomework?.nodes?.length) {
    const persisted = profile.pendingHomework.completedAdventureNodeIds;
    mapState.completedNodes = hydrateHomeworkCompletedNodeIds(mapState.nodes, persisted);
    const done = new Set(mapState.completedNodes);
    mapState.currentNodeIndex = firstIncompleteNodeIndex(mapState.nodes, done);
  }
  syncNodeStatuses(mapState, runtime);
  const sessionId = randomUUID();
  sessions.set(sessionId, { childId: profile.childId, mapState, runtime });
  return { sessionId, mapState };
}

function currentNode(state: MapState): NodeConfig | undefined {
  return state.nodes[state.currentNodeIndex];
}

function isAttentionScreeningNodeType(type: string): boolean {
  return type === "bubble-pop" ||
    type === "fish-flanker" ||
    type === "target-blaster" ||
    type === "hero-shield";
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
    const inspectAll = rec.runtime.nodeAccess === "inspect-all";
    const clicked = rec.mapState.nodes.find((n) => n.id === nodeId);
    if (!clicked) {
      return [{ type: "map_error", payload: { reason: "unknown_node" } }];
    }
    const launchedNode = clicked;
    if (!inspectAll) {
      const cur = currentNode(rec.mapState);
      if (!cur || cur.id !== nodeId) {
        return [{ type: "map_error", payload: { reason: "not_current_node" } }];
      }
    }
    const childId = rec.mapState.childId;
    const sm = getActiveVoiceSessionManagerForChild(childId);
    if (sm) {
      const nodeSummary = launchedNode.words?.length
        ? `${childId} just started a ${launchedNode.type} activity. Word: "${launchedNode.words[0]}".`
        : launchedNode.wordRadarItems?.length
          ? `${childId} just started a ${launchedNode.type} activity. Word: "${launchedNode.wordRadarItems[0].display}".`
          : `${childId} just started a ${launchedNode.type} activity.`;
      const gameContextSession = sm as typeof sm & {
        injectGameContext?: (state: Record<string, unknown>) => void;
      };
      gameContextSession.injectGameContext?.({
        game: launchedNode.type,
        phase: "launched",
        nodeId: launchedNode.id,
        currentWord:
          launchedNode.words?.[0] ?? launchedNode.wordRadarItems?.[0]?.display ?? "",
        progress: nodeSummary,
      });
      sm.noteExternalEvent({
        source: "map_node_started",
        summary: nodeSummary,
        occurredAt: Date.now(),
      });
    }
    out.push({ type: "node_launched", payload: launchedNode });
    return out;
  }

  if (msg.type === "game_state_update") {
    const childId = rec.mapState.childId;
    const sm = getActiveVoiceSessionManagerForChild(childId);
    if (sm) {
      const payload =
        msg.payload != null &&
        typeof msg.payload === "object" &&
        !Array.isArray(msg.payload)
          ? (msg.payload as Record<string, unknown>)
          : {};
      const gameContextSession = sm as typeof sm & {
        injectGameContext?: (state: Record<string, unknown>) => void;
      };
      gameContextSession.injectGameContext?.(payload);
      const progress = String(
        payload.progress ?? "Working on a game",
      );
      sm.noteExternalEvent({
        source: "game_state_update",
        summary: progress,
        occurredAt: Date.now(),
      });
      console.log("  🎮 [map-coordinator] game_state_update injected");
    }
    return [];
  }

  if (msg.type === "currency_award") {
    const pl =
      msg.payload != null && typeof msg.payload === "object" && !Array.isArray(msg.payload)
        ? (msg.payload as Record<string, unknown>)
        : {};
    const skipPersistence =
      rec.runtime.persistenceMode === "blocked" || Boolean(pl.skipPersistence);
    const out = reconcileCompanionCurrencyAward({
      childId: rec.mapState.childId,
      amount: pl.amount,
      dryRun: skipPersistence,
    });
    if (!out.ok) {
      return [];
    }
    if (!skipPersistence) {
      const safe = Math.max(0, Math.floor(Number.isFinite(out.balance) ? out.balance : 0));
      broadcastCompanionEventToMapChild(rec.mapState.childId, {
        type: "currency_update",
        balance: safe,
      });
    }
    console.log(
      `  🎮 [map-coordinator] currency_award balance=${out.balance} dryRun=${skipPersistence} reason=${String(pl.reason ?? "")}`,
    );
    return [];
  }

  return [{ type: "map_error", payload: { reason: "unknown_message" } }];
}

function ratingFromResult(nodeType: NodeType, result: NodeResult): NodeRatingLike {
  if (nodeType === "mystery") {
    if (!result.completed) return "dislike";
    return result.accuracy >= 0.7 ? "like" : "dislike";
  }
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

  const rating = ratingFromResult(nodeCfg.type, result);
  const skipSessionPersistence =
    rec.runtime.persistenceMode === "blocked" || opts?.clientPreviewFreeOrGoLive === true;

  if (!skipSessionPersistence) {
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
    try {
      await recordReward(
        st.childId,
        nodeCfg.type,
        rating === "like",
        result.completed,
        result.accuracy,
      );
    } catch (err) {
      console.error("  🔴 [map-coordinator] recordReward failed:", err);
    }
  }

  if (
    !skipSessionPersistence &&
    isAttentionScreeningNodeType(nodeCfg.type) &&
    result.vitalSigns &&
    typeof result.vitalSigns === "object"
  ) {
    const now = new Date().toISOString();
    try {
      recordAttentionSignal(st.childId, {
        sessionId,
        activityId: result.activityId ?? nodeCfg.type,
        purpose: "attention_screening",
        startedAt: String(result.vitalSigns.startedAt ?? st.sessionDate),
        endedAt: String(result.vitalSigns.endedAt ?? now),
        activeDuration_ms: Number(result.vitalSigns.activeDuration_ms ?? result.timeSpent_ms),
        idleEvents: Number(result.vitalSigns.idleEvents ?? 0),
        abandonments: Number(result.vitalSigns.abandonments ?? (result.completed ? 0 : 1)),
        reengagements: Number(result.vitalSigns.reengagements ?? 0),
        omissions: Number(result.vitalSigns.omissions ?? 0),
        commissions: Number(result.vitalSigns.commissions ?? 0),
        meanReactionTime_ms:
          result.vitalSigns.meanReactionTime_ms == null
            ? undefined
            : Number(result.vitalSigns.meanReactionTime_ms),
        reactionTimeVariability:
          result.vitalSigns.reactionTimeVariability == null
            ? undefined
            : Number(result.vitalSigns.reactionTimeVariability),
        dropoff:
          result.vitalSigns.dropoff == null
            ? undefined
            : Number(result.vitalSigns.dropoff),
        accuracyOverTime: Array.isArray(result.vitalSigns.accuracyOverTime)
          ? result.vitalSigns.accuracyOverTime as AttentionSignal["accuracyOverTime"]
          : undefined,
        frustrationSignals: Array.isArray(result.vitalSigns.frustrationSignals)
          ? result.vitalSigns.frustrationSignals.map(String)
          : [],
        flowSignals: Array.isArray(result.vitalSigns.flowSignals)
          ? result.vitalSigns.flowSignals.map(String)
          : [],
        practiceGate:
          result.vitalSigns.practiceGate &&
          typeof result.vitalSigns.practiceGate === "object" &&
          !Array.isArray(result.vitalSigns.practiceGate)
            ? result.vitalSigns.practiceGate as AttentionSignal["practiceGate"]
            : undefined,
      });
      console.log(`  🎮 [attention-vitals] recorded ${nodeCfg.type}`);
    } catch (err) {
      console.error("  🔴 [attention-vitals] record failed:", err);
    }
  }

  const missed = [...(result.missedWords ?? [])]
    .map((w) => String(w).trim())
    .filter(Boolean);
  if (missed.length > 0 && isWordDrivenHomeworkNodeType(nodeCfg.type)) {
    const questNode = st.nodes.find(
      (node) => node.type === "quest" && !node.isCompleted,
    );
    if (questNode) {
      const mergedQuestWords = [
        ...new Set([
          ...(questNode.words ?? []),
          ...missed,
        ].map((x) => String(x).trim()).filter(Boolean)),
      ];
      questNode.words = mergedQuestWords;
      console.log(
        `  🎮 [map-coordinator] quest_words updated count=${mergedQuestWords.length}`,
      );
    }
    try {
      const lp = readLearningProfile(st.childId);
      const ph = lp?.pendingHomework;
      if (lp && ph) {
        const prev = ph.reinforceWords ?? [];
        const merged = [
          ...new Set([...prev, ...missed].map((x) => String(x).trim()).filter(Boolean)),
        ];
        writeLearningProfile(st.childId, {
          ...lp,
          pendingHomework: { ...ph, reinforceWords: merged },
        });
      }
    } catch (err) {
      console.error("  🔴 [map-coordinator] reinforceWords merge failed:", err);
    }
  }

  if (nodeCfg.type !== "spell-check" && !isAttentionScreeningNodeType(nodeCfg.type)) {
    const pool =
      nodeCfg.words && nodeCfg.words.length > 0
        ? nodeCfg.words
        : null;
    if (pool) {
      const nAttempt = Math.max(0, Math.floor(result.wordsAttempted));
      const count = Math.min(nAttempt, pool.length);
      for (let i = 0; i < count; i++) {
        const word = pool[i]!;
        const correct = result.completed && result.accuracy >= 0.5;
        try {
          recordLearningAttempt({
            childId: st.childId,
            target: word,
            domain: "spelling",
            correct,
            quality: (correct ? 4 : 2) as ChildQuality,
            scaffoldLevel: 2,
            responseTimeMs: result.timeSpent_ms,
            sessionId: sessionId,
          });
        } catch (err) {
          console.error("  🔴 [map-coordinator] recordAttempt failed:", err);
        }
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

  if (!skipSessionPersistence) {
    appendMapSessionNote(
      st.childId,
      st.sessionDate,
      `Map node ${nodeCfg.type} ${result.nodeId} completed=${result.completed} accuracy=${result.accuracy}`,
    );
  }

  if (!skipSessionPersistence && result.completed) {
    try {
      const lp = readLearningProfile(st.childId);
      const pending = lp?.pendingHomework as
        | (NonNullable<ChildProfile["pendingHomework"]> & { homeworkId?: string })
        | undefined;
      const homeworkId = pending?.homeworkId ?? pending?.weekOf;
      if (homeworkId) {
        const updatedCycle = recordHomeworkNodeMeasurement({
          childId: st.childId,
          homeworkId,
          nodeId: result.nodeId,
          nodeType: nodeCfg.type,
          accuracy: result.accuracy,
          completedAt: new Date().toISOString(),
        });
        if (updatedCycle?.questMeasurement) {
          console.log(
            `  🎮 [homework-cycle] quest measurement ${updatedCycle.questMeasurement.status} accuracy=${updatedCycle.questMeasurement.interventionAccuracy}`,
          );
        }
        if (updatedCycle?.bossTheory) {
          console.log(
            `  🎮 [homework-cycle] boss theory ready for ${homeworkId}`,
          );
        }
      }
    } catch (err) {
      console.error("  🔴 [map-coordinator] homework cycle measurement failed:", err);
    }
  }

  if (!skipSessionPersistence && result.completed) {
    try {
      const lp = readLearningProfile(st.childId);
      if (lp?.pendingHomework?.nodes?.length) {
        const nodeOk = st.nodes.some((n) => n.id === result.nodeId);
        if (nodeOk) {
          const prev = lp.pendingHomework.completedAdventureNodeIds ?? [];
          if (!prev.includes(result.nodeId)) {
            lp.pendingHomework.completedAdventureNodeIds = [...prev, result.nodeId];
            writeLearningProfile(st.childId, lp);
          }
        }
      }
    } catch (err) {
      console.error("  🔴 [map-coordinator] persist homework map completion failed:", err);
    }
  }

  if (st.currentNodeIndex < st.nodes.length - 1) {
    st.currentNodeIndex++;
  }
  syncNodeStatuses(st, rec.runtime);

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

  const voiceSm = getActiveVoiceSessionManagerForChild(st.childId);
  if (voiceSm) {
    voiceSm.noteExternalEvent(formatNodeResultForCompanion(nodeCfg, result));
    const voiceWithHandoff = voiceSm as typeof voiceSm & {
      queueNodeCompletionHandoff?: (state: Record<string, unknown>) => void;
    };
    voiceWithHandoff.queueNodeCompletionHandoff?.(
      buildNodeCompletionHandoffState(nodeCfg, result),
    );
  }

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
