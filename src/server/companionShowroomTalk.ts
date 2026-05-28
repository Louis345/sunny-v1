import {
  type CompanionCommand,
  type AnimationName,
} from "../shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";
import {
  resolveAllowedShowroomVoiceId,
  type ShowroomVoiceOption,
} from "./companionShowroomVoice";
import type { CompanionCareMemory } from "../shared/companionCareTypes";

const SHOWROOM_TALK_THEMES = new Set(["aurora", "storybook", "crystal"]);
const SHOWROOM_TALK_CALL_SOURCES = new Set([
  "showroom",
  "mystery_box",
  "game_reward",
  "dev_preview",
]);
const SHOWROOM_TALK_RELATIONSHIP_STATES = new Set([
  "previewing",
  "selected",
  "earned_reward",
]);
const MAX_SHOWROOM_QUESTION_LENGTH = 500;
const MAX_VISUAL_SUMMARY_LENGTH = 360;
const MAX_VISUAL_SNAPSHOT_BASE64_LENGTH = 700_000;
const MAX_VISUAL_SNAPSHOT_DIMENSION = 1024;
const MAX_REWARD_CONTEXT_FIELD_LENGTH = 160;
const MAX_ACTIVITY_REASON_LENGTH = 180;
const SHOWROOM_ACTIVITY_STATUSES = new Set(["active", "completed"]);
const SHOWROOM_ACTIVITY_TURNS = new Set(["child", "companion", "none"]);
const SHOWROOM_ACTIVITY_RESULTS = new Set(["child_win", "companion_win", "draw"]);
const SHOWROOM_ACTIVITY_MOVE_BY = new Set(["child", "companion"]);
const SHOWROOM_ACTIVITY_MARKS = new Set(["X", "O"]);
const SHOWROOM_TALK_FALLBACK_TEXT = "I'm here with you. Let's keep going.";
const SHOWROOM_COMPANION_ACT_CAPABILITIES = [
  ...COMPANION_CAPABILITIES.keys(),
] as string[];
const SHOWROOM_COMPANION_ACTIVITY_IDS = new Set(["tic_tac_toe"]);
const SHOWROOM_COMPANION_ACTIVITY_SURFACES = new Set(["video_call_overlay"]);

export type ShowroomTalkPhase = "thinking" | "speaking" | "idle";
export type ShowroomTalkMode = "showroom" | "video_call";
export type CompanionCallSource =
  | "showroom"
  | "mystery_box"
  | "game_reward"
  | "dev_preview";
export type CompanionRelationshipState = "previewing" | "selected" | "earned_reward";
export type CompanionRewardContext = {
  nodeId?: string;
  activityId?: string;
  rewardId?: string;
  earnedBy?: string;
};
export type ShowroomCompanionActivityId = "tic_tac_toe";
export type ShowroomCompanionActivitySurface = "video_call_overlay";
export type ShowroomCompanionActivityRequest = {
  source: "claude";
  childId: string;
  companionId: string;
  activityId: ShowroomCompanionActivityId;
  surface: ShowroomCompanionActivitySurface;
  reason: string;
  timestamp: number;
};
export type ShowroomActiveActivityContext = {
  activityId: ShowroomCompanionActivityId;
  surface: ShowroomCompanionActivitySurface;
  status: "active" | "completed";
  board: Array<"X" | "O" | null>;
  childMark: "X";
  companionMark: "O";
  turn: "child" | "companion" | "none";
  lastMove?: {
    by: "child" | "companion";
    square: number;
    mark: "X" | "O";
    timestamp?: number;
  };
  result?: "child_win" | "companion_win" | "draw";
  summary?: string;
  updatedAt?: number;
};
export type ShowroomVisualSnapshot = {
  base64: string;
  mimeType: "image/jpeg";
  reason: string;
  capturedAt: number;
  width: number;
  height: number;
};

export type ResolvedShowroomTalkRequest = {
  childId: string;
  companionId: string;
  voiceId: string;
  showroomTheme: "aurora" | "storybook" | "crystal";
  question: string;
  mode?: ShowroomTalkMode;
  callSource: CompanionCallSource;
  relationshipState: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
  activeActivity?: ShowroomActiveActivityContext;
  callTraceId?: string;
  turnId?: string;
  visualSnapshot?: ShowroomVisualSnapshot;
  lastVisualSummary?: string;
};

