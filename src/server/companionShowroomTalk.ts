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
import {
  COMPANION_ACTIVITY_IDS,
  describeCompanionActivityChoices,
  getCompanionActivityDescriptor,
  isCompanionActivityId,
} from "../shared/companionActivities/registry";
import {
  MAX_ACTIVITY_BOARD_SIGNATURE_LENGTH,
  MAX_ACTIVITY_BOARD_TEXT_LENGTH,
  MAX_ACTIVITY_LABEL_LENGTH,
  MAX_ACTIVITY_MOVE_DESCRIPTION_LENGTH,
  type CompanionActivityBoardView,
  type CompanionActivityId,
  type CompanionActivityMove,
} from "../shared/companionActivities/types";

const SHOWROOM_TALK_THEMES = new Set(["aurora", "storybook", "crystal"]);
const SHOWROOM_TALK_CALL_SOURCES = new Set([
  "showroom",
  "mystery_box",
  "game_reward",
  "dev_preview",
  "activity_help",
]);
const SHOWROOM_TALK_RELATIONSHIP_STATES = new Set([
  "previewing",
  "selected",
  "earned_reward",
]);
const SHOWROOM_TALK_CONVERSATION_INTENTS = new Set([
  "social",
  "game",
  "repeat_after",
  "visual",
]);
const MAX_SHOWROOM_QUESTION_LENGTH = 500;
const MAX_VISUAL_SUMMARY_LENGTH = 360;
const MAX_VISUAL_SNAPSHOT_BASE64_LENGTH = 700_000;
const MAX_VISUAL_SNAPSHOT_DIMENSION = 1024;
const MAX_REWARD_CONTEXT_FIELD_LENGTH = 160;
const MAX_ACTIVITY_REASON_LENGTH = 180;
const MAX_SHOPPING_TEXT_LENGTH = 160;
const MAX_SHOPPING_ITEM_IDS = 100;
const MAX_SHOPPING_STYLE_TAGS = 12;
const MAX_SHOPPING_BALANCE = 1_000_000;
const SHOWROOM_ACTIVITY_STATUSES = new Set(["active", "completed"]);
const SHOWROOM_ACTIVITY_TURNS = new Set(["child", "companion", "none"]);
const SHOWROOM_ACTIVITY_RESULTS = new Set(["child_win", "companion_win", "draw"]);
const SHOWROOM_ACTIVITY_MOVE_BY = new Set(["child", "companion"]);
const SHOWROOM_ACTIVITY_REACTION_EVENTS = new Set([
  "game_started",
  "child_move",
  "companion_move",
  "round_complete",
]);
const SHOWROOM_TALK_FALLBACK_TEXT = "I'm here with you. Let's keep going.";
const SHOWROOM_COMPANION_ACT_CAPABILITIES = [
  ...COMPANION_CAPABILITIES.keys(),
] as string[];
const SHOWROOM_COMPANION_ACTIVITY_SURFACES = new Set(["video_call_overlay"]);

export type ShowroomTalkPhase = "thinking" | "speaking" | "idle";
export type ShowroomTalkMode = "showroom" | "video_call";
export type ShowroomConversationIntent = "social" | "game" | "repeat_after" | "visual";
export type CompanionCallSource =
  | "showroom"
  | "mystery_box"
  | "game_reward"
  | "dev_preview"
  | "activity_help";
export type CompanionRelationshipState = "previewing" | "selected" | "earned_reward";
export type CompanionRewardContext = {
  nodeId?: string;
  activityId?: string;
  rewardId?: string;
  earnedBy?: string;
};
export type ShowroomCompanionActivityId = CompanionActivityId;
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
  board: CompanionActivityBoardView;
  childLabel: string;
  companionLabel: string;
  turn: "child" | "companion" | "none";
  lastMove?: CompanionActivityMove;
  result?: "child_win" | "companion_win" | "draw";
  summary?: string;
  updatedAt?: number;
};
export type ShowroomActivityReactionEventType =
  | "game_started"
  | "child_move"
  | "companion_move"
  | "round_complete";
