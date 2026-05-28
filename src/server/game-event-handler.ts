/**
 * Iframe game events (Word Builder, spell-check, clock, generic games).
 * Session state lives on SessionManager; this module holds extracted handlers (no circular imports).
 */

import { recordClockAttempt } from "../engine/clockTracker";
import { childIdFromName, recordAttempt } from "../engine/learningEngine";
import { recordLearningAttempt } from "./learningAttemptEvents";
import { buildFlowGameEventFields } from "./flow-game-debug";
import { buildGameContextSummary } from "./gameContextSummary";
import {
  recordCompanionVideoCallTraceEvent,
  type CompanionVideoCallTraceEventName,
} from "./companionVideoCallTrace";

export const WB_ACTIVITY_MS = 90_000;

const TRACEABLE_GAME_EVENT_TYPES = new Set([
  "combo_breaker",
  "pronunciation_hit",
  "pronunciation_miss",
  "pronunciation_latency_span",
  "voice_control",
  "narration_request",
  "game_state_update",
  "attempt_event",
  "activity_evidence",
  "game_complete",
  "node_complete",
  "video_chat_started",
  "companion_video_call_trace",
  "companion_tic_tac_toe_started",
  "companion_tic_tac_toe_child_move",
  "companion_tic_tac_toe_companion_move",
  "companion_tic_tac_toe_round_complete",
  "companion_tic_tac_toe_reset",
]);

/** @internal SessionManager instance — fields accessed intentionally across module boundary */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SM = any;

function chartChildIdForSession(s: SM): string {
  const chartChildId = typeof s.chartChildId === "string" ? s.chartChildId.trim().toLowerCase() : "";
  return chartChildId || childIdFromName(s.childName);
}

export function clearGameTtsFallbackTimer(s: SM): void {
  if (s.gameTtsFallbackTimer) {
    clearTimeout(s.gameTtsFallbackTimer);
    s.gameTtsFallbackTimer = null;
  }
}

export function clearWbActivityTimeout(s: SM): void {
  if (s.wbActivityTimeout) {
    clearTimeout(s.wbActivityTimeout);
    s.wbActivityTimeout = null;
  }
}

export function abortGameTtsGate(s: SM): void {
  s.gamePendingRevision = null;
  clearGameTtsFallbackTimer(s);
  s.turnSM.clearGameTtsHold();
}

export function armGameTtsGate(s: SM, revision: number): void {
  clearGameTtsFallbackTimer(s);
  s.gamePendingRevision = revision;
  s.turnSM.armGameTtsHold();
  s.gameTtsFallbackTimer = setTimeout(() => {
    s.gameTtsFallbackTimer = null;
    if (s.gamePendingRevision !== revision) return;
    console.warn("  ⏱️  game `ready` TTS gate timeout — releasing buffer");
    releaseGameTtsFlush(s);
  }, 5000);
}

export function releaseGameTtsFlush(s: SM): void {
  if (s.gamePendingRevision === null) return;
  s.gamePendingRevision = null;
  clearGameTtsFallbackTimer(s);
  s.turnSM.releaseDeferredTts();
  void tryCompleteTtsTurnAsync(s);
}

export async function tryCompleteTtsTurnAsync(s: SM): Promise<void> {
  if (!s.deferredTtsFinish) return;
  if (s.turnSM.getState() === "CANVAS_PENDING") return;
  if (s.gamePendingRevision !== null) return;
  s.deferredTtsFinish = false;
  if (s.ttsBridge) {
    await s.ttsBridge.finish();
  }
  s.send("audio_done");
}

export function wbEndCleanup(s: SM): void {
  clearWbActivityTimeout(s);
  s.wbAwaitingSpell = false;
  s.wbToolExecuteClaimed = false;
  s.wbActive = false;
  s.wbRound = 0;
  s.wbWord = "";
  s.wbLastProcessedRound = 0;
  s.pendingRoundComplete = null;
  abortGameTtsGate(s);
  s.wordBuilderSessionActive = false;
  s.activeWordBuilderWord = "";
}

export function armWbActivityTimeout(s: SM): void {
  clearWbActivityTimeout(s);
  s.wbActivityTimeout = setTimeout(() => {
    s.wbActivityTimeout = null;
    if (!s.wbActive) return;
    if (s.wbAwaitingSpell) {
      return;
    }
    console.warn(
      "  ⚠️  Word Builder timeout — no activity in 90s; returning to IDLE",
    );
    wbEndCleanup(s);
    s.turnSM.onWordBuilderEnd();
    s.send("canvas_draw", { mode: "idle" });
    s.send("game_message", { forward: { type: "clear" } });
  }, WB_ACTIVITY_MS);
}