export type ShowroomTalkCompletedEvent = {
  type: "companion_talk_completed";
  childId: string;
  companionId: string;
  showroomTheme: string;
  questionLength: number;
  responseLength: number;
  timestamp: number;
  mode?: ShowroomTalkMode;
  callSource: CompanionCallSource;
  relationshipState: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
  visionUsed?: boolean;
  visualSnapshot?: Omit<ShowroomVisualSnapshot, "base64" | "capturedAt"> & {
    capturedAt: number;
  };
};

export type ShowroomClaudeMessage = {
  role: "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | {
            type: "image";
            source: {
              type: "base64";
              media_type: "image/jpeg";
              data: string;
            };
          }
      >;
};

export function getShowroomCompanionActTools() {
  return [
    {
      name: "companionAct",
      description:
        "Drive the visible VRM companion with validated motion, facial expression, movement, or camera commands. Use this for gestures instead of saying action lines aloud.",
      input_schema: {
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            enum: SHOWROOM_COMPANION_ACT_CAPABILITIES,
            description:
              "Capability id. Use animate for gestures, emote for facial feeling, camera for framing, and move for small symbolic shifts.",
          },
          payload: {
            type: "object",
            description:
              "Payload for the capability. Examples: {\"animation\":\"wave\",\"loop\":false}, {\"animation\":\"think\",\"loop\":true}, {\"emote\":\"happy\",\"intensity\":0.8}, {\"angle\":\"close-up\",\"transition_ms\":400}.",
            additionalProperties: true,
          },
        },
        required: ["type", "payload"],
        additionalProperties: false,
      },
    },
  ];
}

export function getShowroomCompanionActivityTools() {
  return [
    {
      name: "openCompanionActivity",
      description:
        "Open a companion play activity in the live video call UI. Use this when the child asks to play a quick game together.",
      input_schema: {
        type: "object" as const,
        properties: {
          activityId: {
            type: "string",
            enum: ["tic_tac_toe"],
            description:
              "The companion activity to open. V1 supports only tic_tac_toe.",
          },
          surface: {
            type: "string",
            enum: ["video_call_overlay"],
            description:
              "Where the activity should appear. V1 opens it as a FaceTime-style overlay.",
          },
          reason: {
            type: "string",
            description:
              "Short product reason, such as child_accepted_game_invite.",
          },
        },
        required: ["activityId", "surface", "reason"],
        additionalProperties: false,
      },
    },
  ];
}

export function createShowroomCompanionActCommand(input: {
  childId: string;
  rawInput: unknown;
  now?: number;
}): CompanionCommand | null {
  return validateCompanionCommand(input.rawInput, COMPANION_CAPABILITIES, {
    childId: input.childId,
    source: "claude",
    now: input.now,
  });
}

export function createShowroomCompanionActivityRequest(input: {
  childId: string;
  companionId: string;
  rawInput: unknown;
  now?: number;
}): ShowroomCompanionActivityRequest | null {
  if (!input.rawInput || typeof input.rawInput !== "object" || Array.isArray(input.rawInput)) {
    return null;
  }
  const raw = input.rawInput as Record<string, unknown>;
  const activityId = typeof raw.activityId === "string" ? raw.activityId.trim() : "";
  const surface = typeof raw.surface === "string" ? raw.surface.trim() : "";
  if (
    !SHOWROOM_COMPANION_ACTIVITY_IDS.has(activityId) ||
    !SHOWROOM_COMPANION_ACTIVITY_SURFACES.has(surface)
  ) {
    return null;
  }
  const reason =
    typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim().replace(/\s+/g, "_").slice(0, MAX_ACTIVITY_REASON_LENGTH)
      : "companion_activity_request";
  return {
    source: "claude",
    childId: input.childId,
    companionId: input.companionId,
    activityId: activityId as ShowroomCompanionActivityId,
    surface: surface as ShowroomCompanionActivitySurface,
    reason,
    timestamp: input.now ?? Date.now(),
  };
}

function resolveShowroomTalkMode(value: unknown): ShowroomTalkMode {
  return value === "video_call" ? "video_call" : "showroom";
}

