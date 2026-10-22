/** Companion LLM turn — extracted from SessionManager.runCompanionResponse. */
// @ts-nocheck
import { redactProtectedSpellingText, redactProtectedSpellingValue } from "./currentBoardSnapshot";
import { randomUUID } from "node:crypto";
import { rewriteChildNameForTts } from "./sessionTextHelpers";
import { runAgent } from "../agents/elli/run";
import type { ModelMessage } from "ai";
import { buildCanvasContext } from "../agents/prompts";
import { buildCanvasContextMessage } from "./session-context";
import { isDiagMapMode } from "../utils/runtimeMode";
import { auditLog } from "./audit-log";
import { getTool } from "./games/registry";
import { unwrapToolResult } from "./unwrapToolResult";
import { runHandleToolCall } from "./tool-call-router";
import { isHomeworkMode, isDebugClaude } from "../utils/runtimeMode";
import {
  debugLogToolCall,
  debugPrintClaudePreRun,
} from "./debug-helpers";
import { createThinkingEmoteOnFirstToolInStep } from "./companionThinkingEmote";
import { COMPANION_EXPRESSION_PROMPT, createExpressionTagFilter } from "./companionExpressionTags";
import { COMPANION_SPOKEN_TURN_PROMPT } from "./companionTurnTaking";

/** Project remembered text too: a previous teaching turn must not reveal this check's stimulus. */
export function protectSpellingModelMessages(messages, snapshot) {
  return messages.map(message => ({ ...message, content: typeof message.content === "string"
    ? redactProtectedSpellingText(message.content, snapshot)
    : message.content.map(part => part.type === "text"
      ? { ...part, text: redactProtectedSpellingText(part.text, snapshot) }
      : part.type === "tool-result"
        ? { ...part, output: redactProtectedSpellingValue(part.output, snapshot) }
        : part) }));
}

export function claimCompanionResponseTurn(session: any): {
  turnId: number;
  isCurrent: () => boolean;
} {
  const turnId = Number(session.companionResponseTurnId ?? 0) + 1;
  session.companionResponseTurnId = turnId;
  const itemKey = () => {
    const board = session.currentBoardSnapshot;
    return JSON.stringify([session.spellingLaunch?.launchId, board?.launchToken,
      board?.nodeId, board?.itemId, board?.itemIndex,
      board?.spellingTarget ?? board?.currentTarget, board?.phase === "closed"]);
  };
  const originalItem = itemKey();
  return {
    turnId,
    isCurrent: () => session.companionResponseTurnId === turnId && itemKey() === originalItem,
  };
}

export function deferCompanionUntilNarrationFinishes(
  session: any,
  userMessage: string,
): boolean {
  const requestId = session.activeGameNarrationRequestId
    ?? session.pendingGameNarrationPlayback?.requestId;
  if (!requestId) return false;
  const turnState = session.turnSM.getState?.();
  if (turnState === "LOADING" || turnState === "PROCESSING") {
    session.turnSM.onInterrupt();
  }
  session.turnSM.setPendingTranscript(userMessage);
  session.recordDebugEvent?.("companion", "deferred_for_game_narration", {
    requestId,
  });
  console.log("  🎮 [companion] [deferred] reason=game_narration_owns_audio");
  return true;
}

export async function finalizePendingSessionEnd(session: any): Promise<boolean> {
  const request = session.pendingSessionEndRequest;
  if (!request) return false;
  session.pendingSessionEndRequest = null;
  console.log(
    `  🎮 [session-end] deferred_finalize child=${request.childName ?? "unknown"} reason=${request.reason ?? "tool_call"}`,
  );
  await session.end();
  return true;
}

