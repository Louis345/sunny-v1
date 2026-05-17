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

export type ShowroomTalkPhase = "thinking" | "speaking" | "idle";

export type ResolvedShowroomTalkRequest = {
  childId: string;
  companionId: string;
  voiceId: string;
  showroomTheme: "aurora" | "storybook" | "crystal";
  question: string;
};

export type ShowroomTalkCompletedEvent = {
  type: "companion_talk_completed";
  childId: string;
  companionId: string;
  showroomTheme: string;
  questionLength: number;
  responseLength: number;
  timestamp: number;
};

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

  return {
    ok: true,
    request: {
      childId,
      companionId,
      voiceId,
      showroomTheme,
      question,
    },
  };
}

export function buildShowroomTalkSystemPrompt(input: {
  companionId: string;
  companionName: string;
  showroomTheme: string;
  personality: string;
}): string {
  return [
    `You are ${input.companionName}, an interactive Sunny learning companion.`,
    `Current showroom room: ${input.showroomTheme}.`,
    `Persona notes: ${input.personality}`,
    "Answer the child directly in 1-3 short sentences.",
    "Use a warm, child-safe tone. Ask at most one follow-up question.",
    "If you want emotion, show emotion through movement with companionAct rather than describing stage directions in words.",
    "Do not mention rewards, currency, store purchases, or talent unlocks.",
    "Return only the words the companion should say aloud.",
  ].join("\n");
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
}): ShowroomTalkCompletedEvent {
  return {
    type: "companion_talk_completed",
    childId: input.childId,
    companionId: input.companionId,
    showroomTheme: input.showroomTheme,
    questionLength: input.question.length,
    responseLength: input.responseText.length,
    timestamp: input.now ?? Date.now(),
  };
}