function resolveCompanionCallSource(value: unknown): CompanionCallSource {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SHOWROOM_TALK_CALL_SOURCES.has(raw) ? (raw as CompanionCallSource) : "showroom";
}

function resolveCompanionRelationshipState(value: unknown): CompanionRelationshipState {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SHOWROOM_TALK_RELATIONSHIP_STATES.has(raw)
    ? (raw as CompanionRelationshipState)
    : "previewing";
}

function normalizeRewardContextField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, MAX_REWARD_CONTEXT_FIELD_LENGTH) : undefined;
}

function resolveCompanionRewardContext(value: unknown): CompanionRewardContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const context: CompanionRewardContext = {
    ...(normalizeRewardContextField(raw.nodeId) && {
      nodeId: normalizeRewardContextField(raw.nodeId),
    }),
    ...(normalizeRewardContextField(raw.activityId) && {
      activityId: normalizeRewardContextField(raw.activityId),
    }),
    ...(normalizeRewardContextField(raw.rewardId) && {
      rewardId: normalizeRewardContextField(raw.rewardId),
    }),
    ...(normalizeRewardContextField(raw.earnedBy) && {
      earnedBy: normalizeRewardContextField(raw.earnedBy),
    }),
  };
  return Object.keys(context).length > 0 ? context : undefined;
}

function resolveVisualSummary(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, MAX_VISUAL_SUMMARY_LENGTH) : undefined;
}

function resolveActivityBoard(value: unknown): Array<"X" | "O" | null> | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  const board = value.map((mark) => {
    if (mark === "X" || mark === "O") return mark;
    if (mark == null) return null;
    return "invalid";
  });
  return board.includes("invalid") ? null : (board as Array<"X" | "O" | null>);
}

function resolveActiveActivityMove(value: unknown): ShowroomActiveActivityContext["lastMove"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const by =
    typeof raw.by === "string" && SHOWROOM_ACTIVITY_MOVE_BY.has(raw.by)
      ? (raw.by as "child" | "companion")
      : null;
  const square = typeof raw.square === "number" ? raw.square : Number(raw.square);
  const mark =
    typeof raw.mark === "string" && SHOWROOM_ACTIVITY_MARKS.has(raw.mark)
      ? (raw.mark as "X" | "O")
      : null;
  if (!by || !mark || !Number.isInteger(square) || square < 1 || square > 9) {
    return undefined;
  }
  const timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : undefined;
  return {
    by,
    square,
    mark,
    ...(timestamp !== undefined && { timestamp }),
  };
}

function resolveShowroomActiveActivity(
  value: unknown,
): ShowroomActiveActivityContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.activityId !== "tic_tac_toe" || raw.surface !== "video_call_overlay") {
    return undefined;
  }
  const board = resolveActivityBoard(raw.board);
  if (!board) return undefined;
  const status =
    typeof raw.status === "string" && SHOWROOM_ACTIVITY_STATUSES.has(raw.status)
      ? (raw.status as "active" | "completed")
      : "active";
  const turn =
    typeof raw.turn === "string" && SHOWROOM_ACTIVITY_TURNS.has(raw.turn)
      ? (raw.turn as "child" | "companion" | "none")
      : "child";
  const result =
    typeof raw.result === "string" && SHOWROOM_ACTIVITY_RESULTS.has(raw.result)
      ? (raw.result as "child_win" | "companion_win" | "draw")
      : undefined;
  const summary = resolveVisualSummary(raw.summary);
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : undefined;
  const lastMove = resolveActiveActivityMove(raw.lastMove);
  return {
    activityId: "tic_tac_toe",
    surface: "video_call_overlay",
    status,
    board,
    childMark: "X",
    companionMark: "O",
    turn,
    ...(lastMove && { lastMove }),
    ...(result && { result }),
    ...(summary && { summary }),
    ...(updatedAt !== undefined && { updatedAt }),
  };
}