export type ShowroomActivityReactionContext = {
  activityId: ShowroomCompanionActivityId;
  eventType: ShowroomActivityReactionEventType;
  board: CompanionActivityBoardView;
  childLabel: string;
  companionLabel: string;
  turn: "child" | "companion" | "none";
  lastMove?: CompanionActivityMove;
  result?: ShowroomActiveActivityContext["result"];
  summary?: string;
  desiredTone?: string;
  updatedAt?: number;
  /**
   * Verb phrase for the move the companion is about to make, e.g.
   * "place your O on square 5". The board shown is from before that move.
   */
  plannedMove?: string;
};
export type ShowroomVisualSnapshot = {
  base64: string;
  mimeType: "image/jpeg";
  reason: string;
  capturedAt: number;
  width: number;
  height: number;
};
export type ShowroomShoppingContext = {
  mode: "entrance" | "review" | "try_on";
  visitId: string;
  walletBalance: number;
  companionWish: string;
  companionMood: { id: string; label: string };
  selectedItem: {
    id: string;
    name: string;
    price: number;
    category: "accessory" | "outfit";
    styleTags: string[];
    owned: boolean;
    saved: boolean;
    preferenceMatch: boolean;
    opinionVerdict: "love" | "like" | "unsure" | "reject";
    opinionReasons: string[];
    companionConsentsToWear: boolean;
  } | null;
  ownedItemIds: string[];
  savedItemIds: string[];
};
/** Call clock moments (owner, 2026-11-07). The screen names the moment; the server supplies the facts. */
export type ShowroomCallClockEvent = "minute_left" | "time_up" | "minutes_bought";
const CALL_CLOCK_EVENTS: readonly ShowroomCallClockEvent[] = ["minute_left", "time_up", "minutes_bought"];
export type ShowroomCallClockFacts = { event: ShowroomCallClockEvent; minutesLeft: number; secondsLeft?: number; coins: number; price: number; minutes: number };

export type ShowroomShoppingEvent = {
  type: "item_reviewed" | "try_on_started";
  itemId: string;
};

export type ShoppingSpeechGuardResult = {
  accepted: boolean;
  reason:
    | "generic_fallback"
    | "incomplete_response"
    | "verdict_mismatch"
    | "item_role_confusion"
    | null;
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
  activityReaction?: ShowroomActivityReactionContext;
  conversationIntent?: ShowroomConversationIntent;
  callTraceId?: string;
  turnId?: string;
  visualSnapshot?: ShowroomVisualSnapshot;
  lastVisualSummary?: string;
  shoppingContext?: ShowroomShoppingContext;
  shoppingEvent?: ShowroomShoppingEvent;
  callClockEvent?: ShowroomCallClockEvent;
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

export const REMEMBER_CHILD_GIVEN_NAME_TOOL = "rememberWhatChildCallsMe";
export const RECALL_ABOUT_HER_TOOL = "recallAboutHer";

/** The companion's own way to keep a name or role the child gives it; code stores it, the companion decides. */
export function getShowroomRelationshipTools() {
  return [
    {
      name: REMEMBER_CHILD_GIVEN_NAME_TOOL,
      description:
        "Remember a nickname or a role the child just gave you, so you keep it in this call and every later call. Use it when she names you or casts you as someone; do not use it for names she gives to other things.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "The nickname or role, in her words." },
          kind: { type: "string", enum: ["nickname", "role"] },
          childWords: { type: "string", description: "What she said when she gave it." },
        },
        required: ["name", "kind"],
        additionalProperties: false,
      },
    },
    {
      name: RECALL_ABOUT_HER_TOOL,
      description:
        "Look up something older she told you or any of her other companions: a topic, a person, a place, a word. Returns dated facts (current or replaced by something newer) and her own words from earlier calls. Use it when she mentions something you might already know about.",
      input_schema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "A word or short phrase, like wrestling or her teacher." } },
        required: ["query"],
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
            enum: [...COMPANION_ACTIVITY_IDS],
            description: `The companion activity to open. Available: ${COMPANION_ACTIVITY_IDS.join(", ")}.`,
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
  if (!isCompanionActivityId(activityId) || !SHOWROOM_COMPANION_ACTIVITY_SURFACES.has(surface)) {
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

function resolveShowroomConversationIntent(
  value: unknown,
  fallback?: ShowroomConversationIntent,
): ShowroomConversationIntent | undefined {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SHOWROOM_TALK_CONVERSATION_INTENTS.has(raw)
    ? (raw as ShowroomConversationIntent)
    : fallback;
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

function resolveShoppingText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > MAX_SHOPPING_TEXT_LENGTH) return null;
  return trimmed;
}

function resolveShoppingTextList(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const resolved = value.map(resolveShoppingText);
  return resolved.some((item) => item === null) ? null : (resolved as string[]);
}

