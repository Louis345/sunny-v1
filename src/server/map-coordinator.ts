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
import {
  MAP_PATH_PRESETS,
  mapPathPresetForTheme,
  resolveMapPathPresetName,
} from "../shared/mapPathLayout";
import type { ChildProfile } from "../shared/childProfile";
import { buildProfile } from "../profiles/buildProfile";
import { generateTheme, paletteOnlyThemeFromProfile } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { getBanditState, recordReward } from "../engine/bandit";
import {
  planSession,
  registerMysteryGameForSessionFinalize,
} from "../engine/learningEngine";
import { computeQuestThreshold } from "../engine/error-signals/questThreshold";
import { recordHomeworkNodeMeasurement } from "../engine/homeworkCycleLoop";
import {
  appendChildActivityEvidence,
  updateContentCatalogFromActivityEvidence,
  type ActivityEvidence,
} from "../engine/learningDecisionContext";
import { recordAttentionSignal, type AttentionSignal } from "../engine/attentionVitals";
import {
  isDiagMapMode,
  sunnyPreviewBlocksPersistence,
} from "../utils/runtimeMode";
import { buildMapSummaryFromPendingNodes } from "../shared/mapSummary";
import { hasPlayableMasteryArtifact } from "../shared/mapNodeLocks";
import { readWordBank } from "../utils/wordBankIO";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import {
  selectHomeworkSessionWords,
  daysUntilHomeworkTest,
  homeworkOnlySelectionPlan,
} from "../shared/homeworkWordSelection";
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
import { computeStoryMovieCost } from "../shared/rewardEconomy";
import { recordLearningAttempt } from "./learningAttemptEvents";
import childrenCfg from "../../children.config.json";
import { getDopamineGameSlugsForChild } from "../profiles/childrenConfig";
import {
  applySunnyRuntimeOverrides,
  resolveSunnyRuntimeConfig,
  type SunnyRuntimeConfig,
  type SunnyRuntimeOverrides,
} from "../shared/runtimeConfig";
import { createOnboardingPlan, type OnboardingNode } from "../engine/onboardingPlan";
import { selectTargetedPracticePlan } from "../engine/targetedPracticeSelector";
import {
  validateActivityPlan,
  type ActivityPlanNode,
  type ActivityPlanValidationResult,
  type DomainEvidence,
} from "../engine/activityPlanValidator";
import { ensureFreshPendingHomework } from "../scripts/homeworkSelector";
import { buildMysteryChoiceNodeData } from "../engine/mysteryChoicePlanner";
import {
  applyChoiceEventPreference,
  recordChoiceEvent,
  type ChoiceEventInput,
} from "../engine/choiceEvents";
import { getChildChart } from "../profiles/childChart";
import {
  inferHomeworkDomainFromPending,
  patchActiveHomeworkLane,
  selectedHomeworkDomain,
} from "../engine/homeworkLanes";
import {
  activeSessionPlanRefreshReason,
  buildAdventureMapFromSessionPlan,
  writeActiveSessionPlan,
} from "../engine/sessionPlanFromChart";
import {
  createHomeworkEvidenceGate,
  filterHomeworkTargets,
  sanitizeActiveHomeworkPlanForLaunch,
} from "../shared/homeworkEvidenceGate";
import {
  buildExperiencePlannerInput,
  draftPsychologistExperiencePlan,
} from "../engine/experiencePlanner";
import { recordLearningExperimentResult } from "../engine/learningExperiments";
import {
  buildActivityIntent,
  selectTargetsForIntent,
  type ActivityIntentEvidence,
} from "../engine/activityIntent";

/** Grok prompts for homework map nodes (filled when theme has no thumbnail for that type). */
export const NODE_THUMBNAIL_PROMPTS: Record<string, string> = {
  mystery:
    "A glowing magical treasure chest with a question mark, floating in a fantasy adventure world, colorful, child-friendly, cartoon style, warm lighting",
  pronunciation:
    "microphone with colorful sound waves, children's educational app icon, bright purple background, cute cartoon style, transparent background",
  "spell-check":
    "golden pencil writing glowing letters, spelling bee trophy, stars, children's game icon, transparent background",
  "letter-rush":
    "glowing arcade letter tiles rushing through a colorful spelling obstacle course, children's learning game icon, transparent background",
  "monster-stampede":
    "friendly cartoon monsters running past glowing spelling word gates, energetic children's learning game icon, transparent background",
  wordle:
    "colorful letter tiles floating in space, word puzzle game, children's game icon, transparent background",
  "word-builder":
    "colorful alphabet blocks stacked in tower, letters glowing, children's educational toy, transparent background",
  karaoke:
    "open magical book with musical notes floating out, glowing pages, children's story, transparent background",
  "word-radar":
    "radar dish scanning a starfield with glowing word tiles, deep purple space, children's game icon, transparent background",
  "bubble-pop": "A bright focus bubble with sparkles, kid-friendly attention check icon",
  "cpt-low-reward": "A calm simple circle and square focus check icon, quiet and low reward",
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
  mapPathPreset?: string;
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
  const mapPathPreset = resolveMapPathPresetName(
    doc.mapPathPreset ?? mapPathPresetForTheme(doc.name),
  );
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
    mapPathPreset,
    mapWaypoints: [...MAP_PATH_PRESETS[mapPathPreset]],
    source: "saved",
  };
}

function homeworkThemePersistenceContext(profile: ChildProfile): boolean {
  return (
    Boolean(profile.pendingHomework?.nodes?.length) ||
    process.env.SUNNY_SUBJECT?.trim() === "homework"
  );
}

function homeworkThemeName(profile: ChildProfile): string | null {
  const profileTopic = profile.pendingHomework?.contentProfile?.topic ?? "";
  const concepts = profile.pendingHomework?.contentProfile?.concepts ?? [];
  const haystack = [profileTopic, ...concepts].join(" ").toLowerCase();
  if (haystack.includes("erosion")) return "erosion";
  const topic = profileTopic.trim().toLowerCase();
  if (!topic || topic === "homework") return null;
  return topic.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || null;
}

export async function resolveThemeForMapSession(
  profile: ChildProfile,
  runtime?: SunnyRuntimeConfig,
): Promise<{ theme: SessionTheme; shouldPersist: boolean }> {
  const contentThemeName = homeworkThemeName(profile);
  if (isDiagMapMode()) {
    return {
      theme: {
        ...paletteOnlyThemeFromProfile(profile, contentThemeName ? { themeName: contentThemeName } : undefined),
        source: "palette",
      },
      shouldPersist: false,
    };
  }

  const key = mapCompanionWsKey(profile.childId);
  const persistCtx = homeworkThemePersistenceContext(profile);
  const previewCtx = runtime
    ? runtime.previewMode !== "off"
    : sunnyPreviewBlocksPersistence();
  const savedAll = persistCtx || previewCtx ? listSavedThemes(key) : [];
  const saved = contentThemeName
    ? savedAll.filter((theme) => theme.name === contentThemeName)
    : savedAll;
  const useExisting =
    saved.length > 0 && (previewCtx || (persistCtx && Math.random() < 0.5));
  if (useExisting) {
    const picked = saved[saved.length - 1]!;
    console.log(`  🎨 Reusing saved theme: ${picked.name}`);
    return { theme: sessionThemeFromSaved(picked), shouldPersist: false };
  }
  const generated = await generateTheme(
    profile,
    contentThemeName ? { themeName: contentThemeName } : undefined,
  );
  const theme =
    generated != null
      ? { ...generated, source: "generated" as const }
      : {
          ...paletteOnlyThemeFromProfile(
            profile,
            contentThemeName ? { themeName: contentThemeName } : undefined,
          ),
          source: "palette" as const,
        };
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
    mapPathPreset: theme.mapPathPreset,
    savedBy: "auto",
  };
  fs.writeFileSync(themeFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`  🎨 Theme saved → themes/${path.basename(themeFile)}`);
}

type SessionRecord = {
  childId: string;
  mapState: MapState;
  runtime: SunnyRuntimeConfig;
  pendingHomework?: NonNullable<ChildProfile["pendingHomework"]>;
  greetedNodeIds: Set<string>;
};

const sessions = new Map<string, SessionRecord>();
const latestSessionIdByChild = new Map<string, string>();

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

function narrationTextFromPayload(payload: Record<string, unknown>): string {
  const direct = typeof payload.text === "string" ? payload.text.trim() : "";
  const word = typeof payload.word === "string" ? payload.word.trim() : "";
  const prompt = direct || word;
  if (!prompt) return "";
  return /[.!?]$/.test(prompt) ? prompt : `${prompt}.`;
}

function handleGameNarrationRequest(
  childId: string,
  payload: Record<string, unknown>,
  source: string,
): void {
  const text = narrationTextFromPayload(payload);
  if (!text) {
    console.warn("[map-coordinator] narration_request ignored: missing text");
    return;
  }
  const sm = getActiveVoiceSessionManagerForChild(childId);
  if (!sm?.speakGameNarration) {
    console.warn("[map-coordinator] narration_request ignored: no active voice session");
    return;
  }
  void Promise.resolve(
    sm.speakGameNarration(text, {
      ...payload,
      source,
    }),
  ).catch((err) => {
    console.error("  🔴 [map-coordinator] narration_request failed:", err);
  });
  console.log(
    `  🎮 [map-coordinator] narration_request queued child=${childId} text=${JSON.stringify(text)}`,
  );
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
  const childPayload =
    typeof pl.childId === "string" ? pl.childId.trim().toLowerCase() : "";
  if (!childPayload || mapCompanionWsKey(childPayload) !== regKey) {
    console.warn(
      "[map-coordinator] map_iframe_companion_event ignored: childId mismatch",
      { regKey, childPayload },
    );
    return true;
  }
  if (triggerRaw === "narration_request") {
    handleGameNarrationRequest(regKey, pl, "map_iframe_companion_event");
    return true;
  }
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
      shouldKeepMasteryNodeLockedInPreview(node, runtime)
        ? true
        : (node.type === "quest" || node.type === "boss") &&
          node.masteryUnlockState !== "unlocked" &&
          node.masteryUnlockState !== "completed"
        ? true
        : node.type === "quest" && !hasPlayableAdaptiveArtifact(node)
        ? true
        : node.type === "boss" && !hasPlayableAdaptiveArtifact(node)
        ? true
        : unlockAll
          ? false
          : idx > state.currentNodeIndex && !completed.has(node.id),
  }));
}