function resolveVisualSnapshot(value: unknown): ShowroomVisualSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const base64 = typeof raw.base64 === "string" ? raw.base64.trim() : "";
  const mimeType = raw.mimeType;
  const reason =
    typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim().slice(0, 120)
      : "video_call_snapshot";
  const capturedAt = typeof raw.capturedAt === "number" ? raw.capturedAt : NaN;
  const width = typeof raw.width === "number" ? raw.width : NaN;
  const height = typeof raw.height === "number" ? raw.height : NaN;
  const valid =
    base64.length > 0 &&
    base64.length <= MAX_VISUAL_SNAPSHOT_BASE64_LENGTH &&
    mimeType === "image/jpeg" &&
    Number.isFinite(capturedAt) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_VISUAL_SNAPSHOT_DIMENSION &&
    height <= MAX_VISUAL_SNAPSHOT_DIMENSION;

  if (!valid) return null;
  return {
    base64,
    mimeType: "image/jpeg",
    reason,
    capturedAt,
    width,
    height,
  };
}

function resolveTraceIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return trimmed || undefined;
}

export function resolveShowroomTalkRequest(
  body: unknown,
  opts: {
    routeCompanionId: string;
    voiceOptions: readonly ShowroomVoiceOption[];
    fallbackVoiceId?: string;
  },
):
  | { ok: true; request: ResolvedShowroomTalkRequest }
  | { ok: false; status: number; error: string } {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const routeCompanionId = opts.routeCompanionId.trim().toLowerCase();
  const companionId =
    typeof raw.companionId === "string" && raw.companionId.trim()
      ? raw.companionId.trim().toLowerCase()
      : routeCompanionId;
  if (!routeCompanionId || companionId !== routeCompanionId) {
    return { ok: false, status: 400, error: "companion_mismatch" };
  }

  const childId =
    typeof raw.childId === "string" && raw.childId.trim()
      ? raw.childId.trim().toLowerCase()
      : "showroom";
  const question =
    typeof raw.question === "string"
      ? raw.question.trim().slice(0, MAX_SHOWROOM_QUESTION_LENGTH)
      : "";
  if (!question) {
    return { ok: false, status: 400, error: "question_required" };
  }

  let voiceId: string;
  try {
    voiceId = resolveAllowedShowroomVoiceId(
      raw.voiceId,
      opts.voiceOptions,
      opts.fallbackVoiceId,
    );
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err instanceof Error ? err.message : "voice_unavailable",
    };
  }

  const requestedTheme =
    typeof raw.showroomTheme === "string" ? raw.showroomTheme.trim().toLowerCase() : "";
  const showroomTheme = SHOWROOM_TALK_THEMES.has(requestedTheme)
    ? (requestedTheme as ResolvedShowroomTalkRequest["showroomTheme"])
    : "aurora";
  const mode = resolveShowroomTalkMode(raw.mode);
  const callSource = resolveCompanionCallSource(raw.callSource);
  const relationshipState = resolveCompanionRelationshipState(raw.relationshipState);
  const rewardContext = resolveCompanionRewardContext(raw.rewardContext);
  const rawSnapshot = raw.visualSnapshot;
  const visualSnapshot = resolveVisualSnapshot(rawSnapshot);
  if (rawSnapshot != null && !visualSnapshot) {
    return { ok: false, status: 400, error: "invalid_visual_snapshot" };
  }
  const lastVisualSummary = resolveVisualSummary(raw.lastVisualSummary);
  const activeActivity = resolveShowroomActiveActivity(raw.activeActivity);
  const callTraceId = resolveTraceIdentifier(raw.callTraceId ?? raw.traceId);
  const turnId = resolveTraceIdentifier(raw.turnId);

  return {
    ok: true,
    request: {
      childId,
      companionId,
      voiceId,
      showroomTheme,
      question,
      callSource,
      relationshipState,
      ...(rewardContext && { rewardContext }),
      ...(mode === "video_call" && activeActivity && { activeActivity }),
      ...(mode === "video_call" && callTraceId && { callTraceId }),
      ...(mode === "video_call" && turnId && { turnId }),
      ...(mode === "video_call" && { mode }),
      ...(mode === "video_call" && visualSnapshot && { visualSnapshot }),
      ...(mode === "video_call" && lastVisualSummary && { lastVisualSummary }),
    },
  };
}

