/** Companion LLM turn — extracted from SessionManager.runCompanionResponse. */
// @ts-nocheck
import { runAgent } from "../agents/elli/run";
import type { ModelMessage } from "ai";
import { buildCanvasContext } from "../agents/prompts";
import { buildCanvasContextMessage } from "./session-context";
import { auditLog } from "./audit-log";
import { getTool } from "./games/registry";
import { unwrapToolResult } from "./unwrapToolResult";
import { runHandleToolCall } from "./tool-call-router";
import { isHomeworkMode, isDebugClaude } from "../utils/runtimeMode";
import { checkAssistantGoodbye } from "./session-triggers";
import { shouldTriggerTransitionToWorkPhase } from "./transition-to-work-gate";
import {
  debugLogToolCall,
  debugPrintClaudePreRun,
} from "./debug-helpers";

export async function runCompanionResponseForSession(
  session: any,
  userMessage: string,
): Promise<void> {
    const st = session.turnSM.getState();
    if (st === "WORD_BUILDER") {
      session.turnSM.onCompanionRunFromWordBuilder();
    } else if (st === "IDLE") {
      session.turnSM.onStartCompanionFromIdle();
    }

    session.currentAbort = new AbortController();
    let fullResponse = "";
    session.toolCallsMadeThisTurn = 0;

    // TTS connect and Claude run in parallel — don't serialize the handshake.
    // Fire-and-forget the TTS connect; it'll be ready by the time the first
    // sentence flushes from PROCESSING.
    if (session.ttsBridge) {
      const previousText = session.conversationHistory
        .filter((m) => m.role === "assistant")
        .slice(-3)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .filter(Boolean)
        .join(" ");
      session.ttsBridge.connect(previousText || undefined).catch(() => {});
    }

    const transitionToWorkPhase = shouldTriggerTransitionToWorkPhase(
      session.roundNumber,
      session.childName,
      session.transitionedToWork,
    );

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
      if (session.worksheetPageFile && (session.worksheetMode || isHomeworkMode())) {
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
      if (session.activeWordContext && session.ctx?.sessionType !== "diag") {
        pins.push({ role: "user", content: session.activeWordContext });
      }
      const historyWithPin: typeof recentHistory =
        pins.length > 0 ? [...pins, ...recentHistory] : recentHistory;

      // Prepend canvas state context so the AI always knows what is currently
      // displayed — prevents duplicate showCanvas calls and enables intelligent
      // decisions about whether to update or hold the current display.
      const canvasCtx = session.ctx
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
      const messageWithContext = [userMessage, canvasCtx]
        .filter(Boolean)
        .join("\n\n");

      const finalTools = session.buildAgentToolkit();

      debugPrintClaudePreRun(session, userMessage);

      if (session.options?.sttOnly) {
        session.turnSM.onInterrupt();
        return;
      }

      await runAgent({
        history: historyWithPin,
        userMessage: messageWithContext,
        profile: session.companion,
        tools: finalTools,
        onToken: (chunk) => {
          fullResponse += chunk;
          session.send("response_text", { chunk });
          console.log(
            `  📝 token(${chunk.length}): "${chunk.slice(0, 30).replace(/\n/g, "↵")}"`,
          );
          session.turnSM.onToken(chunk);
        },
        signal: session.currentAbort?.signal,
        transitionToWorkPhase,
        allowTransitionToWork: !session.transitionedToWork,
        onStepFinish: (step) => {
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
                if (st === "PROCESSING") {
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
                if (st === "PROCESSING") {
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
                  if (st === "PROCESSING" && word.length > 0) {
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
                if (st === "PROCESSING") {
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
                if (st === "PROCESSING") {
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
                if (st === "PROCESSING") {
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
                if (st === "PROCESSING") {
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
                  if (st === "PROCESSING") {
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
                  if (st === "PROCESSING") {
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
                if (st === "PROCESSING") {
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
                if (st === "PROCESSING") {
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

      session.turnSM.onAgentComplete();
      session.flushPendingRoundComplete();

      if (!fullResponse.trim()) {
        console.warn(
          "  ⚠️  runAgent completed with empty fullResponse — check onToken wiring",
        );
      }

      // In math mode every turn should log an answer — warn if tools were skipped entirely
      if (session.lastCanvasWasMath && session.toolCallsMadeThisTurn === 0) {
        console.warn(
          "  ⚠️  Math mode: agent completed with ZERO tool calls — canvas is out of sync",
        );
      }

      session.conversationHistory.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: fullResponse },
      );

      if (checkAssistantGoodbye(fullResponse)) {
        console.log("  👋 Companion said goodbye");
        await session.end();
        return;
      }

      const pendingCanvas = session.turnSM.getState() === "CANVAS_PENDING";
      const pendingGame = session.gamePendingRevision !== null;
      if (pendingCanvas || pendingGame) {
        session.deferredTtsFinish = true;
      } else {
        if (session.ttsBridge) {
          await session.ttsBridge.finish();
        }
        session.send("audio_done");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("  ⚡ Agent aborted (barge-in)");
        session.turnSM.onInterrupt();
        return;
      }

      // Detect Anthropic 529 "overloaded" error — speak a friendly retry message
      // instead of going silent. The AI SDK wraps this as AI_RetryError → AI_APICallError.
      const isOverloaded = (() => {
        const e = err as Record<string, unknown>;
        // Check the error itself or its lastError for a 529 status or overloaded body
        const check = (x: unknown): boolean => {
          if (!x || typeof x !== "object") return false;
          const obj = x as Record<string, unknown>;
          if (obj.statusCode === 529) return true;
          if (
            typeof obj.responseBody === "string" &&
            obj.responseBody.includes("overloaded_error")
          )
            return true;
          if (obj.lastError) return check(obj.lastError);
          return false;
        };
        return check(e);
      })();

      session.turnSM.onInterrupt();
      const message = err instanceof Error ? err.message : String(err);

      if (isOverloaded) {
        console.warn("  ⚠️  Anthropic overloaded (529) — speaking fallback");
        const fallback = `Hmm, my brain is a little busy right now — give me a second and say that again!`;
        session.send("response_text", { chunk: fallback });
        if (session.ttsBridge) {
          session.ttsBridge.sendText(fallback);
          await session.ttsBridge.finish().catch(() => {});
        }
        return;
      }

      console.error("  🔴 Agent error:", message);
      session.send("error", { message: "Companion response failed" });
    } finally {
      session.currentAbort = null;
    }
}
