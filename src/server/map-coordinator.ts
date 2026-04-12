import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type {
  MapState,
  NodeConfig,
  NodeResult,
  NodeRatingLike,
  SessionTheme,
} from "../shared/adventureTypes";
import type { ChildQuality } from "../algorithms/types";
import { buildProfile } from "../profiles/buildProfile";
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { recordReward } from "../engine/bandit";
import { recordAttempt } from "../engine/learningEngine";
import { readWordBank } from "../utils/wordBankIO";
import { appendNodeRating } from "../utils/nodeRatingIO";

type SessionRecord = {
  childId: string;
  mapState: MapState;
};

const sessions = new Map<string, SessionRecord>();

export function __resetAdventureMapSessionsForTests(): void {
  sessions.clear();
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
  state.nodes = state.nodes.map((node, idx) => ({
    ...node,
    isCompleted: completed.has(node.id),
    isLocked: idx > state.currentNodeIndex && !completed.has(node.id),
  }));
}

export async function startMapSession(
  childId: string,
): Promise<{ sessionId: string; mapState: MapState }> {
  const profile = await buildProfile(childId);
  if (!profile) {
    throw new MapSessionError("unknown_child", 404);
  }
  const theme = await generateTheme(profile);
  const nodes = await buildNodeList(profile, theme);
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
): Promise<MapState> {
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

  const liked = rating === "like";
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

  for (let i = 0; i < result.wordsAttempted; i++) {
    const word = `attempt-${i + 1}`;
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

  appendMapSessionNote(
    st.childId,
    st.sessionDate,
    `Map node ${nodeCfg.type} ${result.nodeId} completed=${result.completed} accuracy=${result.accuracy}`,
  );

  if (st.currentNodeIndex < st.nodes.length - 1) {
    st.currentNodeIndex++;
  }
  syncNodeStatuses(st);

  return st;
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