function resolveShoppingContext(
  value: unknown,
): ShowroomShoppingContext | undefined | null {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.mode !== "entrance" &&
    raw.mode !== "review" &&
    raw.mode !== "try_on"
  ) return null;
  if (
    typeof raw.walletBalance !== "number" ||
    !Number.isInteger(raw.walletBalance) ||
    raw.walletBalance < 0 ||
    raw.walletBalance > MAX_SHOPPING_BALANCE
  ) {
    return null;
  }
  const companionWish = resolveShoppingText(raw.companionWish);
  const visitId = resolveShoppingText(raw.visitId);
  if (
    !raw.companionMood ||
    typeof raw.companionMood !== "object" ||
    Array.isArray(raw.companionMood)
  ) return null;
  const rawMood = raw.companionMood as Record<string, unknown>;
  const moodId = resolveShoppingText(rawMood.id);
  const moodLabel = resolveShoppingText(rawMood.label);
  const ownedItemIds = resolveShoppingTextList(raw.ownedItemIds, MAX_SHOPPING_ITEM_IDS);
  const savedItemIds = resolveShoppingTextList(raw.savedItemIds, MAX_SHOPPING_ITEM_IDS);
  if (!visitId || !companionWish || !moodId || !moodLabel || !ownedItemIds || !savedItemIds) {
    return null;
  }

  let selectedItem: ShowroomShoppingContext["selectedItem"] = null;
  if (raw.selectedItem != null) {
    if (typeof raw.selectedItem !== "object" || Array.isArray(raw.selectedItem)) {
      return null;
    }
    const selected = raw.selectedItem as Record<string, unknown>;
    const id = resolveShoppingText(selected.id);
    const name = resolveShoppingText(selected.name);
    const styleTags = resolveShoppingTextList(
      selected.styleTags,
      MAX_SHOPPING_STYLE_TAGS,
    );
    const opinionReasons = resolveShoppingTextList(
      selected.opinionReasons,
      MAX_SHOPPING_STYLE_TAGS,
    );
    const opinionVerdict = selected.opinionVerdict;
    const validOpinionVerdict =
      opinionVerdict === "love" ||
      opinionVerdict === "like" ||
      opinionVerdict === "unsure" ||
      opinionVerdict === "reject";
    if (
      !id ||
      !name ||
      !styleTags ||
      !opinionReasons ||
      !validOpinionVerdict ||
      (selected.category !== "accessory" && selected.category !== "outfit") ||
      typeof selected.price !== "number" ||
      !Number.isInteger(selected.price) ||
      selected.price < 0 ||
      selected.price > MAX_SHOPPING_BALANCE ||
      typeof selected.owned !== "boolean" ||
      typeof selected.saved !== "boolean" ||
      typeof selected.preferenceMatch !== "boolean" ||
      typeof selected.companionConsentsToWear !== "boolean" ||
      (opinionVerdict === "reject") === selected.companionConsentsToWear
    ) {
      return null;
    }
    selectedItem = {
      id,
      name,
      price: selected.price,
      category: selected.category,
      styleTags,
      owned: selected.owned,
      saved: selected.saved,
      preferenceMatch: selected.preferenceMatch,
      opinionVerdict,
      opinionReasons,
      companionConsentsToWear: selected.companionConsentsToWear,
    };
  }

  if (raw.mode === "entrance" && selectedItem !== null) return null;
  if (raw.mode !== "entrance" && selectedItem === null) return null;

  return {
    mode: raw.mode,
    visitId,
    walletBalance: raw.walletBalance,
    companionWish,
    companionMood: { id: moodId, label: moodLabel },
    selectedItem,
    ownedItemIds,
    savedItemIds,
  };
}

function resolveShoppingEvent(
  value: unknown,
): ShowroomShoppingEvent | undefined | null {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const itemId = resolveShoppingText(raw.itemId);
  if (
    (raw.type !== "item_reviewed" && raw.type !== "try_on_started") ||
    !itemId
  ) return null;
  return { type: raw.type, itemId };
}

/**
 * Games author their own board rendering, so the server sanitizes rather than
 * interprets: strip control characters, collapse whitespace, apply a cap.
 */
function sanitizeActivityText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function resolveActivityBoardView(value: unknown): CompanionActivityBoardView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = sanitizeActivityText(raw.text, MAX_ACTIVITY_BOARD_TEXT_LENGTH);
  const signature = sanitizeActivityText(raw.signature, MAX_ACTIVITY_BOARD_SIGNATURE_LENGTH);
  if (!text || !signature) return null;
  return { text, signature };
}