function shouldKeepMasteryNodeLockedInPreview(
  node: Pick<NodeConfig, "type">,
  runtime: SunnyRuntimeConfig,
): boolean {
  return runtime.previewMode !== "off" && (node.type === "quest" || node.type === "boss");
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
    t === "letter-rush" ||
    t === "monster-stampede" ||
    t === "wordle" ||
    t === "wheel-of-fortune" ||
    t === "quest" ||
    t === "boss"
  );
}

function isRetargetablePracticeNodeType(t: string): boolean {
  return (
    t === "word-radar" ||
    t === "word-builder" ||
    t === "letter-rush" ||
    t === "monster-stampede" ||
    t === "wordle" ||
    t === "wheel-of-fortune"
  );
}

function normalizedWordKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function uniqueWords(raw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const word = String(value ?? "").trim();
    const key = normalizedWordKey(word);
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

type HomeworkTargetGroupForMap = {
  purpose?: unknown;
  words?: unknown;
};

function heldFluencyTargetsFromHomework(
  hw: NonNullable<ChildProfile["pendingHomework"]> | undefined,
): string[] {
  const interpretation = hw?.capturedContent?.assignmentInterpretation;
  const heldTargets = Array.isArray(interpretation?.heldTargets)
    ? interpretation.heldTargets
    : [];
  const fallbackGroups = Array.isArray(hw?.capturedContent?.wordGroups)
    ? hw.capturedContent.wordGroups
    : [];
  const groups = (heldTargets.length > 0 ? heldTargets : fallbackGroups) as HomeworkTargetGroupForMap[];
  return uniqueWords(
    groups
      .filter((group) =>
        ["recognize", "read_fluently", "pronounce"].includes(String(group.purpose ?? "")),
      )
      .flatMap((group) => Array.isArray(group.words) ? group.words : []),
  );
}

function wordListFromPendingHomework(
  hw: NonNullable<ChildProfile["pendingHomework"]> | undefined,
): string[] {
  return uniqueWords([
    ...(Array.isArray(hw?.wordList) ? hw.wordList : []),
    ...(Array.isArray(hw?.capturedContent?.words) ? hw.capturedContent.words : []),
    ...(Array.isArray(hw?.capturedContent?.wordGroups)
      ? hw.capturedContent.wordGroups.flatMap((group: HomeworkTargetGroupForMap) =>
          Array.isArray(group.words) ? group.words : [],
        )
      : []),
  ]);
}

function buildActivityIntentEvidenceForLaunch(
  childId: string,
  node: NodeConfig,
  hw: NonNullable<ChildProfile["pendingHomework"]> | undefined,
): ActivityIntentEvidence {
  const homeworkWords = wordListFromPendingHomework(hw);
  const highFrequencyWords = heldFluencyTargetsFromHomework(hw);
  const reinforceWords = uniqueWords([
    ...(Array.isArray(hw?.reinforceWords) ? hw.reinforceWords : []),
    ...(node.words ?? []),
  ]);
  let dueWords: string[] = [];
  try {
    const bank = readWordBank(childId);
    dueWords = uniqueWords(
      (Array.isArray(bank?.words) ? bank.words : [])
        .filter((entry) => {
          const record = entry as unknown as Record<string, unknown>;
          const nextReview = String(record.nextReviewAt ?? record.dueAt ?? "").trim();
          return !nextReview || Date.parse(nextReview) <= Date.now();
        })
        .map((entry) => entry?.word),
    );
  } catch {
    dueWords = [];
  }
  return {
    recentMisses: reinforceWords,
    fragileTargets: reinforceWords,
    scaffoldedTargets: reinforceWords,
    pronunciationConfusions: node.type === "pronunciation" ? reinforceWords : [],
    sm2DueWords: dueWords,
    homeworkWords,
    highFrequencyWords,
    carePlanTargets: reinforceWords,
  };
}

function nodeWithActivityIntent(
  childId: string,
  node: NodeConfig,
  hw: NonNullable<ChildProfile["pendingHomework"]> | undefined,
): NodeConfig {
  const evidence = buildActivityIntentEvidenceForLaunch(childId, node, hw);
  const hwRecord = hw as unknown as Record<string, unknown>;
  const interpretation = hw?.capturedContent?.assignmentInterpretation as
    | (Record<string, unknown> & { hypothesis?: unknown })
    | undefined;
  const carePlanHypothesis =
    String(
      hwRecord.carePlanHypothesis ??
        interpretation?.hypothesis ??
        "Use chart evidence to choose a spelling instrument and update the next plan.",
    ).trim();
  const intent = buildActivityIntent({
    childId,
    node,
    carePlanHypothesis,
    evidence,
  });
  const selectorDecision = selectTargetsForIntent({
    childId,
    node,
    targetSelector: intent.targetSelector,
    evidence,
    maxTargets: node.type === "wheel-of-fortune" ? 1 : undefined,
  });
  const selectedWords = selectorDecision.selectedTargets;
  const nextNode: NodeConfig = {
    ...node,
    activityIntent: intent,
    targetSelectorDecision: {
      selectorId: selectorDecision.selectorId,
      activityId: selectorDecision.activityId,
      nodeId: selectorDecision.nodeId,
      targetSelector: selectorDecision.targetSelector,
      selectedTargets: selectorDecision.selectedTargets,
      traceSummary: selectorDecision.traceSummary,
    },
  };
  if (selectedWords.length > 0 && node.words?.length) {
    nextNode.words = selectedWords;
  }
  if (selectedWords.length > 0 && node.wordRadarItems?.length) {
    const selected = new Set(selectedWords.map((word) => word.toLowerCase()));
    const selectedItems = node.wordRadarItems.filter((item) =>
      selected.has(item.display.toLowerCase()),
    );
    if (selectedItems.length > 0) nextNode.wordRadarItems = selectedItems;
  }
  console.log(
    `🎮 [activity-intent] [created] child=${childId} node=${node.id} activity=${node.type} intent=${intent.intentId} selector=${selectorDecision.selectorId}`,
  );
  console.log(`🎮 [target-selector] [decision] ${selectorDecision.traceSummary}`);
  return nextNode;
}

function resultAccuracy01(result: NodeResult): number {
  return result.accuracy > 1 ? result.accuracy / 100 : result.accuracy;
}

function resultTargetCount(result: NodeResult): number {
  return Math.max(
    result.wordsAttempted,
    result.targetResults?.length ?? 0,
    (result.correctWords?.length ?? 0) + (result.missedWords?.length ?? 0),
  );
}

function domainForNodeEvidence(
  childId: string,
  node: NodeConfig,
  result: NodeResult,
): string {
  if (result.purpose === "attention_screening" || isAttentionScreeningNodeType(node.type)) {
    return "attention";
  }
  try {
    const lp = readLearningProfile(childId);
    const contentProfile = lp?.pendingHomework?.contentProfile ??
      lp?.pendingHomework?.capturedContent?.contentProfile;
    const domain = String(contentProfile?.practiceDomain ?? "").trim();
    if (domain) return domain;
  } catch {
    // best-effort evidence metadata only
  }
  if (isWordDrivenHomeworkNodeType(node.type)) return "spelling";
  if (node.type === "mystery") return "reward";
  return "general";
}

function deriveEngagementScores(
  node: NodeConfig,
  result: NodeResult,
  rating: NodeRatingLike,
): { engagementScore: number; frustrationScore: number } {
  const accuracy = resultAccuracy01(result);
  const targetCount = resultTargetCount(result);
  const fastEnough =
    targetCount > 0 ? result.timeSpent_ms / targetCount <= 12_000 : false;
  const frustrationSignals = Array.isArray(result.vitalSigns?.frustrationSignals)
    ? result.vitalSigns.frustrationSignals.length
    : 0;
  const highFrustration =
    frustrationSignals > 0 || !result.completed || accuracy < 0.5;
  const engagementScore = Math.max(
    0,
    Math.min(
      1,
      (rating === "like" ? 0.55 : 0.2) +
        (result.completed ? 0.2 : 0) +
        (accuracy >= 0.85 ? 0.15 : 0) +
        (fastEnough ? 0.1 : 0) +
        (node.type === "mystery" && result.completed ? 0.05 : 0),
    ),
  );
  const frustrationScore = Math.max(
    0,
    Math.min(
      1,
      highFrustration
        ? 0.75
        : accuracy < 0.7
          ? 0.45
          : rating === "dislike"
            ? 0.55
            : 0.1,
    ),
  );
  return { engagementScore, frustrationScore };
}

function nodeContentId(node: NodeConfig): string | undefined {
  return node.contentId ?? node.adaptiveArtifact?.contentId;
}

function evidenceFromNodeResult(
  childId: string,
  node: NodeConfig,
  result: NodeResult,
  rating: NodeRatingLike,
): ActivityEvidence {
  const scores = deriveEngagementScores(node, result, rating);
  return {
    activityId: result.activityId ?? node.type,
    domain: domainForNodeEvidence(childId, node, result),
    completed: result.completed,
    accuracy: resultAccuracy01(result),
    targetCount: resultTargetCount(result),
    timeSpent_ms: result.timeSpent_ms,
    engagementScore: scores.engagementScore,
    frustrationScore: scores.frustrationScore,
    liked: rating === "like",
    missedWords: result.missedWords ?? [],
    evidenceTier: result.evidenceTier,
    occurredAt: new Date().toISOString(),
    ...(nodeContentId(node) ? { contentId: nodeContentId(node) } : {}),
  };
}

function writePostNodeLearningEvidence(
  childId: string,
  node: NodeConfig,
  result: NodeResult,
  rating: NodeRatingLike,
): void {
  const evidence = evidenceFromNodeResult(childId, node, result, rating);
  try {
    appendChildActivityEvidence(childId, evidence);
    if (evidence.contentId) {
      updateContentCatalogFromActivityEvidence(childId, evidence);
    }
    console.log(
      `  🎮 [adaptive-evidence] recorded activity=${evidence.activityId} domain=${evidence.domain} targets=${evidence.targetCount ?? 0}`,
    );
  } catch (err) {
    console.error("  🔴 [adaptive-evidence] record failed:", err);
  }
}

function writeLearningExperimentResult(
  childId: string,
  node: NodeConfig,
  result: NodeResult,
): void {
  const experimentId = node.adaptiveArtifact?.experimentId;
  if (!experimentId) return;
  try {
    const profile = readLearningProfile(childId);
    if (!profile) return;
    const updated = recordLearningExperimentResult(profile, {
      experimentId,
      source: node.type,
      accuracy: result.accuracy,
      completed: result.completed,
      wordsAttempted: result.wordsAttempted,
      timeSpent_ms: result.timeSpent_ms,
    });
    if (updated !== profile) {
      writeLearningProfile(childId, updated);
      console.log(
        `  🎮 [learning-experiment] recorded ${node.type} ${experimentId} accuracy=${result.accuracy}`,
      );
    }
  } catch (err) {
    console.error("  🔴 [learning-experiment] record failed:", err);
  }
}

function attemptDomainForMapNode(node: NodeConfig): "spelling" | "reading" | "math" {
  if (node.type === "pronunciation" || node.type === "karaoke") return "reading";
  if (node.type === "clock-game" || node.type === "coin-counter") return "math";
  return "spelling";
}

function recordMapTargetAttempts(
  childId: string,
  sessionId: string,
  node: NodeConfig,
  result: NodeResult,
): void {
  const rows = result.targetResults ?? [];
  if (rows.length === 0) return;
  const domain = attemptDomainForMapNode(node);
  rows.forEach((row, idx) => {
    const target = String(row.target ?? "").trim();
    if (!target) return;
    try {
      recordLearningAttempt({
        attemptId: `${sessionId}:${node.id}:${idx}:${target.toLowerCase()}`,
        childId,
        sessionId,
        target,
        domain,
        correct: row.correct,
        quality: row.correct ? 4 : 1,
        scaffoldLevel: row.scaffoldLevel ?? (node.type === "pronunciation" ? 0 : 1),
        attemptedValue: row.attemptedValue,
        responseTimeMs: row.responseTime_ms,
      });
    } catch (err) {
      console.error(`  🔴 [map-attempt] record failed for "${target}":`, err);
    }
  });
}

function writeExplicitRatingEvidence(
  childId: string,
  node: NodeConfig,
  rating: "like" | "dislike" | null,
): void {
  const liked = rating === "like";
  const evidence: ActivityEvidence = {
    activityId: node.type,
    domain: domainForNodeEvidence(childId, node, {
      nodeId: node.id,
      completed: liked,
      accuracy: liked ? 1 : 0,
      timeSpent_ms: 0,
      wordsAttempted: 0,
    }),
    completed: liked,
    accuracy: liked ? 1 : 0,
    targetCount: 0,
    timeSpent_ms: 0,
    engagementScore: liked ? 0.9 : 0.15,
    frustrationScore: liked ? 0.05 : 0.75,
    liked: rating === null ? null : liked,
    missedWords: [],
    occurredAt: new Date().toISOString(),
    ...(nodeContentId(node) ? { contentId: nodeContentId(node) } : {}),
  };
  try {
    appendChildActivityEvidence(childId, evidence);
    if (evidence.contentId) updateContentCatalogFromActivityEvidence(childId, evidence);
    console.log(
      `  🎮 [adaptive-evidence] explicit_rating activity=${node.type} rating=${rating ?? "skip"}`,
    );
  } catch (err) {
    console.error("  🔴 [adaptive-evidence] explicit rating failed:", err);
  }
}

function shouldExpandPronunciationFromResult(
  completedNode: NodeConfig,
  result: NodeResult,
): boolean {
  if (!result.completed) return false;
  if (
    completedNode.type !== "spell-check" &&
    completedNode.type !== "monster-stampede" &&
    completedNode.type !== "letter-rush" &&
    completedNode.type !== "wordle" &&
    completedNode.type !== "wheel-of-fortune"
  ) {
    return false;
  }
  return resultAccuracy01(result) >= 0.85 && resultTargetCount(result) >= 3;
}

function expandFuturePronunciationNodesFromHomework(
  nodes: NodeConfig[],
  completedNode: NodeConfig,
  result: NodeResult,
  hw: NonNullable<ChildProfile["pendingHomework"]> | undefined,
): number {
  if (!shouldExpandPronunciationFromResult(completedNode, result)) return 0;
  const heldTargets = heldFluencyTargetsFromHomework(hw).slice(0, 10);
  if (heldTargets.length === 0) return 0;
  const completedIdx = nodes.findIndex((node) => node.id === completedNode.id);
  if (completedIdx < 0) return 0;

  let expanded = 0;
  for (let i = completedIdx + 1; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (node.type !== "pronunciation" || node.isCompleted) continue;
    const current = uniqueWords(node.words ?? []);
    if (current.length >= heldTargets.length) continue;
    node.words = [...heldTargets];
    expanded += 1;
  }
  if (expanded > 0) {
    console.log(
      `  🎮 [adaptive-cohort] pronunciation expanded nodes=${expanded} targets=${heldTargets.length}`,
    );
  }
  return expanded;
}

function nodePracticeTargets(node: NodeConfig): string[] {
  const fromRadar = (node.wordRadarItems ?? [])
    .map((item) => item.display)
    .filter(Boolean);
  return fromRadar.length > 0 ? fromRadar : [...(node.words ?? [])];
}

function wordRadarItemsForTargets(
  node: NodeConfig,
  targets: string[],
): NonNullable<NodeConfig["wordRadarItems"]> {
  const normalized = new Set(targets.map((word) => word.trim().toLowerCase()));
  const existing = (node.wordRadarItems ?? []).filter((item) =>
    normalized.has(item.display.trim().toLowerCase()),
  );
  if (existing.length > 0 || targets.length === 0) return existing;
  return targets.map((word) => ({
    display: word,
    acceptedResponses: [word.toLowerCase()],
    label: "Practice",
  }));
}

function retargetFuturePracticeNodes(
  nodes: NodeConfig[],
  completedNode: NodeConfig,
  result: NodeResult,
): {
  skippedPracticeNodeIds: string[];
  changedNodeIds: string[];
  nextTargets: string[];
  reason: string;
} {
  if (!isWordDrivenHomeworkNodeType(completedNode.type)) {
    return {
      skippedPracticeNodeIds: [],
      changedNodeIds: [],
      nextTargets: [],
      reason: "completed node was not a word-driven homework activity",
    };
  }
  const evidenceRows = result.targetResults ?? [];
  const hasFallbackEvidence =
    (result.correctWords?.length ?? 0) > 0 || (result.missedWords?.length ?? 0) > 0;
  if (evidenceRows.length === 0 && !hasFallbackEvidence) {
    return {
      skippedPracticeNodeIds: [],
      changedNodeIds: [],
      nextTargets: [],
      reason: "no target-level evidence was available",
    };
  }

  const plan = selectTargetedPracticePlan({
    nodeId: result.nodeId,
    nodeType: completedNode.type,
    targets: nodePracticeTargets(completedNode),
    correctWords: result.correctWords,
    missedWords: result.missedWords,
    targetResults: evidenceRows,
  });
  if (plan.status !== "ready") {
    return {
      skippedPracticeNodeIds: [],
      changedNodeIds: [],
      nextTargets: [],
      reason: `targeted practice selector returned ${plan.status}`,
    };
  }

  const completedIdx = nodes.findIndex((node) => node.id === completedNode.id);
  if (completedIdx < 0) {
    return {
      skippedPracticeNodeIds: [],
      changedNodeIds: [],
      nextTargets: [],
      reason: "completed node was not found in the active board",
    };
  }
  let updatedCount = 0;
  const skippedNodeIds: string[] = [];
  const changedNodeIds: string[] = [];
  for (let i = completedIdx + 1; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (!isRetargetablePracticeNodeType(node.type)) continue;
    node.words = [...plan.nextTargets];
    changedNodeIds.push(node.id);
    if (node.type === "word-radar") {
      node.wordRadarItems = wordRadarItemsForTargets(node, plan.nextTargets);
    }
    if (plan.nextTargets.length === 0 && plan.masteredTargets.length > 0) {
      skippedNodeIds.push(node.id);
    }
    updatedCount += 1;
  }
  if (updatedCount > 0) {
    console.log(
      `  🎮 [targeted-practice] retargeted ${updatedCount} future node(s) after ${completedNode.type}: ${plan.nextTargets.join(", ") || "none"}`,
    );
  }
  if (skippedNodeIds.length > 0) {
    console.log(
      `  🎮 [targeted-practice] skipped ${skippedNodeIds.length} empty practice node(s) after mastered baseline`,
    );
  }
  return {
    skippedPracticeNodeIds: skippedNodeIds,
    changedNodeIds,
    nextTargets: plan.nextTargets,
    reason:
      changedNodeIds.length > 0
        ? `future practice retargeted from ${completedNode.type} evidence`
        : "no future retargetable practice nodes remained",
  };
}

/** Adventure map path from `ChildProfile.pendingHomework` (via `buildProfile`). Exported for tests. */
export function pendingHomeworkToNodeConfigs(
  hw: NonNullable<ChildProfile["pendingHomework"]>,
  dueWords: string[],
): NodeConfig[] {
  const words = dueWords.length ? dueWords : hw.wordList;
  return hw.nodes.map((node, i, arr) => {
    const persistedWords = Array.isArray(node.words) ? node.words : [];
    const nodeWords =
      isWordDrivenHomeworkNodeType(node.type) &&
      words.length > persistedWords.length &&
      persistedWords.length > 0 &&
      persistedWords.every((word) =>
        words.some((candidate) => normalizedWordKey(candidate) === normalizedWordKey(word)),
      )
        ? words
        : persistedWords.length > 0
          ? persistedWords
          : words;
    const persistedItems = (node as { wordRadarItems?: NodeConfig["wordRadarItems"] })
      .wordRadarItems;
    const wordRadarItems =
      node.type === "word-radar"
        ? Array.isArray(persistedItems) && persistedItems.length >= nodeWords.length
          ? persistedItems
          : nodeWords.map((w) => ({
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
            ? nodeWords
            : [],
      wordRadarItems,
      difficulty: clampNodeDifficulty(node.difficulty),
      gameFile: node.gameFile ?? undefined,
      storyFile: node.storyFile ?? undefined,
      storyText: node.storyText,
      storyTitle: node.storyTitle,
      storyImagePrompt: node.storyImagePrompt,
      activityConfigPath: node.activityConfigPath,
      contentId: node.adaptiveArtifact?.contentId,
      adaptiveArtifact: node.adaptiveArtifact,
      artifactStatus: node.adaptiveArtifact ? "ready" : undefined,
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

function sanitizePendingHomeworkForLaunch(
  hw: NonNullable<ChildProfile["pendingHomework"]>,
): NonNullable<ChildProfile["pendingHomework"]> {
  const gate = createHomeworkEvidenceGate(hw);
  if (!gate) return hw;
  const reinforceWords = filterHomeworkTargets(
    gate,
    hw.reinforceWords ?? [],
    { logPrefix: "  🎮" },
  ).accepted;
  return {
    ...hw,
    reinforceWords,
    nodes: hw.nodes.map((node) => {
      const next = { ...node };
      if (Array.isArray(next.words) && next.words.length > 0 && next.type !== "karaoke") {
        next.words = filterHomeworkTargets(gate, next.words, { logPrefix: "  🎮" }).accepted;
      }
      const items = (next as { wordRadarItems?: NodeConfig["wordRadarItems"] }).wordRadarItems;
      if (Array.isArray(items) && items.length > 0) {
        const accepted = filterHomeworkTargets(
          gate,
          items.map((item) => item.display),
          { logPrefix: "  🎮" },
        ).accepted;
        const acceptedKeys = new Set(accepted.map((word) => normalizedWordKey(word)));
        (next as { wordRadarItems?: NodeConfig["wordRadarItems"] }).wordRadarItems = items.filter((item) =>
          acceptedKeys.has(normalizedWordKey(item.display)),
        );
      }
      return next;
    }),
  };
}

function displayChildNameForNarration(childId: string): string {
  const clean = childId.trim();
  if (!clean) return "Friend";
  return clean
    .split(/([_-]+)/)
    .map((part) =>
      /^[a-z]/.test(part)
        ? `${part.charAt(0).toUpperCase()}${part.slice(1)}`
        : part,
    )
    .join("");
}

function nodeHidesLaunchTarget(node: NodeConfig): boolean {
  const gameFile = String(node.gameFile ?? "").toLowerCase();
  if (node.type === "word-radar") {
    return node.wordRadarConfig?.requiresCapturedResponse !== false;
  }
  return node.type === "wheel-of-fortune" ||
    (node.type === "mystery" && gameFile.includes("wheel"));
}

export function gameMountGreetingForNode(childId: string, node: NodeConfig): string {
  const target =
    node.words?.[0] ??
    node.wordRadarItems?.[0]?.display ??
    node.storyTitle ??
    node.type;
  const label = node.type.replace(/-/g, " ");
  if (nodeHidesLaunchTarget(node)) {
    return `${displayChildNameForNarration(childId)}, ${label} is ready.`;
  }
  return `${displayChildNameForNarration(childId)}, ${label} is ready. First target: ${target}.`;
}

/** Static theme — no Grok / designer image pipeline (`isDiagMapMode()` / diag map session). */
function diagSessionTheme(): SessionTheme {
  const accent = "#1a56db";
  const mapPathPreset = "rising-curve";
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
    mapPathPreset,
    mapWaypoints: [...MAP_PATH_PRESETS[mapPathPreset]],
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
  sessions.set(sessionId, { childId: "creator", mapState, runtime, greetedNodeIds: new Set() });
  return { sessionId, mapState };
}

/** Map overview for companion prompts (exported for tests). */
export function buildMapSummary(mapState: MapState): string {
  return buildMapSummaryFromPendingNodes(mapState.nodes);
}

/** Spelling homework baseline order through wheel, then mystery, then quest/boss. */
const HOMEWORK_NODE_ORDER = [
  "concept-check",
  "word-radar",
  "spell-check",
  "monster-stampede",
  "letter-rush",
  "pronunciation",
  "karaoke",
  "word-builder",
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

function adaptiveHomeworkCohortSize(
  childId: string,
  domain: string,
  fallback: number,
): number {
  try {
    const lp = readLearningProfile(childId);
    const learned = lp?.adaptiveLoadState?.[domain]?.currentCohortSize;
    if (typeof learned !== "number" || !Number.isFinite(learned)) return fallback;
    return Math.max(1, Math.min(10, Math.floor(learned)));
  } catch {
    return fallback;
  }
}

function banditValueForNode(childId: string, node: NodeConfig): number {
  let score = 0;
  try {
    const state = getBanditState(childId);
    const idx = state.armOrder.indexOf(node.type);
    if (idx >= 0) score += state.values[idx] ?? 0;
  } catch {
    // best-effort ranking only
  }
  try {
    const model = readLearningProfile(childId)?.activityModel?.[node.type];
    if (model) {
      score += model.engagementScore;
      score += model.completionRate * 0.5;
      score -= model.frustrationScore;
      score -= (model.dislikedCount ?? 0) * 0.2;
      score += (model.likedCount ?? 0) * 0.2;
    }
  } catch {
    // best-effort ranking only
  }
  return score;
}

function rankEquivalentHomeworkNodes(childId: string, nodes: NodeConfig[]): NodeConfig[] {
  const challengerTypes = new Set<NodeType>([
    "letter-rush",
    "monster-stampede",
    "wordle",
    "wheel-of-fortune",
  ]);
  const challengers = nodes
    .filter((node) => challengerTypes.has(node.type))
    .sort((a, b) => banditValueForNode(childId, b) - banditValueForNode(childId, a));
  if (challengers.length <= 1) return nodes;
  let challengerIdx = 0;
  return nodes.map((node) =>
    challengerTypes.has(node.type) ? { ...challengers[challengerIdx++]! } : node,
  );
}

function hasPlayableAdaptiveArtifact(node: NodeConfig | undefined): boolean {
  return node ? hasPlayableMasteryArtifact(node) : false;
}

function pendingMasteryState(node: NodeConfig | undefined): NodeConfig["masteryUnlockState"] {
  if (!node) return "teased_locked";
  if (hasPlayableAdaptiveArtifact(node)) return "pending_ceremony";
  return "preparing";
}

function revealPendingMasteryUnlock(
  state: MapState,
  completedNode: NodeConfig,
): NodeConfig | null {
  if (completedNode.type === "quest" || completedNode.type === "boss") return null;
  const target = state.nodes.find(
    (node) =>
      (node.type === "quest" || node.type === "boss") &&
      node.masteryUnlockState === "pending_ceremony" &&
      hasPlayableAdaptiveArtifact(node),
  );
  if (!target) return null;
  target.masteryUnlockState = "unlocked";
  target.isLocked = false;
  console.log(
    `  🎮 [adaptive-unlock] [revealed] child=${state.childId} node=${target.type} after=${completedNode.id}`,
  );
  return target;
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

type HomeworkForActivityValidation = NonNullable<ChildProfile["pendingHomework"]> & {
  homeworkId?: string;
};

function normalizeActivityDomain(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function homeworkDomainEvidence(hw: HomeworkForActivityValidation): DomainEvidence {
  const interpretation = hw.capturedContent?.assignmentInterpretation;
  const selectedTargets = Array.isArray(interpretation?.selectedTargets)
    ? interpretation.selectedTargets
    : [];
  const heldTargets = Array.isArray(interpretation?.heldTargets)
    ? interpretation.heldTargets as Array<{ purpose?: unknown }>
    : [];
  const recognitionOnly =
    interpretation?.status === "ready" &&
    selectedTargets.length === 0 &&
    heldTargets.length > 0 &&
    heldTargets.every((group) =>
      ["recognize", "read_fluently", "pronounce"].includes(String(group.purpose ?? "")),
    );
  if (recognitionOnly) {
    return {
      practiceDomain: "pronunciation",
      contentDomain: hw.contentProfile?.contentDomain ?? hw.capturedContent?.contentProfile?.contentDomain ?? "language_arts",
      primarySkill: "recognition_fluency",
      confidence: 0.9,
      source: "assignment_interpretation",
    };
  }
  const profile = hw.contentProfile ?? hw.capturedContent?.contentProfile ?? null;
  if (profile) {
    return {
      practiceDomain: profile.practiceDomain,
      contentDomain: profile.contentDomain,
      primarySkill: profile.primarySkill,
      confidence: 0.9,
      source: "captured_homework_profile",
    };
  }

  const homeworkId = normalizeActivityDomain(hw.homeworkId ?? hw.weekOf);
  if (homeworkId.includes("spelling")) {
    return {
      practiceDomain: "spelling",
      contentDomain: "spelling",
      primarySkill: "spelling_recall",
      confidence: 0.82,
      source: "homework_id",
    };
  }

  return {
    practiceDomain: "unknown",
    contentDomain: "unknown",
    primarySkill: "unknown",
    confidence: 0.25,
    source: "fallback",
  };
}

function evidenceIsHighConfidenceSpelling(evidence: DomainEvidence): boolean {
  return evidence.confidence >= 0.75 &&
    (
      normalizeActivityDomain(evidence.practiceDomain) === "spelling" ||
      normalizeActivityDomain(evidence.contentDomain) === "spelling" ||
      normalizeActivityDomain(evidence.primarySkill).includes("spell")
    );
}

function activityNodeForMapNode(
  node: NodeConfig,
  idx: number,
  evidence: DomainEvidence,
): ActivityPlanNode {
  const highConfidenceSpelling = evidenceIsHighConfidenceSpelling(evidence);
  const baselineSpellCheck = highConfidenceSpelling && idx === 0 && node.type === "spell-check";
  const letterRushEvaluator =
    node.type === "letter-rush" &&
    (
      node.activityConfigPath?.includes("baseline") ||
      node.activityConfigPath?.includes("mastery")
    );
  const toolId = baselineSpellCheck ? "spelling-recall" : node.type;
  const purpose =
    baselineSpellCheck
      ? "evaluate"
      : node.type === "concept-check"
        ? "evaluate"
        : letterRushEvaluator
        ? "evaluate"
        : node.type === "letter-rush"
          ? "practice"
          : node.type === "word-radar" ||
              node.type === "wheel-of-fortune" ||
              node.type === "monster-stampede"
            ? "practice"
            : node.type === "mystery"
              ? "reward"
              : node.type === "karaoke" || node.type === "word-builder" || node.type === "pronunciation"
                ? "guided-practice"
                : node.type === "spell-check"
                  ? "evaluate"
                  : node.type;

  return {
    id: node.id,
    toolId,
    purpose,
    writesMasteryEvidence: baselineSpellCheck || letterRushEvaluator ? true : undefined,
    emitsPerTargetResults:
      baselineSpellCheck ||
      node.type === "concept-check" ||
      node.type === "letter-rush" ||
      node.type === "word-radar" ||
      node.type === "spell-check" ||
      node.type === "word-builder" ||
      node.type === "pronunciation" ||
      node.type === "wheel-of-fortune",
  };
}

function logActivityPlanValidation(
  childId: string,
  validation: ActivityPlanValidationResult,
): void {
  for (const warning of validation.warnings) {
    console.warn(
      `🎮 [activity-plan] warning child=${childId} code=${warning.code} node=${warning.nodeId ?? "plan"} tool=${warning.toolId ?? "plan"} recommendation=${warning.recommendation ?? "none"}`,
    );
  }
  for (const blocker of validation.blockers) {
    console.error(
      `🔴 [activity-plan] blocker child=${childId} code=${blocker.code} node=${blocker.nodeId ?? "plan"} tool=${blocker.toolId ?? "plan"} recommendation=${blocker.recommendation ?? "none"}`,
    );
  }
}

function withGoalFlags(nodes: NodeConfig[]): NodeConfig[] {
  return nodes.map((node, idx) => ({
    ...node,
    isGoal: idx === nodes.length - 1,
  }));
}

export function repairBlockedHomeworkMapActivityPlan(
  childId: string,
  hw: HomeworkForActivityValidation,
  nodes: NodeConfig[],
  validation: ActivityPlanValidationResult,
): NodeConfig[] | null {
  const needsSpellingRecall = validation.blockers.some(
    (blocker) => blocker.code === "high_confidence_spelling_requires_independent_recall",
  );
  if (!needsSpellingRecall) return null;

  const recallIdx = nodes.findIndex((node) =>
    node.type === "spell-check" ||
    (
      node.type === "letter-rush" &&
      (
        node.activityConfigPath?.includes("baseline") ||
        node.activityConfigPath?.includes("mastery")
      )
    ),
  );

  if (recallIdx >= 0) {
    const repaired = [...nodes];
    const [recallNode] = repaired.splice(recallIdx, 1);
    if (!recallNode) return null;
    repaired.unshift({
      ...recallNode,
      isLocked: false,
      isCompleted: false,
    });
    console.warn(
      `🎮 [activity-plan] [repair] child=${childId} action=move-independent-recall-first node=${recallNode.id}`,
    );
    return withGoalFlags(repaired);
  }

  const words = hw.wordList.slice(0, 5);
  if (words.length === 0) return null;
  const fallbackNode: NodeConfig = {
    id: `n-spell-check-${hw.homeworkId ?? hw.weekOf ?? "homework"}-repair`,
    type: "spell-check",
    words,
    difficulty: 1,
    gameFile: undefined,
    storyFile: undefined,
    isLocked: false,
    isCompleted: false,
    isGoal: false,
    thumbnailPrompt: NODE_THUMBNAIL_PROMPTS["spell-check"],
  };
  console.warn(
    `🎮 [activity-plan] [repair] child=${childId} action=insert-independent-recall node=${fallbackNode.id}`,
  );
  return withGoalFlags([fallbackNode, ...nodes]);
}

function validateHomeworkMapActivityPlan(
  childId: string,
  hw: HomeworkForActivityValidation,
  nodes: NodeConfig[],
): NodeConfig[] {
  const evidence = homeworkDomainEvidence(hw);
  const validation = validateActivityPlan({
    learnerState: "unknown",
    domainEvidence: evidence,
    nodes: nodes.map((node, idx) => activityNodeForMapNode(node, idx, evidence)),
  });
  logActivityPlanValidation(childId, validation);
  if (!validation.ok) {
    const repaired = repairBlockedHomeworkMapActivityPlan(childId, hw, nodes, validation);
    if (repaired) {
      const repairedValidation = validateActivityPlan({
        learnerState: "unknown",
        domainEvidence: evidence,
        nodes: repaired.map((node, idx) => activityNodeForMapNode(node, idx, evidence)),
      });
      logActivityPlanValidation(childId, repairedValidation);
      if (repairedValidation.ok) return repaired;
    }
    throw new MapSessionError(
      "activity_plan_unavailable",
      422,
    );
  }
  return nodes;
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
  if (runtime.subject === "homework") {
    const homeworkChildId = String(runtime.childId ?? childId).toLowerCase();
    if (readLearningProfile(homeworkChildId)) {
      ensureFreshPendingHomework(homeworkChildId, {
        domain: runtime.homeworkDomain ?? undefined,
      });
    } else {
      console.warn(
        `🎮 [homeworkSelector] [skip] no learning profile for child=${homeworkChildId}`,
      );
    }
  }
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
    const hw = sanitizePendingHomeworkForLaunch(profile.pendingHomework);
    profile.pendingHomework = hw;
    let chartPlannedNodes: NodeConfig[] | null = null;
    let parentApprovedChartPlan = false;
    try {
      const chart = getChildChart(childId);
      const chartHomeworkId =
        chart.homework.pending?.homeworkId ?? chart.homework.pending?.weekOf;
      if (chartHomeworkId !== homeworkId) {
        throw new Error(
          `chart homework mismatch chart=${chartHomeworkId ?? "none"} profile=${homeworkId}`,
        );
      }
      if (!chart.homework.pending) {
        throw new Error("chart pending homework missing");
      }
      let activeSessionPlan = chart.activeSessionPlan;
      const refreshReason = activeSessionPlanRefreshReason(
        activeSessionPlan,
        chart.homework.pending,
      );
      if (refreshReason) {
        const plannerInput = buildExperiencePlannerInput(chart);
        const priorApproved =
          activeSessionPlan?.approvalStatus === "approved" &&
          Boolean(activeSessionPlan.parentNote?.trim());
        activeSessionPlan = draftPsychologistExperiencePlan(plannerInput, {
          parentNote: activeSessionPlan?.parentNote,
        });
        if (priorApproved) {
          activeSessionPlan = {
            ...activeSessionPlan,
            approvalStatus: "approved",
            parentNote: activeSessionPlan.parentNote,
          };
        }
        writeActiveSessionPlan(chart.childId, activeSessionPlan);
        console.log(
          `🎮 [experience-planner] [fallback] child=${chart.childId} reason=${refreshReason} homework=${activeSessionPlan.activeHomeworkId ?? "none"} confidence=${activeSessionPlan.plannerConfidence ?? "unknown"}`,
        );
      } else if (activeSessionPlan) {
        console.log(
          `🎮 [experience-planner] [active] child=${chart.childId} plan=${activeSessionPlan.planId} status=${activeSessionPlan.approvalStatus ?? "unknown"}`,
        );
      } else {
        throw new Error("experience planner did not produce an active session plan");
      }
      if (!activeSessionPlan) {
        throw new Error("experience planner did not produce an active session plan");
      }
      parentApprovedChartPlan =
        activeSessionPlan.approvalStatus === "approved" &&
        Boolean(activeSessionPlan.parentNote?.trim());
      chartPlannedNodes = sanitizeActiveHomeworkPlanForLaunch(hw, buildAdventureMapFromSessionPlan(chart, activeSessionPlan, {
        dopamineGames: getDopamineGameSlugsForChild(childId),
      }));
      const mystery = chartPlannedNodes.find((node) => node.type === "mystery");
      if (mystery?.surpriseOption?.activityKind === "dopamine_game") {
        registerMysteryGameForSessionFinalize(childId, mystery.surpriseOption.activityId);
      } else if (mystery?.choiceOptions?.length) {
        const fallback = mystery.choiceOptions.find((option) => option.activityKind === "dopamine_game");
        if (fallback?.activityId) registerMysteryGameForSessionFinalize(childId, fallback.activityId);
      }
      console.log(
        `🎮 [chart-plan] [map] nodes=${chartPlannedNodes.map((node) => node.type).join(",")}`,
      );
    } catch (err) {
      console.warn(
        "🎮 [chart-plan] [fallback-legacy]",
        err instanceof Error ? err.message : String(err),
      );
      chartPlannedNodes = null;
    }
    if (chartPlannedNodes?.length) {
      if (parentApprovedChartPlan) {
        console.log(
          `🎮 [activity-plan] [parent-approved] child=${profile.childId} action=skip-silent-repair`,
        );
        nodes = withGoalFlags(chartPlannedNodes);
      } else {
        nodes = validateHomeworkMapActivityPlan(profile.childId, hw, chartPlannedNodes);
      }
    } else {
    const sm2Plan = homeworkOnlySelectionPlan(childId);
    const bank = readWordBank(childId);
    const reinforce = hw.reinforceWords ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const configuredMaxWords =
      profile.games?.["word-radar"]?.maxWords ??
      profile.games?.["spell-check"]?.maxWords ??
      5;
    const homeworkPracticeDomain =
      profile.pendingHomework?.contentProfile?.practiceDomain ??
      profile.pendingHomework?.capturedContent?.contentProfile?.practiceDomain ??
      "spelling";
    const maxWords = adaptiveHomeworkCohortSize(
      childId,
      String(homeworkPracticeDomain).trim().toLowerCase() || "spelling",
      configuredMaxWords,
    );
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
        const domain = lp ? selectedHomeworkDomain(lp) ?? inferHomeworkDomainFromPending(lp.pendingHomework) : undefined;
        if (lp && domain && lp.pendingHomework?.reinforceWords?.length) {
          patchActiveHomeworkLane(childId, domain, (pending) => ({
            ...pending,
            reinforceWords: [],
          }));
        }
      } catch (err) {
        console.error("  🔴 [map-coordinator] clear reinforceWords failed:", err);
      }
    }
    const allHomeworkNodes = pendingHomeworkToNodeConfigs(hw, sessionWords);
    const readyGeneratedQuest = allHomeworkNodes.find(
      (node) => node.type === "quest" && hasPlayableAdaptiveArtifact(node),
    );
    const readyGeneratedBoss = allHomeworkNodes.find(
      (node) => node.type === "boss" && hasPlayableAdaptiveArtifact(node),
    );
    const rawBaseline = allHomeworkNodes.filter(
      (node) =>
        node.type !== "quest" &&
        node.type !== "boss" &&
        node.type !== "mystery",
    );
    const baselineOrdered = rankEquivalentHomeworkNodes(
      childId,
      orderHomeworkBaselineNodes(rawBaseline),
    );
    const mysterySlug = selectMysteryGame(childId);
    const mysteryGameFile = `${mysterySlug}.html`;
    let learningProfileForMystery = null;
    try {
      learningProfileForMystery = readLearningProfile(childId);
    } catch {
      learningProfileForMystery = null;
    }
    const mysteryChoice = buildMysteryChoiceNodeData({
      childId,
      nodeId: `n-mystery-${homeworkId}`,
      domain: String(homeworkPracticeDomain).trim().toLowerCase() || "spelling",
      words: pendingHandoffMissedWords,
      profile: learningProfileForMystery,
      dopamineGames: getDopamineGameSlugsForChild(childId),
      domainValidNodes: baselineOrdered,
    });
    if (mysteryChoice.mysteryMode === "surprise_drop" && mysteryChoice.surpriseOption?.activityKind === "dopamine_game") {
      registerMysteryGameForSessionFinalize(childId, mysteryChoice.surpriseOption.activityId);
    } else {
      registerMysteryGameForSessionFinalize(childId, mysterySlug);
    }
    console.log(
      `🎮 [mystery] mode=${mysteryChoice.mysteryMode} fallback=${mysteryGameFile} options=${mysteryChoice.choiceOptions.length}`,
    );
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
	      ...mysteryChoice,
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
    const visualQuestThresholdMet = Boolean(
      questConfig?.dataThresholdMet || questGamePath || hasQuestUnlock(childId),
    );
	    if (readyGeneratedQuest && hasPlayableAdaptiveArtifact(readyGeneratedQuest)) {
	      const questNode = readyGeneratedQuest;
	      ordered.push({
	        ...questNode,
	        id: questNode.id || `n-quest-${homeworkId}`,
	        type: "quest",
	        isLocked: true,
	        isCompleted: false,
	        isGoal: false,
	        thumbnailUrl: theme?.nodeThumbnails?.["quest"] ?? questNode.thumbnailUrl,
	        thumbnailPrompt: questNode.thumbnailPrompt ?? NODE_THUMBNAIL_PROMPTS.quest,
	        artifactStatus: "ready",
	        masteryUnlockState: pendingMasteryState(questNode),
	        generationModel: questGenerationModel,
	      });
	    } else if (visualQuestThresholdMet) {
	      ordered.push({
        id: `n-quest-${homeworkId}`,
        type: "quest",
        words: pendingHandoffMissedWords,
        difficulty: 2,
        isLocked: true,
        isCompleted: false,
        isGoal: false,
	        thumbnailUrl: theme?.nodeThumbnails?.["quest"] ?? undefined,
	        thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.quest,
	        artifactStatus: "preparing",
	        masteryUnlockState: "preparing",
	      });
	    } else {
	      ordered.push({
	        id: `n-quest-${homeworkId}`,
	        type: "quest",
	        words: pendingHandoffMissedWords,
	        difficulty: 2,
	        isLocked: true,
	        isCompleted: false,
	        isGoal: false,
	        thumbnailUrl: theme?.nodeThumbnails?.["quest"] ?? undefined,
	        thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.quest,
	        masteryUnlockState: "teased_locked",
	      });
	    }
    const bossGamePath =
      typeof bossConfig?.generatedGamePath === "string" &&
      bossConfig.generatedGamePath.length > 0
        ? bossConfig.generatedGamePath
        : undefined;
	    if (readyGeneratedBoss && hasPlayableAdaptiveArtifact(readyGeneratedBoss)) {
	      const bossNode = readyGeneratedBoss;
	      ordered.push({
	        ...bossNode,
	        id: bossNode.id || `n-boss-${homeworkId}`,
	        type: "boss",
	        isLocked: true,
	        isCompleted: false,
	        isGoal: false,
	        thumbnailUrl: theme?.nodeThumbnails?.["boss"] ?? bossNode.thumbnailUrl,
	        thumbnailPrompt: bossNode.thumbnailPrompt ?? NODE_THUMBNAIL_PROMPTS.boss,
	        artifactStatus: "ready",
	        masteryUnlockState: pendingMasteryState(bossNode),
	        generationModel: bossConfig?.generationModel === "opus" ? "opus" : undefined,
	      });
	    } else {
      ordered.push({
        id: `n-boss-${homeworkId}`,
        type: "boss",
        words: [],
        difficulty: 3,
        isLocked: true,
        isCompleted: false,
        isGoal: false,
	        thumbnailUrl: theme?.nodeThumbnails?.["boss"] ?? undefined,
	        thumbnailPrompt: NODE_THUMBNAIL_PROMPTS.boss,
	        artifactStatus: bossConfig?.dataThresholdMet || bossGamePath ? "preparing" : undefined,
	        masteryUnlockState: bossConfig?.dataThresholdMet || bossGamePath ? "preparing" : "teased_locked",
	      });
	    }
    ordered.forEach((node, i) => {
      node.isGoal = i === ordered.length - 1;
    });
    nodes = validateHomeworkMapActivityPlan(profile.childId, hw, ordered);
    }
  } else {
    nodes = await buildNodeList(profile, theme);
  }
  console.log("🗺️ [map] final node order:", nodes.map((n) => n.type));
  if (runtime.nodeAccess === "inspect-all") {
    nodes.forEach((node) => {
      if (shouldKeepMasteryNodeLockedInPreview(node, runtime)) {
        node.isLocked = true;
        node.isCompleted = false;
        return;
      }
	      if (
	        (node.type === "quest" || node.type === "boss") &&
	        (!hasPlayableAdaptiveArtifact(node) ||
	          (node.masteryUnlockState !== "unlocked" &&
	            node.masteryUnlockState !== "completed"))
	      ) {
	        node.isLocked = true;
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
  } else if (profile.pendingHomework?.completedAdventureNodeIds?.length) {
    console.log(
      `🎮 [map-coordinator] [organic-map] prior completions=${profile.pendingHomework.completedAdventureNodeIds.length} kept as evidence, not session locks`,
    );
  }
  syncNodeStatuses(mapState, runtime);
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    childId: profile.childId,
    mapState,
    runtime,
    pendingHomework: profile.pendingHomework,
    greetedNodeIds: new Set(),
  });
  latestSessionIdByChild.set(mapCompanionWsKey(profile.childId), sessionId);
  return { sessionId, mapState };
}

function currentNode(state: MapState): NodeConfig | undefined {
  return state.nodes[state.currentNodeIndex];
}

function isAttentionScreeningNodeType(type: string): boolean {
  return type === "bubble-pop" ||
    type === "cpt-low-reward" ||
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
    if (clicked.isLocked) {
      return [{ type: "map_error", payload: { reason: "locked_node" } }];
    }
    if (!inspectAll) {
      const cur = currentNode(rec.mapState);
      const completedReplay =
        clicked.isCompleted || rec.mapState.completedNodes.includes(nodeId);
      if (!completedReplay && (!cur || cur.id !== nodeId)) {
        return [{ type: "map_error", payload: { reason: "not_current_node" } }];
      }
    }
    const launchedNode = nodeWithActivityIntent(rec.mapState.childId, clicked, rec.pendingHomework);
    rec.mapState.nodes = rec.mapState.nodes.map((node) =>
      node.id === launchedNode.id ? launchedNode : node,
    );
    const childId = rec.mapState.childId;
    const sm = getActiveVoiceSessionManagerForChild(childId);
    if (sm) {
      const gameContextSession = sm as typeof sm & {
        injectGameContext?: (state: Record<string, unknown>) => void;
        recordGameTrace?: (state: Record<string, unknown>) => void;
      };
      const launchTarget =
        launchedNode.words?.[0] ?? launchedNode.wordRadarItems?.[0]?.display ?? "";
      const hidesLaunchTarget = nodeHidesLaunchTarget(launchedNode);
      const nodeSummary =
        !hidesLaunchTarget && launchTarget
          ? `${childId} just started a ${launchedNode.type} activity. Word: "${launchTarget}".`
          : `${childId} just started a ${launchedNode.type} activity.`;
      const allowedActivities = rec.mapState.nodes
        .filter((node) => !node.isLocked || node.id === launchedNode.id)
        .map((node) => node.type);
      gameContextSession.recordGameTrace?.({
        type: "node_launched",
        source: "map_coordinator",
        game: launchedNode.type,
        phase: "launched",
        nodeId: launchedNode.id,
        activityId: launchedNode.type,
        activityIntentId: launchedNode.activityIntent?.intentId,
        targetSelectorId: launchedNode.targetSelectorDecision?.selectorId,
        intentPurpose: launchedNode.activityIntent?.purpose,
        diagnosticQuestion: launchedNode.activityIntent?.diagnosticQuestion,
        childId,
        answerVisibility: hidesLaunchTarget ? "hidden" : "visible",
        currentWord: hidesLaunchTarget ? undefined : launchTarget,
        expectedTargets: [
          ...(launchedNode.words ?? []),
          ...(launchedNode.wordRadarItems ?? []).map((item) => item.display),
        ],
        allowedActivities,
        homeworkId: rec.pendingHomework?.homeworkId ?? rec.pendingHomework?.weekOf,
        activityIntent: launchedNode.activityIntent,
        targetSelectorDecision: launchedNode.targetSelectorDecision,
      });
      gameContextSession.injectGameContext?.({
        game: launchedNode.type,
        phase: "launched",
        nodeId: launchedNode.id,
        activityId: launchedNode.type,
        activityIntentId: launchedNode.activityIntent?.intentId,
        targetSelectorId: launchedNode.targetSelectorDecision?.selectorId,
        intentPurpose: launchedNode.activityIntent?.purpose,
        diagnosticQuestion: launchedNode.activityIntent?.diagnosticQuestion,
        homeworkId: rec.pendingHomework?.homeworkId ?? rec.pendingHomework?.weekOf,
        answerVisibility: hidesLaunchTarget ? "hidden" : "visible",
        domain:
          rec.pendingHomework?.contentProfile?.practiceDomain ??
          rec.pendingHomework?.capturedContent?.contentProfile?.practiceDomain,
        currentWord: hidesLaunchTarget ? undefined : launchTarget,
        expectedTargets: [
          ...(launchedNode.words ?? []),
          ...(launchedNode.wordRadarItems ?? []).map((item) => item.display),
        ],
        allowedActivities,
        mode: launchedNode.wordRadarConfig?.recallMode ?? launchedNode.type,
        progress: nodeSummary,
      });
      if (!rec.greetedNodeIds.has(launchedNode.id) && sm.speakGameNarration) {
        rec.greetedNodeIds.add(launchedNode.id);
        void Promise.resolve(sm.speakGameNarration(gameMountGreetingForNode(childId, launchedNode), {
            source: "map_node_started",
            reason: "game_mount_greeting",
            nodeId: launchedNode.id,
            activityId: launchedNode.type,
            homeworkId: rec.pendingHomework?.homeworkId ?? rec.pendingHomework?.weekOf,
          })).catch((err: unknown) => {
          console.error("  🔴 [map-coordinator] game mount greeting failed:", err);
        });
      }
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
        recordGameTrace?: (state: Record<string, unknown>) => void;
      };
      gameContextSession.recordGameTrace?.({
        ...payload,
        type: "game_state_update",
        source: "map_coordinator",
        childId,
      });
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
      reason: String(pl.reason ?? "currency_award"),
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

export function purchaseStoryMovieReward(
  sessionId: string,
  clientPreviewFree: boolean,
): { ok: true; cost: number; balance: number } | {
  ok: false;
  reason: string;
  cost: number;
  balance: number;
} {
  const rec = sessions.get(sessionId);
  if (!rec) {
    throw new MapSessionError("unknown_session", 404);
  }
  const skipPersistence =
    rec.runtime.persistenceMode === "blocked" || clientPreviewFree;
  const current = reconcileCompanionCurrencyAward({
    childId: rec.mapState.childId,
    amount: 0,
    dryRun: true,
    reason: "story_movie_quote",
  });
  if (!current.ok) {
    return { ok: false, reason: current.reason, cost: 0, balance: 0 };
  }
  const cost = computeStoryMovieCost(current.balance);
  if (current.balance < cost) {
    return {
      ok: false,
      reason: "insufficient_funds",
      cost,
      balance: current.balance,
    };
  }
  const out = reconcileCompanionCurrencyAward({
    childId: rec.mapState.childId,
    amount: -cost,
    dryRun: skipPersistence,
    reason: "story_movie_purchase",
  });
  if (!out.ok) {
    return { ok: false, reason: out.reason, cost, balance: current.balance };
  }
  if (!skipPersistence) {
    broadcastCompanionEventToMapChild(rec.mapState.childId, {
      type: "currency_update",
      balance: out.balance,
    });
  }
  console.log(
    `  🎮 [story-movie] purchase cost=${cost} balance=${out.balance} dryRun=${skipPersistence}`,
  );
  return { ok: true, cost, balance: out.balance };
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

function appendActivityResultFlightRecorder(input: {
  childId: string;
  sessionDate: string;
  sessionId: string;
  node: NodeConfig;
  result: NodeResult;
}): void {
  if (process.env.VITEST && !process.env.SUNNY_ACTIVITY_RESULT_LOG_ROOT) {
    return;
  }
  try {
    const dateStr = input.sessionDate.slice(0, 10);
    const root =
      process.env.SUNNY_ACTIVITY_RESULT_LOG_ROOT ||
      path.join(process.cwd(), "src", "context");
    const dir = path.join(
      root,
      input.childId,
      "activity_results",
    );
    fs.mkdirSync(dir, { recursive: true });
    const row = {
      type: "activity_node_result",
      version: 1,
      recordedAt: new Date().toISOString(),
      sessionId: input.sessionId,
      childId: input.childId,
      sessionDate: input.sessionDate,
      nodeId: input.result.nodeId,
      nodeType: input.node.type,
      activityId: input.result.activityId ?? input.node.type,
      purpose: input.result.purpose ?? null,
      activityIntentId: input.result.activityIntentId ?? input.node.activityIntent?.intentId ?? null,
      targetSelectorId:
        input.result.targetSelectorId ?? input.node.targetSelectorDecision?.selectorId ?? null,
      activityIntent: input.result.activityIntent ?? input.node.activityIntent ?? null,
      targetSelectorDecision:
        input.result.targetSelectorDecision ?? input.node.targetSelectorDecision ?? null,
      mode: input.result.mode ?? null,
      activityConfigPath: input.node.activityConfigPath ?? null,
      completed: input.result.completed,
      accuracy: input.result.accuracy,
      timeSpent_ms: input.result.timeSpent_ms,
      wordsAttempted: input.result.wordsAttempted,
      missedWords: input.result.missedWords ?? [],
      correctWords: input.result.correctWords ?? [],
      evidenceTier: input.result.evidenceTier ?? null,
      vitalSigns: input.result.vitalSigns ?? null,
      targetResults: input.result.targetResults ?? [],
      bonusRound: input.result.bonusRound ?? null,
      letterResults: input.result.letterResults ?? [],
    };
    fs.appendFileSync(
      path.join(dir, `${dateStr}.ndjson`),
      `${JSON.stringify(row)}\n`,
      "utf-8",
    );
    console.log(
      `  🎮 [activity-results] recorded ${input.node.type} ${input.result.nodeId} targets=${row.targetResults.length}`,
    );
  } catch (err) {
    console.error("  🔴 [activity-results] record failed:", err);
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

  const wasAlreadyCompleted = st.completedNodes.includes(result.nodeId);
  if (!wasAlreadyCompleted) {
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
    writePostNodeLearningEvidence(st.childId, nodeCfg, result, rating);
    recordMapTargetAttempts(st.childId, sessionId, nodeCfg, result);
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

  const missedRaw = [...(result.missedWords ?? [])]
    .map((w) => String(w).trim())
    .filter(Boolean);
  const homeworkGate = createHomeworkEvidenceGate(rec.pendingHomework);
  const missed = filterHomeworkTargets(homeworkGate, missedRaw, { logPrefix: "  🎮" }).accepted;
  const scopedResult =
    missed.length === missedRaw.length
      ? result
      : { ...result, missedWords: missed };
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
      const domain = lp ? selectedHomeworkDomain(lp) ?? inferHomeworkDomainFromPending(lp.pendingHomework) : undefined;
      if (lp && domain) {
        patchActiveHomeworkLane(st.childId, domain, (pending) => {
          const prev = pending.reinforceWords ?? [];
          const merged = [
            ...new Set([...prev, ...missed].map((x) => String(x).trim()).filter(Boolean)),
          ];
          return { ...pending, reinforceWords: merged };
        });
      }
    } catch (err) {
      console.error("  🔴 [map-coordinator] reinforceWords merge failed:", err);
    }
  }

  const nextPlanDiff = retargetFuturePracticeNodes(st.nodes, nodeCfg, scopedResult);
  for (const skippedId of nextPlanDiff.skippedPracticeNodeIds) {
    if (!st.completedNodes.includes(skippedId)) st.completedNodes.push(skippedId);
  }
  expandFuturePronunciationNodesFromHomework(st.nodes, nodeCfg, scopedResult, rec.pendingHomework);

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

  if (!skipSessionPersistence && result.completed && !wasAlreadyCompleted) {
    const out = reconcileCompanionCurrencyAward({
      childId: st.childId,
      amount: 25,
      dryRun: false,
      reason: "node_complete",
    });
    if (out.ok) {
      broadcastCompanionEventToMapChild(st.childId, {
        type: "currency_update",
        balance: out.balance,
      });
      console.log(
        `  🎮 [companion-care] node_complete coins +25 balance=${out.balance}`,
      );
    }
  }

  if (!skipSessionPersistence) {
    appendActivityResultFlightRecorder({
      childId: st.childId,
      sessionDate: st.sessionDate,
      sessionId,
      node: nodeCfg,
      result,
    });
    appendMapSessionNote(
      st.childId,
      st.sessionDate,
      `Map node ${nodeCfg.type} ${result.nodeId} completed=${result.completed} accuracy=${result.accuracy}`,
    );
    writeLearningExperimentResult(st.childId, nodeCfg, result);
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
      const domain = lp ? selectedHomeworkDomain(lp) ?? inferHomeworkDomainFromPending(lp.pendingHomework) : undefined;
      if (lp?.pendingHomework?.nodes?.length && domain) {
        const nodeOk = st.nodes.some((n) => n.id === result.nodeId);
        if (nodeOk) {
          patchActiveHomeworkLane(st.childId, domain, (pending) => {
            const prev = pending.completedAdventureNodeIds ?? [];
            if (prev.includes(result.nodeId)) return pending;
            return {
              ...pending,
              completedAdventureNodeIds: [...prev, result.nodeId],
            };
          });
        }
      }
    } catch (err) {
      console.error("  🔴 [map-coordinator] persist homework map completion failed:", err);
	    }
	  }

	  if (result.completed && !wasAlreadyCompleted) {
	    revealPendingMasteryUnlock(st, nodeCfg);
	  }

	  st.currentNodeIndex = firstIncompleteNodeIndex(st.nodes, new Set(st.completedNodes));
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
    const voiceWithTrace = voiceSm as typeof voiceSm & {
      recordGameTrace?: (state: Record<string, unknown>) => void;
      recordGameSummary?: (state: Record<string, unknown>) => void;
    };
    const voiceMutable = voiceSm as typeof voiceSm & {
      spellCheckSessionActive?: boolean;
      activeSpellCheckWord?: string;
    };
    voiceMutable.spellCheckSessionActive = false;
    voiceMutable.activeSpellCheckWord = "";
    voiceWithTrace.recordGameTrace?.({
      type: "activity_result_interpreted",
      source: "map_coordinator",
      childId: st.childId,
      nodeId: result.nodeId,
      activityId: result.activityId ?? nodeCfg.type,
      activityIntentId: result.activityIntentId ?? nodeCfg.activityIntent?.intentId,
      targetSelectorId: result.targetSelectorId ?? nodeCfg.targetSelectorDecision?.selectorId,
      evidenceTier: result.evidenceTier ?? nodeCfg.activityIntent?.evidenceTier ?? null,
      targetResults: result.targetResults ?? [],
      missedWords: result.missedWords ?? [],
      correctWords: result.correctWords ?? [],
      interpretation:
        result.targetResults?.length || result.missedWords?.length || result.correctWords?.length
          ? "target evidence available for retargeting"
          : "completion recorded without target-level evidence",
    });
    voiceWithTrace.recordGameTrace?.({
      type: nextPlanDiff.changedNodeIds.length > 0 ? "next_plan_changed" : "next_plan_unchanged",
      source: "map_coordinator",
      childId: st.childId,
      nodeId: result.nodeId,
      activityId: result.activityId ?? nodeCfg.type,
      changedNodeIds: nextPlanDiff.changedNodeIds,
      skippedPracticeNodeIds: nextPlanDiff.skippedPracticeNodeIds,
      nextTargets: nextPlanDiff.nextTargets,
      reason: nextPlanDiff.reason,
    });
    voiceWithTrace.recordGameTrace?.({
      ...buildNodeCompletionHandoffState(nodeCfg, result),
      type: "node_complete",
      source: "map_coordinator",
      childId: st.childId,
      activityIntentId: result.activityIntentId ?? nodeCfg.activityIntent?.intentId,
      targetSelectorId: result.targetSelectorId ?? nodeCfg.targetSelectorDecision?.selectorId,
      intentPurpose: nodeCfg.activityIntent?.purpose,
      targetSelectorTrace: nodeCfg.targetSelectorDecision?.traceSummary,
    });
    voiceWithTrace.recordGameSummary?.({
      game: nodeCfg.type,
      nodeId: result.nodeId,
      activityId: result.activityId ?? nodeCfg.type,
      activityIntentId: result.activityIntentId ?? nodeCfg.activityIntent?.intentId,
      targetSelectorId: result.targetSelectorId ?? nodeCfg.targetSelectorDecision?.selectorId,
      activityIntent: result.activityIntent ?? nodeCfg.activityIntent ?? null,
      targetSelectorDecision:
        result.targetSelectorDecision ?? nodeCfg.targetSelectorDecision ?? null,
      targetLane: result.purpose ?? nodeCfg.activityConfigPath ?? null,
      targetsShown: nodeCfg.words ?? nodeCfg.wordRadarItems?.map((item) => item.display) ?? [],
      attempts: result.wordsAttempted,
      correctWords: result.correctWords ?? [],
      missedWords: result.missedWords ?? [],
      recoveredWords: result.targetResults
        ?.filter((row) =>
          row.correct === true &&
          Array.isArray(row.struggleSignals) &&
          row.struggleSignals.includes("missed_then_recovered"),
        )
        .map((row) => row.target) ?? [],
      visibleScore: (result as unknown as Record<string, unknown>).score ?? null,
      coinsEarned: (result as unknown as Record<string, unknown>).coinsEarned ?? null,
      answerVisibilityEvents: [nodeHidesLaunchTarget(nodeCfg) ? "hidden" : "visible"],
      helpRequests: [],
      completed: result.completed,
      accuracy: result.accuracy,
      timeSpent_ms: result.timeSpent_ms,
    });
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

export function getLatestMapStateForChild(childIdRaw: string): MapState | null {
  const sessionId = latestSessionIdByChild.get(mapCompanionWsKey(childIdRaw));
  return sessionId ? getMapState(sessionId) : null;
}

export async function recordMapChoiceEvent(
  sessionId: string,
  input: Partial<ChoiceEventInput>,
  opts: { skipPersistence?: boolean } = {},
): Promise<{ ok: true; applied: boolean; skippedPersistence: boolean }> {
  const rec = sessions.get(sessionId);
  if (!rec) {
    throw new MapSessionError("unknown_session", 404);
  }
  const childId = rec.mapState.childId;
  const nodeId = typeof input.nodeId === "string" ? input.nodeId : undefined;
  if (nodeId && !rec.mapState.nodes.some((node) => node.id === nodeId)) {
    throw new MapSessionError("unknown_node", 400);
  }
  const eventInput: ChoiceEventInput = {
    choiceSetId: String(input.choiceSetId ?? ""),
    childId,
    sessionId,
    nodeId,
    context: input.context ?? "mystery",
    domain: String(input.domain ?? "general"),
    shownOptions: Array.isArray(input.shownOptions) ? input.shownOptions : [],
    selectedOptionId: input.selectedOptionId ?? null,
    skippedOptionIds: Array.isArray(input.skippedOptionIds) ? input.skippedOptionIds : [],
    source: input.source ?? "system_required",
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.eventName ? { eventName: input.eventName } : {}),
    ...(typeof input.timeToChoose_ms === "number" ? { timeToChoose_ms: input.timeToChoose_ms } : {}),
    ...(typeof input.started === "boolean" ? { started: input.started } : {}),
    ...(typeof input.completed === "boolean" ? { completed: input.completed } : {}),
    ...(typeof input.accuracy === "number" ? { accuracy: input.accuracy } : {}),
    ...(typeof input.activePlayTime_ms === "number" ? { activePlayTime_ms: input.activePlayTime_ms } : {}),
    ...(typeof input.replayRequested === "boolean" ? { replayRequested: input.replayRequested } : {}),
    ...(input.explicitSentiment ? { explicitSentiment: input.explicitSentiment } : {}),
    ...(typeof input.frustrationScore === "number" ? { frustrationScore: input.frustrationScore } : {}),
  };
  if (!eventInput.choiceSetId || eventInput.shownOptions.length === 0) {
    throw new MapSessionError("invalid_choice_event", 400);
  }
  const skipPersistence = opts.skipPersistence === true || rec.runtime.persistenceMode === "blocked";
  if (skipPersistence) {
    console.log(
      `  🎮 [choice-event] [preview] child=${childId} context=${eventInput.context} source=${eventInput.source}`,
    );
    return { ok: true, applied: false, skippedPersistence: true };
  }
  const event = recordChoiceEvent(eventInput);
  const sm = getActiveVoiceSessionManagerForChild(childId);
  sm?.recordGameTrace?.({
    type: "choice_event",
    source: "map_coordinator",
    eventName: event.eventName,
    choiceSetId: event.choiceSetId,
    nodeId: event.nodeId,
    context: event.context,
    domain: event.domain,
    shownOptions: event.shownOptions,
    selectedOptionId: event.selectedOptionId,
    skippedOptionIds: event.skippedOptionIds,
    started: event.started,
    completed: event.completed,
    accuracy: event.accuracy,
    timeToChoose_ms: event.timeToChoose_ms,
  });
  const applied = await applyChoiceEventPreference(event);
  return { ok: true, applied: applied.applied, skippedPersistence: false };
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
  try {
    await recordReward(
      rec.mapState.childId,
      nodeCfg.type,
      rating === "like",
      rating === "like",
      rating === "like" ? 1 : 0,
    );
  } catch (err) {
    console.error("  🔴 [map-coordinator] explicit recordReward failed:", err);
  }
  writeExplicitRatingEvidence(rec.mapState.childId, nodeCfg, rating);
}
