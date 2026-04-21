/**
 * Iframe game events (Word Builder, spell-check, clock, generic games).
 * Session state lives on SessionManager; this module holds extracted handlers (no circular imports).
 */

import { recordClockAttempt } from "../engine/clockTracker";
import { childIdFromName, recordAttempt } from "../engine/learningEngine";
import {
  SPELL_CHECK_CORRECT,
  WORD_BUILDER_ROUND_COMPLETE,
  WORD_BUILDER_ROUND_FAILED,
  WORD_BUILDER_SESSION_COMPLETE,
} from "../agents/prompts";

export const WB_ACTIVITY_MS = 90_000;

/** @internal SessionManager instance — fields accessed intentionally across module boundary */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SM = any;

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
  void s
    .runCompanionResponse(
      WORD_BUILDER_SESSION_COMPLETE(s.sessionTtsLabel, completedWord),
    )
    .catch(console.error);
  void recordAttempt(childIdFromName(s.childName), {
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
  const type = event.type as string;

  if (type === "clock_answer") {
    recordClockAttempt(
      childIdFromName(s.childName),
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
    const word = String(event.word ?? s.activeSpellCheckWord);
    if (s.turnSM.getState() !== "IDLE") {
      s.spellCheckSessionActive = false;
      s.activeSpellCheckWord = "";
      s.clearActiveCanvasActivity();
      s.send("canvas_draw", { mode: "idle" });
      return;
    }
    void s.runCompanionResponse(SPELL_CHECK_CORRECT(s.sessionTtsLabel, word));
    s.spellCheckSessionActive = false;
    s.activeSpellCheckWord = "";
    s.clearActiveCanvasActivity();
    s.send("canvas_draw", { mode: "idle" });
    return;
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
      void s
        .runCompanionResponse(
          WORD_BUILDER_ROUND_COMPLETE(completedRound, s.wbWord, attempts),
        )
        .then(() => wbAdvanceRound(s))
        .catch((err: unknown) => {
          console.error("  ❌ WB round response failed:", err);
          wbAdvanceRound(s);
        });
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

    void s
      .runCompanionResponse(WORD_BUILDER_ROUND_FAILED(s.wbRound, word))
      .then(() => wbAdvanceRound(s))
      .catch((err: unknown) => {
        console.error("  ❌ WB fail response failed:", err);
        wbAdvanceRound(s);
      });
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