function resolveActiveActivityMove(value: unknown): CompanionActivityMove | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const by =
    typeof raw.by === "string" && SHOWROOM_ACTIVITY_MOVE_BY.has(raw.by)
      ? (raw.by as "child" | "companion")
      : null;
  const description = sanitizeActivityText(
    raw.description,
    MAX_ACTIVITY_MOVE_DESCRIPTION_LENGTH,
  );
  if (!by || !description) return undefined;
  const timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : undefined;
  return {
    by,
    description,
    ...(timestamp !== undefined && { timestamp }),
  };
}

function resolveShowroomActiveActivity(
  value: unknown,
): ShowroomActiveActivityContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (!isCompanionActivityId(raw.activityId) || raw.surface !== "video_call_overlay") {
    return undefined;
  }
  const board = resolveActivityBoardView(raw.board);
  if (!board) return undefined;
  const childLabel = sanitizeActivityText(raw.childLabel, MAX_ACTIVITY_LABEL_LENGTH);
  const companionLabel = sanitizeActivityText(raw.companionLabel, MAX_ACTIVITY_LABEL_LENGTH);
  if (!childLabel || !companionLabel) return undefined;
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
    activityId: raw.activityId,
    surface: "video_call_overlay",
    status,
    board,
    childLabel,
    companionLabel,
    turn,
    ...(lastMove && { lastMove }),
    ...(result && { result }),
    ...(summary && { summary }),
    ...(updatedAt !== undefined && { updatedAt }),
  };
}