export async function runCompanionResponseForSession(
  session: any,
  userMessage: string,
): Promise<void> {
    if (deferCompanionUntilNarrationFinishes(session, userMessage)) return;
    session.voiceLatency?.beginResponse();
    session.inFlightReply = userMessage;
    const turn = claimCompanionResponseTurn(session);
    const playbackId = `companion:${session.sessionId}:${turn.turnId}`;
    let staleOutputLogged = false;
    const rejectStaleOutput = (action: string): boolean => {
      if (turn.isCurrent()) return false;
      if (!staleOutputLogged) {
        staleOutputLogged = true;
        console.log(
          `  🎮 [companion] [stale-turn-discarded] turn=${turn.turnId} action=${action}`,
        );
      }
      return true;
    };
    session.resetCompanionDispositionAfterSpeech?.();
    const st = session.turnSM.getState();
    if (st === "WORD_BUILDER") {
      session.turnSM.onCompanionRunFromWordBuilder();
    } else if (st === "IDLE") {
      session.turnSM.onStartCompanionFromIdle();
    }

    const abortController = new AbortController();
    session.currentAbort = abortController;
    let fullResponse = "";
    let responseLogged = false;
    session.toolCallsMadeThisTurn = 0;

    // No playback exists until the model produces spoken text, on every turn.
    let audioStarted = false;
    let audioConnection: Promise<void> | undefined;
    const startAudio = () => {
      if (audioStarted || !session.ttsBridge) return;
      audioStarted = true;
      const previousText = session.conversationHistory
        .filter((m) => m.role === "assistant")
        .slice(-3)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .filter(Boolean)
        .join(" ");
      session.recordDebugEvent("companion_timing", "response_started", {requestId:playbackId});
      session.ttsBridge.beginPlayback?.(playbackId, session.currentBoardSnapshot?.itemId, false, false, session.currentBoardSnapshot?.launchToken);
      audioConnection = session.ttsBridge.connect(previousText || undefined);
      void audioConnection.catch((error: unknown) => {
        session.recordDebugError?.("companion_tts_connect_failed", error);
      });
    };

    try {
      // Window the history to reduce Claude's input size and improve TTFT.
      // Keep the last 10 messages (5 turns) — wide enough to retain active-word
      // context across barge-ins while keeping latency acceptable.
      const recentHistory =
        session.conversationHistory.length > 10
          ? session.conversationHistory.slice(-10)
          : session.conversationHistory;

      // Pin context messages at the front so they survive history truncation.
      const pins: ModelMessage[] = [];
      if (session.currentBoardSnapshot?.spellingSupportMode !== "stimulus_only" && session.worksheetPageFile && (session.worksheetMode || isHomeworkMode())) {
        const imageCaption =
          "This is the worksheet. Grade from what you see in this image.";
        pins.push({
          role: "user",
          content: [
            {
              type: "image" as const,
              image: session.worksheetPageFile.data,
            },
            {
              type: "text" as const,
              text: imageCaption,
            },
          ],
        } as ModelMessage);
      }
      if (session.activeWordContext && !session.spellingLaunch && session.ctx?.sessionType !== "diag") {
        pins.push({ role: "user", content: session.activeWordContext });
      }
      const historyWithPin: typeof recentHistory =
        pins.length > 0 ? [...pins, ...recentHistory] : recentHistory;

      // Prepend display state context so the AI always knows what is currently
      // shown — prevents duplicate showCanvas calls and enables intelligent
      // decisions about whether to update or hold the current display.
      const skipLiveDisplayContext =
        isDiagMapMode() || session.ctx?.sessionType === "diag";
      const canvasCtx = skipLiveDisplayContext
        ? ""
        : session.ctx
          ? buildCanvasContextMessage(session.ctx, {
              turnState: session.turnSM.getState(),
              lastChildUtterance: session.lastTranscript || null,
              wordBuilderRound:
                session.wbActive && session.wbRound > 0 ? session.wbRound : null,
              activeWord: session.activeWord,
              wordScaffoldState: session.wordScaffoldState,
            })
          : session.currentCanvasState
            ? buildCanvasContext(session.currentCanvasState)
            : "";
      const boardCtx =
        typeof session.buildCurrentBoardContextForTurn === "function"
          ? session.buildCurrentBoardContextForTurn(userMessage)
          : "";
      const messageWithContext = [userMessage, boardCtx, canvasCtx]
        .filter(Boolean)
        .join("\n\n");

      const finalTools = session.buildAgentToolkit();
      if (session.spellingLaunch) delete finalTools.sessionLog;

      debugPrintClaudePreRun(session, userMessage);
      console.log(`  🎮 [companion] model_request_started model=${process.env.SUNNY_VOICE_MODEL ?? "claude-sonnet-5"}`);

      if (session.options?.sttOnly) {
        session.turnSM.onInterrupt();
        return;
      }

      const gameContextMessages =
        typeof session.takePendingGameContextMessages === "function"
          ? session.takePendingGameContextMessages()
          : [];

      if (gameContextMessages.length > 0) {
        console.log("  🎮 [companion] injecting game context into Claude call");
      }

      const thinkingHooks =
        session.companionBridge
          ? createThinkingEmoteOnFirstToolInStep(session.companionBridge)
          : null;

      // Elli's [smile]-style tags drive the avatar while she speaks; they are never spoken.
      const expressionTags = createExpressionTagFilter((emote) => {
        console.log(` 🎮 [companion] [expression] [shown] emote=${emote}`);
        Promise.resolve(session.companionBridge?.expressCompanion({ emote })).catch((error: unknown) =>
          console.error(" 🎮 [companion] [expression] [failed]", error),
        );
      });
      const speakChunk = (chunk: string) => {
        if (chunk.trim()) startAudio();
        fullResponse += chunk;
        session.send("response_text", { chunk });
        console.log(
          `  📝 token(${chunk.length}): "${chunk.slice(0, 30).replace(/\n/g, "↵")}"`,
        );
        session.turnSM.onToken(chunk);
      };
      session.voiceLatency?.mark("model_request");
      await runAgent({
        history: protectSpellingModelMessages(historyWithPin, session.currentBoardSnapshot),
        injectedContextMessages: protectSpellingModelMessages(gameContextMessages, session.currentBoardSnapshot),
        userMessage: redactProtectedSpellingText(messageWithContext, session.currentBoardSnapshot),
        profile: { ...session.companion, systemPrompt: `${redactProtectedSpellingText(session.companion.systemPrompt, session.currentBoardSnapshot)}\n\n${COMPANION_SPOKEN_TURN_PROMPT}\n\n${COMPANION_EXPRESSION_PROMPT}` },
        tools: finalTools,
        experimentalOnStepStart: thinkingHooks?.onStepStart,
        experimentalOnToolCallStart: thinkingHooks?.onToolCallStart,
        onToken: (chunk) => {
          if (rejectStaleOutput("token")) return;
          if (!responseLogged) {
            responseLogged = true;
            session.voiceLatency?.mark("model_first_token");
            console.log("  🎮 [companion] model_response_received");
          }
          const spoken = expressionTags.push(chunk);
          if (spoken) speakChunk(spoken);
        },
        signal: abortController.signal,
        allowTransitionToWork: !session.transitionedToWork,
        onStepFinish: async (step) => {
          if (rejectStaleOutput("step_finish")) return;
          session.voiceLatency?.noteToolStep(step.toolCalls?.length ?? 0);
          const toolCalls = (step.toolCalls ?? []) as Array<{
            toolName?: string;
            name?: string;
            args?: Record<string, unknown>;
            input?: Record<string, unknown>;
          }>;
          const toolResults = (step.toolResults ?? []) as unknown[];
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            let toolName = tc.toolName ?? tc.name ?? "unknown";
            if (toolName === "show_canvas") toolName = "showCanvas";
            if (toolName === "end_session") toolName = "endSession";
            if (toolName === "launch_game") toolName = "launchGame";
            if (toolName === "get_session_status")
              toolName = "getSessionStatus";
            if (toolName === "get_next_problem") toolName = "getNextProblem";
            if (toolName === "submit_answer") toolName = "submitAnswer";
            if (toolName === "clear_canvas") toolName = "clearCanvas";
            if (toolName === "canvas_show") toolName = "canvasShow";
            if (toolName === "canvas_clear") toolName = "canvasClear";
            if (toolName === "canvas_status") toolName = "canvasStatus";
            if (toolName === "session_log") toolName = "sessionLog";
            if (toolName === "session_status") toolName = "sessionStatus";
            if (toolName === "session_end") toolName = "sessionEnd";
            if (toolName === "record_child_signal") toolName = "recordChildSignal";
            if (toolName === "record_product_issue") toolName = "recordProductIssue";
            if (toolName === "express_companion") toolName = "expressCompanion";
            if (toolName === "companion_act") toolName = "companionAct";
            let args = (tc.args ?? tc.input ?? {}) as Record<string, unknown>;
            const result = toolResults[i];

            if (toolName === "canvasShow") {
              args = session.normalizeCanvasShowArgs(args);
            }

            if (
              toolName === "canvasShow" &&
              session.turnSM.getState() === "WORD_BUILDER"
            ) {
              const c = String(args.content ?? "").trim();
              const isTeachingWord =
                args.type === "text" &&
                c.length > 0 &&
                !/\s/.test(c) &&
                /[a-z]/i.test(c) &&
                !session.isTeachingMathCanvas({
                  mode: "teaching",
                  content: c,
                });
              if (isTeachingWord) {
                console.warn(
                  "  ⚠️  canvasShow(text) blocked during Word Builder — use canvasShow(blackboard) or blackboard",
                );
                toolName = "blackboard";
                args = { gesture: "reveal", word: c };
              }
            }

            debugLogToolCall(session, toolName, args, result);
            session.recordDebugEvent?.("tool", "called", {
              tool: toolName,
              argsKeys: Object.keys(args ?? {}),
              hasResult: result !== undefined,
            });

            session.handleToolCall(toolName, args, result);

            if (toolName === "canvasShow" && !session.storyImagePending) {
              const ct = String(args.type ?? "");
              if (ct === "text" || ct === "svg" || ct === "svg_raw") {
                const drawPayload =
                  ct === "text"
                    ? {
                        mode: "teaching",
                        content: args.content,
                        phonemeBoxes: args.phonemeBoxes,
                      }
                    : {
                        mode: "teaching",
                        svg: args.svg,
                        label: args.label,
                      };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "place_value") {
                const placeValueData: Record<string, unknown> = {
                  operandA: Number(args.operandA),
                  operandB: Number(args.operandB),
                  operation: args.operation,
                  layout: args.layout ?? "column",
                };
                if (args.activeColumn != null) {
                  placeValueData.activeColumn = args.activeColumn;
                }
                if (args.scaffoldLevel != null) {
                  placeValueData.scaffoldLevel = args.scaffoldLevel;
                }
                if (args.revealedColumns != null) {
                  placeValueData.revealedColumns = args.revealedColumns;
                }
                const drawPayload = {
                  mode: "place_value" as const,
                  placeValueData,
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "spelling") {
                const word = String(
                  args.spellingWord ?? args.word ?? "",
                ).trim();
                if (!session.spellingHomeworkGate.allows(word)) {
                  auditLog("canvas_show", {
                    action: "spelling_rejected",
                    word,
                    childName: session.childName,
                  });
                  console.warn(
                    `  ⚠️  canvasShow spelling skipped — not on homework list: "${word}"`,
                  );
                } else {
                  const drawPayload: Record<string, unknown> = {
                    mode: "spelling",
                    spellingWord: word,
                  };
                  if (args.spellingRevealed != null) {
                    drawPayload.spellingRevealed = Array.isArray(
                      args.spellingRevealed,
                    )
                      ? [...(args.spellingRevealed as string[])]
                      : args.spellingRevealed;
                  }
                  if (args.compoundBreak != null) {
                    drawPayload.compoundBreak = args.compoundBreak;
                  }
                  if (args.showWord != null) {
                    drawPayload.showWord = args.showWord;
                  }
                  if (args.streakCount != null) {
                    drawPayload.streakCount = args.streakCount;
                  }
                  if (args.personalBest != null) {
                    drawPayload.personalBest = args.personalBest;
                  }
                  session.send(
                    "canvas_draw",
                    session.withCanvasRevision({
                      args: drawPayload,
                      result,
                    }),
                  );
                  const st = session.turnSM.getState();
                  if ((st === "PROCESSING" || st === "SPEAKING") && word.length > 0) {
                    session.turnSM.onShowCanvas();
                  }
                }
              } else if (ct === "riddle") {
                const drawPayload = {
                  mode: "riddle" as const,
                  content: args.text,
                  label: args.label ?? "Riddle",
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "math_inline") {
                const drawPayload = {
                  mode: "teaching" as const,
                  content: args.expression,
                  label: args.label,
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "reward") {
                const drawPayload: Record<string, unknown> = {
                  mode: "reward",
                  content: "",
                  label: args.label,
                  svg: args.svg,
                };
                if (args.lottieData != null) {
                  drawPayload.lottieData = args.lottieData;
                }
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({ args: drawPayload, result }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "championship") {
                const drawPayload: Record<string, unknown> = {
                  mode: "championship",
                  content: args.content ?? "",
                  label: args.label,
                  svg: args.svg,
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({ args: drawPayload, result }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "game") {
                const rawName = String(args.name ?? "").trim();
                const entry = getTool(rawName);
                if (entry) {
                  const drawPayload: Record<string, unknown> = {
                    mode: rawName,
                    gameUrl: entry.url,
                    gameWord: args.gameWord,
                    gamePlayerName: args.gamePlayerName,
                  };
                  session.send(
                    "canvas_draw",
                    session.withCanvasRevision({ args: drawPayload, result }),
                  );
                  const st = session.turnSM.getState();
                  if (st === "PROCESSING" || st === "SPEAKING") {
                    session.turnSM.onShowCanvas();
                  }
                } else {
                  console.warn(
                    `  ⚠️  canvasShow game: unknown teaching tool "${rawName}"`,
                  );
                }
              } else if (ct === "blackboard") {
                // handleToolCall already sent `blackboard` — no canvas_draw
              } else if (ct === "karaoke") {
                const karaokeHost = unwrapToolResult(result) as
                  | { dispatched?: boolean }
                  | undefined;
                if (karaokeHost?.dispatched === false) {
                  console.log(
                    "  📖 [canvas] canvas_draw skipped — karaoke refresh blocked during reading",
                  );
                } else {
                  const words = (args.words as string[]) ?? [];
                  const storyRaw = args.storyText;
                  if (typeof storyRaw === "string" && storyRaw.trim()) {
                    const trimmed = storyRaw.trim();
                    if (trimmed !== session.lastKaraokeStoryText) {
                      session.storyImageGeneratedThisStory = false;
                    }
                    session.lastKaraokeStoryText = trimmed;
                  }
                  const drawPayload = {
                    mode: "karaoke" as const,
                    content: args.storyText,
                    label: words.join(" "),
                    karaokeWords: words,
                    storyTitle:
                      typeof args.storyTitle === "string"
                        ? args.storyTitle
                        : undefined,
                    storyImagePrompt:
                      typeof args.storyImagePrompt === "string"
                        ? args.storyImagePrompt
                        : undefined,
                    backgroundImageUrl:
                      typeof args.backgroundImageUrl === "string"
                        ? args.backgroundImageUrl
                        : undefined,
                  };
                  session.send(
                    "canvas_draw",
                    session.withCanvasRevision({
                      args: drawPayload as Record<string, unknown>,
                      result,
                    }),
                  );
                  const st = session.turnSM.getState();
                  if (st === "PROCESSING" || st === "SPEAKING") {
                    session.turnSM.onShowCanvas(6000);
                  }
                }
              } else if (ct === "sound_box") {
                const tw = String(args.targetWord ?? "");
                const drawPayload = {
                  mode: "sound_box" as const,
                  content: tw,
                  label: JSON.stringify(args.phonemes ?? []),
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "clock") {
                const m = Number(args.minute) || 0;
                const h = Number(args.hour) || 3;
                const disp = String(args.display ?? "analog");
                const label = `${h}:${String(m).padStart(2, "0")} (${disp})`;
                const drawPayload = {
                  mode: "clock" as const,
                  clockHour: h,
                  clockMinute: m,
                  clockDisplay: disp,
                  content: label,
                  label,
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
                const st = session.turnSM.getState();
                if (st === "PROCESSING" || st === "SPEAKING") {
                  session.turnSM.onShowCanvas();
                }
              } else if (ct === "score_meter") {
                const drawPayload = {
                  mode: "score_meter" as const,
                  content: `${args.score}/${args.max}`,
                  label: args.label,
                };
                session.send(
                  "canvas_draw",
                  session.withCanvasRevision({
                    args: drawPayload as Record<string, unknown>,
                    result,
                  }),
                );
              }
            }

            if (toolName === "launchGame") {
              // Do not trigger CANVAS_PENDING — iframe games use game TTS gate, not canvas_done.
            }
          }
        },
      });

      if (rejectStaleOutput("completion")) return;
      const trailing = expressionTags.flush();
      if (trailing) speakChunk(trailing);

      session.turnSM.onAgentComplete();
      session.flushPendingRoundComplete();

      // In math mode every turn should log an answer — warn if tools were skipped entirely
      if (session.lastCanvasWasMath && session.toolCallsMadeThisTurn === 0) {
        console.warn(
          "  ⚠️  Math mode: agent completed with ZERO tool calls — canvas is out of sync",
        );
      }

      if (typeof session.recordCompanionTruthContradictions === "function") {
        session.recordCompanionTruthContradictions(fullResponse);
      }

      session.inFlightReply = null;
      session.conversationHistory.push({ role: "user", content: userMessage });
      if (fullResponse.trim()) {
        session.conversationHistory.push({ role: "assistant", content: fullResponse });
        session.recordDebugTranscript?.("assistant", fullResponse);
        session.recordCompanionHelpTurn?.(userMessage, fullResponse);
      }

      if (await finalizePendingSessionEnd(session)) {
        return;
      }

      if (!fullResponse.trim()) {
        if (rejectStaleOutput("tool_only_completion")) return;
        const owner = session.ttsBridge?.currentPlaybackIdentity?.();
        const ownsAudio = owner?.requestId === playbackId;
        if (ownsAudio) session.ttsBridge.stop();
        session.turnSM.onSpeakingDone?.();
        if (audioStarted) session.send("audio_done", {requestId:playbackId,itemId:session.currentBoardSnapshot?.itemId});
        session.applyCompanionDispositionAfterSpeech?.();
        console.log(" 🎮 [companion] [turn] [completed] spoken=false");
        const pending = session.turnSM.consumePendingTranscript();
        if (pending && !session.isEnding) {
          void session.handleEndOfTurn(pending, true).catch((error: unknown) =>
            session.recordDebugError?.("quiet_turn_pending_replay_failed", error));
        }
        return;
      }

      const pendingCanvas = session.turnSM.getState() === "CANVAS_PENDING";
      const pendingGame = session.gamePendingRevision !== null;
      if (pendingCanvas || pendingGame) {
        session.deferredTtsFinish = true;
      } else {
        if (session.ttsBridge) {
          await audioConnection;
          if (rejectStaleOutput("tts_connected")) return;
          if (session.ttsBridge.currentPlaybackIdentity && session.ttsBridge.currentPlaybackIdentity()?.requestId !== playbackId) return;
          console.log("  🎮 [companion] tts_started");
          await session.ttsBridge.finish();
        }
        if (rejectStaleOutput("audio_done")) return;
        session.send("audio_done", { requestId: playbackId, itemId: session.currentBoardSnapshot?.itemId });
        console.log("  🎮 [companion] audio_completed");
        session.applyCompanionDispositionAfterSpeech?.();
      }
    } catch (err: unknown) {
      if (rejectStaleOutput("error")) return;
      if (err instanceof Error && err.name === "AbortError") {
        console.log("  ⚡ Agent aborted (barge-in)");
        session.turnSM.onInterrupt();
        return;
      }

      const pending = session.turnSM.consumePendingTranscript();
      session.turnSM.onInterrupt();
      const message = err instanceof Error ? err.message : String(err);
      console.error("  🔴 Agent error:", message);
      session.recordDebugError?.("Agent error", err);
      if (audioStarted && session.ttsBridge?.currentPlaybackIdentity?.()?.requestId === playbackId) {
        session.ttsBridge.stop();
        session.send("audio_cancel", { requestId: playbackId });
      }
      session.send("error", { message: "Companion response unavailable.", fatal: false });
      if (pending && !session.isEnding) {
        void session.handleEndOfTurn(pending, true).catch((error: unknown) =>
          session.recordDebugError?.("failed_turn_pending_replay_failed", error));
      }
    } finally {
      // Every exit (error, early return, retirement) releases this run's in-flight marker.
      if (session.inFlightReply === userMessage) session.inFlightReply = null;
      // Item/context changes can retire output without a replacement model turn.
      // Suppressing that output must also release its processing state and audio.
      // A newer model turn or audio owner must remain untouched.
      if (session.companionResponseTurnId === turn.turnId && session.currentAbort === abortController) {
        session.currentAbort = null;
        if (!turn.isCurrent()) {
          session.companionResponseTurnId++;
          abortController.abort();
          if (session.ttsBridge?.currentPlaybackIdentity?.()?.requestId === playbackId) {
            session.ttsBridge.stop();
            session.send("audio_cancel", { requestId: playbackId });
          }
          const pending = session.turnSM.consumePendingTranscript();
          session.turnSM.onInterrupt();
          console.log(` 🎮 [companion] [stale-turn-retired] turn=${turn.turnId} queued=${Boolean(pending)}`);
          if (pending && !session.isEnding) {
            void session.handleEndOfTurn(pending, true).catch((error: unknown) =>
              session.recordDebugError?.("stale_turn_pending_replay_failed", error));
          }
        }
      }
    }
}

export async function runDirectCompanionTurnForSession(session: any, text: string): Promise<void> {
    if (session.activeGameNarrationRequestId || session.pendingGameNarrationPlayback) session.bargeIn();
    const turn = claimCompanionResponseTurn(session);
    session.turnSM.onEndOfTurn();
    // onEndOfTurn uses setImmediate for LOADING → PROCESSING — wait for it
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (!turn.isCurrent()) return;
    session.turnSM.onAgentComplete();
    const ttsText = rewriteChildNameForTts(text, session.childName, session.sessionTtsLabel);
    const requestId = randomUUID();
    session.ttsBridge?.beginPlayback(requestId, session.currentBoardSnapshot?.itemId, false, false, session.currentBoardSnapshot?.launchToken);
    session.send("response_text", { chunk: text });
    if (session.ttsBridge) {
      await session.ttsBridge.connect();
      if (!turn.isCurrent() || session.ttsBridge.currentPlaybackIdentity()?.requestId !== requestId) return;
      session.ttsBridge.sendText(ttsText);
      await session.ttsBridge.finish();
      if (!turn.isCurrent() || session.ttsBridge.currentPlaybackIdentity()?.requestId !== requestId) return;
    }
    session.send("audio_done", {requestId,itemId:session.currentBoardSnapshot?.itemId});
    session.turnSM.onSpeakingDone();
  }