export function finalizeWordBuilderSessionFromIframe(
  s: SM,
  completedWord: string,
): void {
  s.wbAwaitingSpell = true;
  clearWbActivityTimeout(s);
  s.turnSM.onWordBuilderEnd();
  s.clearActiveCanvasActivity();
  s.send("canvas_draw", { mode: "idle" });
  s.noteExternalEvent?.({
    source: "word_builder_session_complete",
    summary: `Word Builder completed ${completedWord}.`,
  });
  void recordAttempt(chartChildIdForSession(s), {
    word: s.wbWord.toLowerCase().trim(),
    domain: "spelling",
    correct: true,
    quality: 4,
    scaffoldLevel: 1,
  });
}

export function wbSendRound(s: SM): void {
  if (!s.wbActive || !s.wbWord || s.wbRound < 2) return;
  console.log(`  🎮 → round ${s.wbRound} sent (word: ${s.wbWord})`);
  s.send("game_message", {
    forward: {
      type: "next_round",
      round: s.wbRound,
      word: s.wbWord,
      playerName: s.childName,
    },
  });
  armWbActivityTimeout(s);
}

export function wbAdvanceRound(s: SM): void {
  s.wbRound++;
  if (s.wbActive && s.wbRound >= 2 && s.wbRound <= 4) {
    wbSendRound(s);
  }
}

export function flushPendingRoundCompleteForSession(s: SM): void {
  const ev = s.pendingRoundComplete;
  if (!ev) return;
  s.pendingRoundComplete = null;
  s.handleGameEvent(ev, true);
}