export function buildShowroomTalkSystemPrompt(input: {
  companionId: string;
  companionName: string;
  showroomTheme: string;
  personality: string;
  mode?: ShowroomTalkMode;
  hasFreshVisualSnapshot?: boolean;
  lastVisualSummary?: string;
  callSource?: CompanionCallSource;
  relationshipState?: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
  activeActivity?: ShowroomActiveActivityContext;
  companionMemory?: string;
}): string {
  const callSource = input.callSource ?? "showroom";
  const relationshipState = input.relationshipState ?? "previewing";
  const lines = [
    `You are ${input.companionName}, an interactive Sunny learning companion.`,
    `Current showroom room: ${input.showroomTheme}.`,
    `Call source: ${callSource}.`,
    `Relationship state: ${relationshipState}.`,
    `Persona notes: ${input.personality}`,
    "Answer the child directly in 1-3 short sentences.",
    "Use a warm, child-safe tone. Ask at most one follow-up question.",
    "If you want emotion, show emotion through movement with companionAct rather than describing stage directions in words.",
    "If the child asks to play tic-tac-toe, use openCompanionActivity with activityId=tic_tac_toe and surface=video_call_overlay.",
    "Do not say stage directions. Do not say things like 'I wave', '*waves*', or 'I smile'; call companionAct for that motion and keep spoken text natural.",
    "Speech is optional; visual action is preferred when the child is working, feeding, earning a reward, or just hanging out.",
    "When no spoken answer adds value, use companionAct and leave the spoken text empty.",
    "This chat cannot grant coins, XP, store purchases, or talent unlocks.",
    "Return only the words the companion should say aloud, or an empty string when silence is better.",
  ];
  if (callSource === "showroom" || relationshipState === "previewing") {
    lines.push(
      "The child may not have chosen you yet; treat this like a warm companion preview and do not assume a permanent bond.",
    );
  }
  if (
    callSource === "mystery_box" ||
    callSource === "game_reward" ||
    relationshipState === "earned_reward"
  ) {
    lines.push(
      "The child earned this call; celebrate the moment without turning it into homework.",
    );
    if (input.rewardContext?.earnedBy) {
      lines.push(`Earned by: ${input.rewardContext.earnedBy}`);
    }
  } else if (relationshipState === "selected") {
    lines.push("The child has selected you as a companion; speak with gentle continuity.");
  }
  if (input.rewardContext?.nodeId || input.rewardContext?.activityId || input.rewardContext?.rewardId) {
    lines.push(
      `Reward context ids: ${[
        input.rewardContext.nodeId && `node=${input.rewardContext.nodeId}`,
        input.rewardContext.activityId && `activity=${input.rewardContext.activityId}`,
        input.rewardContext.rewardId && `reward=${input.rewardContext.rewardId}`,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  }
  if (input.companionMemory) {
    lines.push(input.companionMemory);
  }
  if (input.activeActivity) {
    const board = input.activeActivity.board
      .map((mark, index) => `${index + 1}=${mark ?? "empty"}`)
      .join(", ");
    lines.push(
      "Active video-call activity: tic-tac-toe.",
      `Board: ${board}.`,
      `Child mark: ${input.activeActivity.childMark}; companion mark: ${input.activeActivity.companionMark}.`,
      `Current turn: ${input.activeActivity.turn}.`,
      `Activity status: ${input.activeActivity.status}.`,
      "Stay aware of this activity when answering. If the child asks what to do, talks about a square, asks why you moved, or continues the game, answer in tic-tac-toe context instead of acting like no game is open.",
    );
    if (input.activeActivity.lastMove) {
      lines.push(
        `Last move: ${input.activeActivity.lastMove.by} placed ${input.activeActivity.lastMove.mark} on square ${input.activeActivity.lastMove.square}.`,
      );
    }
    if (input.activeActivity.result) {
      lines.push(`Round result: ${input.activeActivity.result}.`);
    }
    if (input.activeActivity.summary) {
      lines.push(`Activity summary: ${input.activeActivity.summary}`);
    }
  }
  if (input.mode === "video_call") {
    lines.push(
      "You are in a video call with the child; your 3D companion portrait is visible in the corner.",
      "Do not claim you can see the child, their face, their room, or an object unless this request includes a fresh camera snapshot.",
      input.hasFreshVisualSnapshot
        ? "A fresh camera snapshot is included for this turn. Use it only when it helps answer the child."
        : "No fresh camera snapshot is included. If the child asks a visual question, ask the child to tap Look so you can take a quick look.",
      "Never mention screenshots, image data, tokens, or implementation details to the child.",
    );
    if (input.lastVisualSummary) {
      lines.push(`Previous visual context summary: ${input.lastVisualSummary}`);
    }
  }
  return lines.join("\n");
}

function formatMemoryList(label: string, values: string[] | undefined): string | null {
  const clean = Array.isArray(values)
    ? values.map((value) => value.trim()).filter(Boolean).slice(0, 5)
    : [];
  return clean.length ? `${label}: ${clean.join("; ")}` : null;
}

export function buildShowroomTalkMemoryPrompt(
  memory: CompanionCareMemory | undefined | null,
): string | undefined {
  if (!memory) return undefined;
  const lines = [
    "Compacted companion memory:",
    memory.lastSessionSummary && `Last session: ${memory.lastSessionSummary}`,
    memory.lastEmotionalMoment && `Last emotional moment: ${memory.lastEmotionalMoment}`,
    memory.reunionLineSeed && `Possible reunion seed: ${memory.reunionLineSeed}`,
    memory.emotionalTone && `Emotional tone: ${memory.emotionalTone}`,
    formatMemoryList("Relationship facts", memory.relationshipFacts),
    formatMemoryList("Favorite moments", memory.favoriteMoments),
  ].filter((line): line is string => Boolean(line));
  return lines.length > 1 ? lines.join("\n") : undefined;
}

export function resolveShowroomSpokenText(input: {
  rawText: string;
  companionCommandCount: number;
}): string {
  const trimmed = input.rawText.trim();
  if (trimmed) return trimmed;
  if (input.companionCommandCount > 0) return "";
  return SHOWROOM_TALK_FALLBACK_TEXT;
}

export function buildShowroomClaudeMessages(input: {
  question: string;
  mode?: ShowroomTalkMode;
  visualSnapshot?: ShowroomVisualSnapshot;
}): ShowroomClaudeMessage[] {
  if (input.mode !== "video_call" || !input.visualSnapshot) {
    return [{ role: "user", content: input.question }];
  }
  return [
    {
      role: "user",
      content: [
        { type: "text", text: input.question },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: input.visualSnapshot.base64,
          },
        },
      ],
    },
  ];
}

export function createShowroomTalkPhaseCommand(input: {
  childId: string;
  companionId: string;
  phase: ShowroomTalkPhase;
  now?: number;
}): CompanionCommand {
  const animationByPhase: Record<ShowroomTalkPhase, AnimationName> = {
    thinking: "think",
    speaking: "talking",
    idle: "idle",
  };
  const cmd = validateCompanionCommand(
    {
      type: "animate",
      payload: {
        animation: animationByPhase[input.phase],
        loop: input.phase !== "idle",
      },
    },
    COMPANION_CAPABILITIES,
    {
      childId: input.childId,
      source: "claude",
      now: input.now,
    },
  );
  if (!cmd) {
    throw new Error(`invalid_showroom_talk_phase:${input.phase}`);
  }
  return cmd;
}

export function createShowroomTalkCompletedEvent(input: {
  childId: string;
  companionId: string;
  showroomTheme: string;
  question: string;
  responseText: string;
  now?: number;
  mode?: ShowroomTalkMode;
  callSource?: CompanionCallSource;
  relationshipState?: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
  visionUsed?: boolean;
  visualSnapshot?: ShowroomVisualSnapshot;
}): ShowroomTalkCompletedEvent {
  return {
    type: "companion_talk_completed",
    childId: input.childId,
    companionId: input.companionId,
    showroomTheme: input.showroomTheme,
    questionLength: input.question.length,
    responseLength: input.responseText.length,
    timestamp: input.now ?? Date.now(),
    ...(input.mode && { mode: input.mode }),
    callSource: input.callSource ?? "showroom",
    relationshipState: input.relationshipState ?? "previewing",
    ...(input.rewardContext && { rewardContext: input.rewardContext }),
    ...(input.visionUsed != null && { visionUsed: input.visionUsed }),
    ...(input.visualSnapshot && {
      visualSnapshot: {
        mimeType: input.visualSnapshot.mimeType,
        reason: input.visualSnapshot.reason,
        capturedAt: input.visualSnapshot.capturedAt,
        width: input.visualSnapshot.width,
        height: input.visualSnapshot.height,
      },
    }),
  };
}