function resolveShowroomActivityReaction(
  value: unknown,
): ShowroomActivityReactionContext | undefined | null {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isCompanionActivityId(raw.activityId)) return null;
  const eventType =
    typeof raw.eventType === "string" && SHOWROOM_ACTIVITY_REACTION_EVENTS.has(raw.eventType)
      ? (raw.eventType as ShowroomActivityReactionEventType)
      : null;
  const board = resolveActivityBoardView(raw.board);
  const turn =
    typeof raw.turn === "string" && SHOWROOM_ACTIVITY_TURNS.has(raw.turn)
      ? (raw.turn as "child" | "companion" | "none")
      : null;
  const childLabel = sanitizeActivityText(raw.childLabel, MAX_ACTIVITY_LABEL_LENGTH);
  const companionLabel = sanitizeActivityText(raw.companionLabel, MAX_ACTIVITY_LABEL_LENGTH);
  if (!eventType || !board || !turn || !childLabel || !companionLabel) return null;
  const lastMove = resolveActiveActivityMove(raw.lastMove);
  const result =
    typeof raw.result === "string" && SHOWROOM_ACTIVITY_RESULTS.has(raw.result)
      ? (raw.result as ShowroomActivityReactionContext["result"])
      : undefined;
  const summary = resolveVisualSummary(raw.summary);
  const desiredTone =
    typeof raw.desiredTone === "string" && raw.desiredTone.trim()
      ? raw.desiredTone.trim().replace(/\s+/g, "_").slice(0, 80)
      : undefined;
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : undefined;
  // Games author this verb phrase; the server can only sanitize it. Move
  // legality is enforced client-side by each game's engine (see its tests) —
  // the server cannot validate chess legality by design.
  const plannedMove = sanitizeActivityText(
    raw.plannedMove,
    MAX_ACTIVITY_MOVE_DESCRIPTION_LENGTH,
  );
  return {
    activityId: raw.activityId,
    eventType,
    board,
    childLabel,
    companionLabel,
    turn,
    ...(lastMove && { lastMove }),
    ...(result && { result }),
    ...(summary && { summary }),
    ...(desiredTone && { desiredTone }),
    ...(updatedAt !== undefined && { updatedAt }),
    ...(plannedMove !== undefined && { plannedMove }),
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
  const activityReaction = resolveShowroomActivityReaction(raw.activityReaction);
  if (activityReaction === null) {
    return { ok: false, status: 400, error: "invalid_activity_reaction" };
  }
  const conversationIntent = resolveShowroomConversationIntent(raw.conversationIntent);
  const shoppingContext = resolveShoppingContext(raw.shoppingContext);
  if (shoppingContext === null) {
    return { ok: false, status: 400, error: "invalid_shopping_context" };
  }
  const shoppingEvent = resolveShoppingEvent(raw.shoppingEvent);
  if (shoppingEvent === null) {
    return { ok: false, status: 400, error: "invalid_shopping_event" };
  }
  const callClockEvent = raw.callClockEvent == null ? undefined
    : CALL_CLOCK_EVENTS.find((event) => event === raw.callClockEvent) ?? null;
  if (callClockEvent === null) {
    return { ok: false, status: 400, error: "invalid_call_clock_event" };
  }
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
      ...(mode === "video_call" && activityReaction && { activityReaction }),
      ...(mode === "video_call" && conversationIntent && { conversationIntent }),
      ...(mode === "video_call" && shoppingContext && { shoppingContext }),
      ...(mode === "video_call" && shoppingEvent && { shoppingEvent }),
      ...(mode === "video_call" && callClockEvent && { callClockEvent }),
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
  activityReaction?: ShowroomActivityReactionContext;
  conversationIntent?: ShowroomConversationIntent;
  companionMemory?: string;
  shoppingContext?: ShowroomShoppingContext;
  shoppingEvent?: ShowroomShoppingEvent;
  callClock?: ShowroomCallClockFacts;
}): string {
  const callSource = input.callSource ?? "showroom";
  const relationshipState = input.relationshipState ?? "previewing";
  const isVideoCall = input.mode === "video_call";
  const lines = [
    isVideoCall
      ? `You are ${input.companionName}, a video-call companion friend.`
      : `You are ${input.companionName}, an interactive Sunny companion.`,
    `Current showroom room: ${input.showroomTheme}.`,
    `Call source: ${callSource}.`,
    `Relationship state: ${relationshipState}.`,
    `Persona notes: ${input.personality}`,
    "Answer the child directly in 1-3 short sentences.",
    "Use a warm, child-safe tone. Ask at most one follow-up question.",
    "Never tutor unless the child explicitly asks for learning help; follow the child's conversational lead.",
    "The child may be playing, chatting, joking, testing the call, or asking for help; be fun and relationship-first.",
    "Do not repeat your previous greeting, opener, or last sentence; continue from the child's newest turn.",
    `When she brings up something you might already know about, call ${RECALL_ABOUT_HER_TOOL} to remember what she told you or her other companions before. If the child gives you a nickname or a role, it is her game: play along, and call ${REMEMBER_CHILD_GIVEN_NAME_TOOL} so you keep it. You can still know your own name, but never correct her or argue about what she calls you.`,
    "If you want emotion, show emotion through movement with companionAct rather than describing stage directions in words.",
    `If the child asks to play ${describeCompanionActivityChoices()}, use openCompanionActivity with the matching activityId (${COMPANION_ACTIVITY_IDS.join(", ")}) and surface=video_call_overlay.`,
    "Do not say stage directions. Do not say things like 'I wave', '*waves*', or 'I smile'; call companionAct for that motion and keep spoken text natural.",
    "Speech is optional; visual action is preferred when the child is working, feeding, earning a reward, or just hanging out.",
    "When no spoken answer adds value, use companionAct and leave the spoken text empty.",
    "This chat cannot grant coins, XP, store purchases, or talent unlocks.",
    "Always answer in one response: first write the words you say aloud as plain message text, then call companionAct for the matching gesture in that same response. Never wait for tool results before speaking.",
    "Never send a tool-only response when the child asked you something or a spoken line is expected; the spoken text comes first, the tool call comes second.",
    "Only leave the message text empty when the child is quietly working and silence is genuinely better.",
    "The message text must contain only the words spoken aloud; no stage directions, labels, or commentary.",
  ];
  if (input.conversationIntent) {
    lines.push(`Conversation intent: ${input.conversationIntent}.`);
  }
  if (input.conversationIntent === "repeat_after") {
    lines.push(
      "For repeat_after turns, repeat the child's newest words or invite them to say the phrase if they just asked to start.",
      "Do not treat numbers as game moves during repeat_after turns.",
    );
  }
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
  if (isVideoCall) {
    lines.push("When you tell her to tap or press something, name only a control from What is on her screen right now. If she asks for something the screen cannot do, say so plainly and offer what you can do.");
  }
  if (input.shoppingContext) {
    const shopping = input.shoppingContext;
    lines.push(
      "Active shared shopping context (code-provided store truth):",
      `Shopping mode: ${shopping.mode}.`,
      `Shopping visit mood: ${shopping.companionMood.label} (id=${shopping.companionMood.id}).`,
      `Wallet balance: ${shopping.walletBalance} demo coins.`,
      `Companion wish: ${shopping.companionWish}.`,
      "The child controls spending. You may express a preference, but you cannot buy, promise a purchase, pressure the child, or treat your wish as spending authority.",
    );
    if (shopping.selectedItem) {
      const item = shopping.selectedItem;
      lines.push(
        `Selected item: ${item.name} (id=${item.id}, category=${item.category}, price=${item.price} demo coins).`,
        `Selected item state: owned=${item.owned}, saved=${item.saved}, preference_match=${item.preferenceMatch}.`,
        `Selected item style: ${item.styleTags.join(", ") || "none listed"}.`,
        `Code-owned companion verdict: ${item.opinionVerdict}.`,
        `Code-owned opinion reasons: ${item.opinionReasons.join(", ") || "none"}.`,
        `Companion consents to wear: ${item.companionConsentsToWear}.`,
        "Treat the code-owned verdict as truth. Express it naturally in your persona; do not reverse it, soften a rejection into approval, or invent a different verdict.",
        "A like verdict is not love or obsession; keep the strength of the spoken opinion equal to the code-owned verdict.",
        "The selected item is for you, the companion, to try on. Do not imply that the child is wearing it or that you and the child need matching copies.",
      );
      if (!item.companionConsentsToWear) {
        lines.push(
          "This item cannot be bought-and-worn or equipped during this visit. The child may save it or keep looking. Be honest without shaming the child's taste or pressuring them.",
        );
      }
      if (shopping.mode === "try_on") {
        lines.push(
          "You are wearing the selected item in the try-on view. React to that exact item and do not guess from pixels.",
        );
      }
    } else {
      lines.push("No store item is currently selected.");
    }
    lines.push(
      `Owned item ids: ${shopping.ownedItemIds.join(", ") || "none"}.`,
      `Saved item ids: ${shopping.savedItemIds.join(", ") || "none"}.`,
    );
  }
  if (input.shoppingEvent?.type === "item_reviewed") {
    lines.push(
      `Live store event: the child selected item id=${input.shoppingEvent.itemId} for review.`,
      "Always include one short spoken reaction grounded in the selected item, code-owned mood, and verdict. You may also use one expressive companionAct gesture.",
      "This event came from the store UI, not from words spoken by the child. Do not pretend the child asked a question.",
    );
  }
  if (input.shoppingEvent?.type === "try_on_started") {
    lines.push(
      `Live store event: the child just tried on item id=${input.shoppingEvent.itemId}.`,
      "Always include one short spoken reaction grounded in the selected item and code-owned verdict. You may also use one expressive companionAct gesture.",
      "This event came from the store UI, not from words spoken by the child. Do not pretend the child asked a question.",
    );
  }
  if (input.callClock) {
    const clock = input.callClock;
    const moment = clock.event === "minute_left"
      ? "about one minute of call time is left"
      : clock.event === "time_up"
        ? "call time is up"
        : `the child just spent coins on more call time; about ${Math.max(1, Math.round(((clock.secondsLeft ?? clock.minutesLeft * 60) + 60) / 60))} minutes are left now`;
    lines.push(
      `Live call clock event: ${moment}. The child has ${clock.coins} coins; 5 more minutes cost ${clock.price} coins.`,
      clock.coins >= clock.price
        ? "She can afford more time."
        : `She cannot afford more time yet; she needs ${clock.price - clock.coins} more coins. Do not offer to buy time; finishing another board earns more coins and another call.`,
      clock.event === "time_up"
        ? "In one or two short sentences, react in your own voice: she can buy more time or say goodbye for now. Never pressure her to spend, and if she cannot afford it, make finishing another board sound like the way back."
        : "Mention it in one short sentence in your own voice, then carry on with the conversation.",
      "This event came from the call clock, not from words spoken by the child. Do not pretend the child asked a question.",
    );
  }
  if (input.activeActivity) {
    const activeDescriptor = getCompanionActivityDescriptor(input.activeActivity.activityId);
    const gameIsForeground =
      input.conversationIntent == null ||
      input.conversationIntent === "game" ||
      Boolean(input.activityReaction);
    lines.push(
      `Active video-call activity: ${activeDescriptor.displayName}.`,
      `Board: ${input.activeActivity.board.text}.`,
      `Child plays: ${input.activeActivity.childLabel}; companion plays: ${input.activeActivity.companionLabel}.`,
      `Current turn: ${input.activeActivity.turn}.`,
      `Activity status: ${input.activeActivity.status}.`,
      ...activeDescriptor.promptHints,
    );
    if (gameIsForeground) {
      lines.push(
        `Stay aware of this activity when answering. If the child asks what to do, talks about a ${activeDescriptor.moveNoun}, asks why you moved, or continues the game, answer in ${activeDescriptor.displayName} context instead of acting like no game is open.`,
        `If ${activeDescriptor.displayName} is already active, do not ask to start ${activeDescriptor.displayName} again; respond as if the board is shared between you and the child.`,
      );
    } else {
      lines.push(
        `The game is background context for this turn; answer the child's newest request and do not redirect back to ${activeDescriptor.displayName} unless they ask about the game.`,
      );
    }
    if (input.activeActivity.lastMove) {
      lines.push(
        `Last move: ${input.activeActivity.lastMove.by} ${input.activeActivity.lastMove.description}.`,
      );
    }
    if (input.activeActivity.result) {
      lines.push(`Round result: ${input.activeActivity.result}.`);
    }
    if (input.activeActivity.summary) {
      lines.push(`Activity summary: ${input.activeActivity.summary}`);
    }
  }
  if (input.activityReaction) {
    const reactionDescriptor = getCompanionActivityDescriptor(
      input.activityReaction.activityId,
    );
    const board = input.activityReaction.board.text;
    const requiresSpeech = shouldRequireShowroomActivityReactionSpeech(
      input.activityReaction.eventType,
    );
    lines.push(
      `This request is an activity reaction for ${reactionDescriptor.displayName}, not a normal child question.`,
      "Use companionAct for a gesture that matches the words. Every AI-authored activity reaction should include one gesture when possible.",
      `Do not use local canned ${reactionDescriptor.displayName} banter. Author the reaction from the board, last move, result, and companion persona.`,
      requiresSpeech
        ? "This activity reaction requires one short spoken line plus companionAct when possible. Say the line in this same response - write the spoken words as message text first, then call companionAct; do not send a tool-only response and do not wait for tool results."
        : "For child_move reactions, prefer a quick gesture and keep spoken words optional so stale speech does not trail the board.",
      `Activity reaction event: ${input.activityReaction.eventType}.`,
      `Reaction board: ${board}.`,
      `Reaction turn: ${input.activityReaction.turn}.`,
      ...(input.activityReaction.eventType === "companion_move" &&
      input.activityReaction.plannedMove
        ? [
            `You are about to ${input.activityReaction.plannedMove}; the board shown is from before that move.`,
            `Speak as you make this move - present tense, one short playful line that fits why this ${reactionDescriptor.moveNoun} is a good pick.`,
          ]
        : []),
      "Gesture map: companion move = thinking, pointing, or confident gesture; child strong move = surprised, curious, or respectful gesture; child win = happy, wave, or surprise; companion win = playful confidence; Round draw: shrug or thoughtful gesture.",
    );
    if (input.activityReaction.lastMove) {
      lines.push(
        `Reaction last move: ${input.activityReaction.lastMove.by} ${input.activityReaction.lastMove.description}.`,
      );
    }
    if (input.activityReaction.result) {
      lines.push(`Reaction result: ${input.activityReaction.result}.`);
    }
    if (input.activityReaction.desiredTone) {
      lines.push(`Desired reaction tone: ${input.activityReaction.desiredTone}.`);
    }
    if (input.activityReaction.summary) {
      lines.push(`Reaction summary: ${input.activityReaction.summary}`);
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

export function shouldRequireShowroomActivityReactionSpeech(
  eventType: ShowroomActivityReactionEventType,
): boolean {
  return (
    eventType === "game_started" ||
    eventType === "companion_move" ||
    eventType === "round_complete"
  );
}

function formatChildGivenNames(names: CompanionCareMemory["childGivenNames"]): string | null {
  if (!names?.length) return null;
  const list = names.map((row) => `"${row.name}" (${row.kind === "role" ? "a role she gave you" : "her nickname for you"})`);
  return `What she calls you: ${list.join("; ")}. Answer to it and play along; never correct her.`;
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
    formatMemoryList("Relationship facts", memory.relationshipFacts),
    formatMemoryList("Favorite moments", memory.favoriteMoments),
    formatMemoryList("Things you have shown about yourself", memory.companionSelfNotes),
    formatChildGivenNames(memory.childGivenNames),
    formatCompanionGameRecord(memory.gameRecord),
    memory.rivalryNote && `Rivalry note: ${memory.rivalryNote}`,
  ].filter((line): line is string => Boolean(line));
  return lines.length > 1 ? lines.join("\n") : undefined;
}

/**
 * The win/loss history is counted by the app, so the companion can refer to it
 * as fact. Claude must not invent a different tally.
 */
function formatCompanionGameRecord(
  record: CompanionCareMemory["gameRecord"],
): string | null {
  const entries = Object.entries(record ?? {}).filter(([, value]) => value?.played > 0);
  if (entries.length === 0) return null;
  const summaries = entries.map(([activityId, value]) => {
    const name = isCompanionActivityId(activityId)
      ? getCompanionActivityDescriptor(activityId).displayName
      : activityId;
    const streak =
      value.currentStreak > 1
        ? `; the child has won ${value.currentStreak} in a row`
        : value.currentStreak < -1
          ? `; you have won ${Math.abs(value.currentStreak)} in a row`
          : "";
    return `${name}: ${value.played} played, child won ${value.childWins}, you won ${value.companionWins}, ${value.draws} drawn${streak}`;
  });
  return `Game record (exact, do not contradict or invent numbers): ${summaries.join(" | ")}`;
}

export function resolveShowroomSpokenText(input: {
  rawText: string;
  companionCommandCount: number;
  requireGeneratedSpeech?: boolean;
  shoppingContextPresent?: boolean;
}): string {
  const trimmed = input.rawText.trim();
  if (trimmed) return trimmed;
  if (input.companionCommandCount > 0) return "";
  if (input.requireGeneratedSpeech) return "";
  if (input.shoppingContextPresent) return "";
  return SHOWROOM_TALK_FALLBACK_TEXT;
}

export function evaluateShoppingSpeech(input: {
  text: string;
  verdict: NonNullable<ShowroomShoppingContext["selectedItem"]>["opinionVerdict"];
}): ShoppingSpeechGuardResult {
  const text = input.text.replace(/\s+/g, " ").trim();
  const normalized = text.toLowerCase();
  if (!text) return { accepted: false, reason: "incomplete_response" };
  if (normalized === SHOWROOM_TALK_FALLBACK_TEXT.toLowerCase()) {
    return { accepted: false, reason: "generic_fallback" };
  }
  if (/\b(?:get|buy|wear)\s+(?:one|it|this)\s+too\b/i.test(text)) {
    return { accepted: false, reason: "item_role_confusion" };
  }
  if (
    /\bi can feel (?:this|the)\s+[a-z-]+$/i.test(text) ||
    /(?:\b(?:and|but|because|so|though)|[—-])\s*$/i.test(text)
  ) {
    return { accepted: false, reason: "incomplete_response" };
  }
  const strongApproval =
    /\b(?:i(?:'m| am) obsessed|i (?:really |absolutely )?love|my favorite|it(?:'s| is) perfect)\b/i;
  const anyApproval =
    /\b(?:i (?:really )?(?:like|love)|i(?:'m| am) obsessed|my favorite|it(?:'s| is) perfect)\b/i;
  if (
    (input.verdict === "like" && strongApproval.test(text)) ||
    (input.verdict === "unsure" && strongApproval.test(text)) ||
    (input.verdict === "reject" && anyApproval.test(text))
  ) {
    return { accepted: false, reason: "verdict_mismatch" };
  }
  return { accepted: true, reason: null };
}

export function shouldSynthesizeShowroomSpeech(
  spokenText: string,
  apiKey: string | undefined,
): boolean {
  return Boolean(spokenText.trim() && apiKey?.trim());
}

export function shouldRunShowroomToolFollowup(input: {
  isActivityReaction: boolean;
  rawText: string;
  companionActToolUseCount: number;
  activityToolUseCount: number;
  relationshipToolUseCount?: number;
  activityReactionEventType?: ShowroomActivityReactionEventType;
}): boolean {
  const toolUseCount =
    input.companionActToolUseCount + input.activityToolUseCount + (input.relationshipToolUseCount ?? 0);
  if (toolUseCount === 0) return false;
  if (input.rawText.trim().length > 0) return false;
  if (!input.isActivityReaction) return true;
  return input.activityReactionEventType
    ? shouldRequireShowroomActivityReactionSpeech(input.activityReactionEventType)
    : true;
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