export function handleGameEventForSession(
  s: SM,
  event: Record<string, unknown>,
  fromPendingFlush = false,
): void {
  /** Iframe `GameBridge` uses `{ type, payload, version }`; voice path expects flat fields. */
  const pl = event.payload;
  if (
    pl != null &&
    typeof pl === "object" &&
    !Array.isArray(pl) &&
    typeof event.type === "string"
  ) {
    const inner = pl as Record<string, unknown>;
    const { payload: _omit, ...rest } = event;
    event = { ...rest, ...inner } as Record<string, unknown>;
  }

  const type = event.type as string;

  if (TRACEABLE_GAME_EVENT_TYPES.has(type)) {
    s.recordDebugEvent?.("flow_game", type, buildFlowGameEventFields(event));
    s.recordGameTrace?.({
      ...event,
      type,
      source: "game_event_handler",
    });
  }

  if (type === "companion_video_call_trace") {
    const traceId = typeof event.traceId === "string" ? event.traceId : "";
    const eventName = typeof event.eventName === "string" ? event.eventName : "";
    if (traceId && eventName) {
      try {
        recordCompanionVideoCallTraceEvent({
          traceId,
          turnId: typeof event.turnId === "string" ? event.turnId : undefined,
          eventName: eventName as CompanionVideoCallTraceEventName,
          childId: typeof event.childId === "string" ? event.childId : undefined,
          companionId: typeof event.companionId === "string" ? event.companionId : undefined,
          callSource: typeof event.callSource === "string" ? event.callSource : undefined,
          relationshipState:
            typeof event.relationshipState === "string"
              ? event.relationshipState
              : undefined,
          timestamp:
            typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
              ? event.timestamp
              : undefined,
          payload:
            event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
              ? (event.payload as Record<string, unknown>)
              : {},
        });
      } catch (err: unknown) {
        console.error(
          "  🔴 [companion-video-trace] append failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return;
  }

  if (type === "activity_evidence") {
    return;
  }

  if (type === "narration_request") {
    const text = String(event.text ?? event.word ?? "").trim();
    const game = String(event.game ?? event.activityId ?? "").trim();
    const word = String(event.word ?? event.currentWord ?? "").trim();
    const reason = String(event.reason ?? "narration_request").trim();
    const now = Date.now();
    const key = [game.toLowerCase(), word.toLowerCase(), text.toLowerCase(), reason.toLowerCase()].join("|");
    const previous =
      s.lastNarrationRequest &&
      typeof s.lastNarrationRequest === "object" &&
      !Array.isArray(s.lastNarrationRequest)
        ? (s.lastNarrationRequest as Record<string, unknown>)
        : null;
    if (
      previous?.key === key &&
      typeof previous.at === "number" &&
      now - previous.at >= 0 &&
      now - previous.at <= 1_000
    ) {
      s.recordGameTrace?.({
        ...event,
        type: "narration_request_suppressed",
        source: "game_event_handler",
        reason: "duplicate_narration_debounce",
      });
      console.log(`  🎮 [game-narration] [debounced] game=${game || "unknown"} word=${word || "unknown"}`);
      return;
    }
    s.lastNarrationRequest = { key, at: now };
    const spoken = /[.!?]$/.test(text) ? text : text ? `${text}.` : "";
    if (!spoken) return;
    void Promise.resolve(
      s.speakGameNarration?.(spoken, {
        source: "game_event_handler",
        reason,
        activityId: event.activityId ?? game,
        nodeId: event.nodeId,
        word,
      }),
    ).catch((err: unknown) => {
      console.error("  🔴 [game-narration] narration request failed:", err);
    });
    return;
  }

  if (type === "voice_control") {
    const voiceEnabled = event.voiceEnabled === true;
    const payload =
      event.payload != null && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};
    const game = String(event.game ?? payload.game ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const suppressesOrganicSpeech =
      !game || game === "pronunciation" || game === "karaoke" || game === "reading";
    s.suppressTranscripts = voiceEnabled ? false : suppressesOrganicSpeech;
    console.log(
      `  🎮 Voice: ${voiceEnabled || !suppressesOrganicSpeech ? "organic" : "flow-suppressed"} game=${game || "unknown"}`,
    );
    return;
  }

  if (type === "game_state_update") {
    const ctx: Record<string, unknown> = { ...event };
    delete ctx.type;
    delete ctx.version;
    delete ctx.payload;
    if (typeof s.updateCurrentBoardSnapshot === "function") {
      s.updateCurrentBoardSnapshot(ctx);
    } else {
      s.injectGameContext?.(ctx);
    }
    return;
  }

  if (type === "companion_event") {
    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : event;
    const childId =
      typeof payload.childId === "string"
        ? payload.childId
        : chartChildIdForSession(s);
    const timestamp =
      typeof payload.timestamp === "number" ? payload.timestamp : Date.now();
    const trigger = payload.trigger;
    const metadata =
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : undefined;
    if (
      trigger === "correct_answer" ||
      trigger === "wrong_answer" ||
      trigger === "mastery_unlock" ||
      trigger === "idle_too_long" ||
      trigger === "session_start" ||
      trigger === "session_complete" ||
      trigger === "session_end"
    ) {
      s.send?.("companion_event", {
        payload: {
          trigger,
          childId,
          timestamp,
          ...(metadata ? { metadata } : {}),
        },
      });
      s.noteExternalEvent?.({
        source: "companion_event",
        summary: `Companion VFX event: ${String(trigger)}.`,
      });
    }
    return;
  }

  if (type === "companion_care_event") {
    const itemId = typeof event.itemId === "string" ? event.itemId : "food";
    const animation =
      event.animation && typeof event.animation === "object"
        ? (event.animation as Record<string, unknown>)
        : {};
    const reference =
      typeof animation.reference === "string" ? animation.reference : "animation-a";
    const care =
      event.companionCare && typeof event.companionCare === "object"
        ? (event.companionCare as Record<string, unknown>)
        : {};
    const moodLabel = typeof care.moodLabel === "string" ? care.moodLabel : "steady";
    const liveContext =
      s.currentActivityState && typeof s.currentActivityState === "object"
        ? buildGameContextSummary(s.currentActivityState as Record<string, unknown>)
        : "";
    const summary = [
      `Companion was fed ${itemId}; visible feed animation ${reference}; current care mood ${moodLabel}.`,
      liveContext ? `Current live board context:\n${liveContext}` : "",
    ].filter(Boolean).join("\n");
    s.noteExternalEvent?.({
      source: "companion_care_event",
      summary,
    });
    console.log(`  🎮 [companion-care] live event item=${itemId} animation=${reference}`);
    if (s.turnSM?.getState?.() !== "IDLE") {
      console.log("  🎮 [companion-care] skip spoken reply — companion already owns the turn");
      return;
    }
    return;
  }

  if (type === "attempt_event") {
    try {
      const recorded = recordLearningAttempt(event, chartChildIdForSession(s));
      s.noteExternalEvent?.({
        source: "attempt_event",
        summary:
          `Game attempt: ${recorded.attempt.word} ` +
          `${recorded.attempt.correct ? "correct" : "incorrect"}`,
      });
    } catch (err) {
      console.error("  🔴 [attempt_event] record failed:", err);
    }
    return;
  }

  if (type === "clock_answer") {
    recordClockAttempt(
      chartChildIdForSession(s),
      event.correct === true,
      Number(event.hour),
      Number(event.minute),
    );
    return;
  }

  if (type === "ready") {
    if (s.pendingGameStart) {
      s.gameBridge.startGame(
        s.pendingGameStart.gameUrl,
        s.pendingGameStart.childName,
        s.pendingGameStart.config,
        s.pendingGameStart.companionName,
      );
      console.log(
        `  🎮 resend start after ready — ${s.ctx?.canvas.current.mode ?? "game"}`,
      );
      s.pendingGameStart = null;
    }
    if (s.ctx) {
      s.ctx.markCanvasRendered(s.currentCanvasRevision);
      s.ctx.markGameReady(s.currentCanvasRevision);
      console.log(
        `  🖼️  Browser confirmed game ready for revision ${s.currentCanvasRevision} (${s.ctx.canvas.current.mode})`,
      );
      s.broadcastContext();
      if (
        s.gamePendingRevision !== null &&
        s.currentCanvasRevision === s.gamePendingRevision
      ) {
        releaseGameTtsFlush(s);
      }
    }
    return;
  }

  if (type === "correct" && s.spellCheckSessionActive) {
    if (s.turnSM.getState() !== "IDLE") {
      s.spellCheckSessionActive = false;
      s.activeSpellCheckWord = "";
      s.clearActiveCanvasActivity();
      s.send("canvas_draw", { mode: "idle" });
      return;
    }
    s.spellCheckSessionActive = false;
    s.activeSpellCheckWord = "";
    s.clearActiveCanvasActivity();
    s.send("canvas_draw", { mode: "idle" });
    return;
  }

  if (type === "game_complete" || type === "node_complete") {
    s.spellCheckSessionActive = false;
    s.activeSpellCheckWord = "";
  }

  if (type === "round_complete") {
    if (!s.wbActive) return;
    armWbActivityTimeout(s);

    const state = s.turnSM.getState();
    if (!fromPendingFlush && (state === "SPEAKING" || state === "PROCESSING")) {
      console.log(`  🎮 round_complete deferred (state=${state})`);
      s.pendingRoundComplete = { ...event };
      return;
    }

    const er = Number(event.round);
    const completedRound = Number.isFinite(er) && er > 0 ? er : s.wbRound;

    if (completedRound <= s.wbLastProcessedRound) {
      return;
    }
    s.wbLastProcessedRound = completedRound;

    const attempts = Number(event.attempts) || 1;
    console.log(
      `  🎮 round_complete received — round ${completedRound} (wbRound ${s.wbRound})`,
    );

    if (completedRound === 4) {
      finalizeWordBuilderSessionFromIframe(s, s.wbWord);
      return;
    }
    if (completedRound === 3) {
      wbAdvanceRound(s);
      return;
    }
    if (completedRound === 1 || completedRound === 2) {
      s.noteExternalEvent?.({
        source: "word_builder_round_complete",
        summary: `Word Builder round ${completedRound} completed for ${s.wbWord} in ${attempts} attempt(s).`,
      });
      wbAdvanceRound(s);
      return;
    }

    wbAdvanceRound(s);
    return;
  }

  if (type === "round_failed") {
    if (!s.wbActive) return;
    armWbActivityTimeout(s);

    const state = s.turnSM.getState();
    const word = s.wbWord;

    if (!fromPendingFlush && (state === "SPEAKING" || state === "PROCESSING")) {
      console.log(`  🎮 round_failed deferred (state=${state})`);
      s.pendingRoundComplete = { ...event };
      return;
    }

    console.log(`  🎮 round_failed — round ${s.wbRound}`);

    s.noteExternalEvent?.({
      source: "word_builder_round_failed",
      summary: `Word Builder round ${s.wbRound} failed for ${word}.`,
    });
    wbAdvanceRound(s);
    return;
  }

  if (type === "game_complete") {
    if (s.wbActive) {
      if (s.wbLastProcessedRound >= 4) {
        console.log(
          "  🎮 game_complete ignored (Word Builder already ended at round 4)",
        );
        return;
      }
      finalizeWordBuilderSessionFromIframe(s, s.wbWord);
      return;
    }
    if (s.activeCanvasActivity.snapshot?.worksheet) {
      const snapshot = s.activeCanvasActivity.snapshot;
      const ws = snapshot.worksheet;
      if (ws) {
        s.worksheetProblemIndex = ws.problemIndex;
        if (snapshot.canvasState) {
          s.currentCanvasState = { ...snapshot.canvasState };
        }
        if (s.ctx && snapshot.contextCanvas) {
          s.ctx.updateCanvas(snapshot.contextCanvas as any);
        }
        s.clearActiveCanvasActivity();
        s.setActiveCanvasActivity("worksheet");
        if (snapshot.canvasState) {
          s.send("canvas_draw", {
            args: snapshot.canvasState,
            result: snapshot.canvasState,
          });
        }
        s.broadcastContext();
      }
      return;
    }
    if (s.ctx && String(s.ctx.canvas.current.mode) === "clock-game") {
      s.clearActiveCanvasActivity();
      s.send("canvas_draw", { mode: "idle" });
      if (s.ctx) {
        s.ctx.updateCanvas({ mode: "idle" });
        s.broadcastContext();
      }
      console.log(
        `  🎮 clock-game complete — correct=${String(event.correct)}`,
      );
      return;
    }
    if (s.spaceInvadersRewardActive) {
      s.spaceInvadersRewardActive = false;
      s.suppressTranscripts = false;
      console.log("  🎮 reward game ended — transcript capture normal");
      s.gameBridge.handleGameEvent(event);
    }
  }
}
