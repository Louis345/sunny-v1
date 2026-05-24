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

const SHOWROOM_TALK_THEMES = new Set(["aurora", "storybook", "crystal"]);
const MAX_SHOWROOM_QUESTION_LENGTH = 500;
const MAX_VISUAL_SUMMARY_LENGTH = 360;
const MAX_VISUAL_SNAPSHOT_BASE64_LENGTH = 700_000;
const MAX_VISUAL_SNAPSHOT_DIMENSION = 1024;
const SHOWROOM_TALK_FALLBACK_TEXT = "I'm here with you. Let's keep going.";
const SHOWROOM_COMPANION_ACT_CAPABILITIES = [
  ...COMPANION_CAPABILITIES.keys(),
] as string[];

export type ShowroomTalkPhase = "thinking" | "speaking" | "idle";
export type ShowroomTalkMode = "showroom" | "video_call";
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

function resolveShowroomTalkMode(value: unknown): ShowroomTalkMode {
  return value === "video_call" ? "video_call" : "showroom";
}

function resolveVisualSummary(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, MAX_VISUAL_SUMMARY_LENGTH) : undefined;
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
  const rawSnapshot = raw.visualSnapshot;
  const visualSnapshot = resolveVisualSnapshot(rawSnapshot);
  if (rawSnapshot != null && !visualSnapshot) {
    return { ok: false, status: 400, error: "invalid_visual_snapshot" };
  }
  const lastVisualSummary = resolveVisualSummary(raw.lastVisualSummary);

  return {
    ok: true,
    request: {
      childId,
      companionId,
      voiceId,
      showroomTheme,
      question,
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
}): string {
  const lines = [
    `You are ${input.companionName}, an interactive Sunny learning companion.`,
    `Current showroom room: ${input.showroomTheme}.`,
    `Persona notes: ${input.personality}`,
    "Answer the child directly in 1-3 short sentences.",
    "Use a warm, child-safe tone. Ask at most one follow-up question.",
    "If you want emotion, show emotion through movement with companionAct rather than describing stage directions in words.",
    "Do not say stage directions. Do not say things like 'I wave', '*waves*', or 'I smile'; call companionAct for that motion and keep spoken text natural.",
    "Speech is optional; visual action is preferred when the child is working, feeding, earning a reward, or just hanging out.",
    "When no spoken answer adds value, use companionAct and leave the spoken text empty.",
    "Do not mention rewards, currency, store purchases, or talent unlocks.",
    "Return only the words the companion should say aloud, or an empty string when silence is better.",
  ];
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
