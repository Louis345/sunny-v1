import type { WebSocket } from "ws";
import { ELLI, MATILDA, type CompanionConfig } from "../companions/loader";
import { runAgent } from "../agents/elli/run";
import { recordSession } from "../agents/slp-recorder/recorder";
import { connectFlux, type FluxHandle } from "../deepgram-turn";
import {
  checkUserGoodbye,
  checkAssistantGoodbye,
  startMaxDurationTimer,
  getRewardDurations,
} from "./session-triggers";
import { WsTtsBridge } from "./ws-tts-bridge";
import { appendRewardLog } from "../agents/elli/tools/logReward";
import { resetMathProbeSession } from "../agents/elli/tools/mathProblem";
import type { ModelMessage } from "ai";
import { TurnStateMachine } from "./session-state";

type ChildName = "Ila" | "Reina";

interface RewardEvent {
  timestamp: string;
  rewardStyle: "flash" | "takeover" | "none";
  displayDuration_ms: number;
  timeToNextUtterance_ms: number;
  nextAnswerCorrect: boolean | null;
  childVerbalReaction: string | null;
  sessionPhase: string;
  correctStreakAtTime: number;
}

export class SessionManager {
  private ws: WebSocket;
  private childName: ChildName;
  private companion: CompanionConfig;
  private conversationHistory: ModelMessage[] = [];
  private ttsBridge: WsTtsBridge | null = null;
  private currentAbort: AbortController | null = null;
  private clearSessionTimer: (() => void) | null = null;
  private fluxHandle: FluxHandle | null = null;
  private isEnding = false;
  private sessionStartTime = 0;
  private roundNumber = 0;

  private rewardLog: RewardEvent[] = [];
  private correctStreak = 0;

  private lastTranscript = "";
  private lastTranscriptTime = 0;

  private turnSM: TurnStateMachine;

  constructor(ws: WebSocket, childName: ChildName) {
    this.ws = ws;
    this.childName = childName;
    this.companion = childName === "Ila" ? ELLI : MATILDA;
    this.turnSM = new TurnStateMachine(
      (text) => this.ttsBridge?.sendText(text),
      (msg) => console.log(msg),
      (state) => this.send("session_state", { state })
    );
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(
        JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          ...payload,
        })
      );
    }
  }

  async start(): Promise<void> {
    const ts = new Date().toISOString();
    this.sessionStartTime = Date.now();
    console.log(
      `  🌟 [${ts}] Starting session: ${this.childName} with ${this.companion.name}`
    );

    this.send("session_started", {
      child: this.childName,
      childName: this.childName,
      companion: this.companion.name,
      companionName: this.companion.name,
      emoji: this.companion.emoji,
      voiceId: this.companion.voiceId,
      openingLine: this.companion.openingLine,
      goodbye: this.companion.goodbye,
    });

    this.clearSessionTimer = startMaxDurationTimer(this.childName, () => {
      console.log("  ⏰ Session timeout reached (15 min)");
      this.end();
    });

    resetMathProbeSession(this.childName);

    this.ttsBridge = new WsTtsBridge(this.ws, this.companion.voiceId);
    await this.ttsBridge.prime();

    await this.connectDeepgram();

    await this.handleCompanionTurn(this.companion.openingLine);
  }

  receiveAudio(pcm: Buffer): void {
    if (this.fluxHandle) {
      this.fluxHandle.sendAudio(pcm);
    }
  }

  bargeIn(): void {
    const ts = new Date().toISOString();
    console.log(`  🛑 [${ts}] Barge-in received`);

    this.turnSM.onInterrupt();

    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.stop();
    }

    this.send("audio_done");
  }

  canvasDone(): void {
    this.turnSM.onCanvasDone();
  }

  async end(): Promise<void> {
    if (this.isEnding) return;
    this.isEnding = true;

    const ts = new Date().toISOString();
    console.log(`  🏁 [${ts}] Ending session for ${this.childName}`);

    if (this.clearSessionTimer) {
      this.clearSessionTimer();
      this.clearSessionTimer = null;
    }

    if (this.fluxHandle) {
      this.fluxHandle.close();
      this.fluxHandle = null;
    }

    if (this.ttsBridge) {
      this.ttsBridge.close();
      this.ttsBridge = null;
    }

    this.turnSM.onInterrupt();

    try {
      await recordSession(this.conversationHistory, this.childName);

      appendRewardLog(this.childName, this.rewardLog);

      this.send("session_ended", {
        summary: `Session ended. ${this.conversationHistory.length} turns.`,
        duration_ms: Date.now() - this.sessionStartTime,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("  🔴 Post-session chain error:", message);
      this.send("error", { message: "Post-session processing failed" });
    }
  }

  private async connectDeepgram(): Promise<void> {
    this.fluxHandle = await connectFlux({
      onOpen: () => {
        console.log("  ✅ Deepgram Flux connected");
      },
      onStartOfTurn: () => {},
      onInterim: (text) => {
        this.send("interim", { text });
      },
      onEndOfTurn: (transcript) => {
        this.handleEndOfTurn(transcript).catch(console.error);
      },
      onError: (err) => {
        console.error("  🔴 Deepgram error:", err.message);
      },
    });
  }

  private shouldQueueTranscript(transcript: string): boolean {
    const words = transcript.trim().split(/\s+/);
    if (words.length < 4) {
      const isCompleteShort = /^(yes|no|yeah|nope|\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i.test(
        transcript.trim()
      );
      if (!isCompleteShort) {
        console.log(`  🗑️  Transcript fragment discarded: "${transcript}"`);
        return false;
      }
    }
    return true;
  }

  private async handleEndOfTurn(
    transcript: string,
    isReplay = false
  ): Promise<void> {
    if (!isReplay) {
      const now = Date.now();
      const normalized = transcript.toLowerCase().trim();
      if (
        normalized === this.lastTranscript &&
        now - this.lastTranscriptTime < 3000
      ) {
        console.log(
          `  ⚠️  Duplicate transcript suppressed: "${transcript}"`
        );
        return;
      }
      this.lastTranscript = normalized;
      this.lastTranscriptTime = now;
    }

    const state = this.turnSM.getState();

    if (
      state === "PROCESSING" ||
      state === "CANVAS_PENDING" ||
      state === "SPEAKING"
    ) {
      if (!this.shouldQueueTranscript(transcript)) return;
      console.log(`  📥 Queued transcript (${state}): "${transcript}"`);
      this.turnSM.setPendingTranscript(transcript);
      return;
    }

    this.turnSM.onEndOfTurn();

    const ts = new Date().toISOString();
    console.log(`  💬 [${ts}] ${this.childName}: "${transcript}"`);

    this.send("final", { text: transcript });

    if (checkUserGoodbye(transcript)) {
      console.log(`  👋 [${ts}] Goodbye detected`);
      await this.end();
      return;
    }

    this.roundNumber++;
    await this.runCompanionResponse(transcript);
  }

  private async runCompanionResponse(userMessage: string): Promise<void> {
    this.currentAbort = new AbortController();
    let fullResponse = "";

    // Reconnect TTS for this turn — ElevenLabs WS closes after each finish()
    if (this.ttsBridge) {
      await this.ttsBridge.connect();
    }

    const transitionToWorkPhase =
      this.roundNumber >= 5 && this.childName === "Ila";

    try {
      await runAgent({
        history: this.conversationHistory,
        userMessage,
        profile: this.companion,
        onToken: (chunk) => {
          fullResponse += chunk;
          this.send("response_text", { chunk });
          console.log(`  📝 token(${chunk.length}): "${chunk.slice(0, 30).replace(/\n/g, "↵")}"`);
          this.turnSM.onToken(chunk);
        },
        signal: this.currentAbort?.signal,
        transitionToWorkPhase,
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
            const args = (tc.args ?? tc.input ?? {}) as Record<string, unknown>;
            const result = toolResults[i];
            this.handleToolCall(toolName, args, result);

            if (toolName === "showCanvas") {
              // Always send the draw event to the browser
              this.send("canvas_draw", { args, result });

              // Only gate TTS on it if we're still in the processing phase
              const s = this.turnSM.getState();
              if (s === "PROCESSING") {
                this.turnSM.onShowCanvas();
              }
            }
          }
        },
      });

      this.turnSM.onAgentComplete();

      if (!fullResponse.trim()) {
        console.warn(
          "  ⚠️  runAgent completed with empty fullResponse — check onToken wiring"
        );
      }

      this.conversationHistory.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: fullResponse }
      );

      if (checkAssistantGoodbye(fullResponse)) {
        console.log("  👋 Companion said goodbye");
        await this.end();
        return;
      }

      if (this.ttsBridge) {
        await this.ttsBridge.finish();
      }
      this.send("audio_done");
      this.turnSM.onSpeakingDone();

      // After agent completes and TTS flushes, check for queued transcript
      const pending = this.turnSM.consumePendingTranscript();
      if (pending) {
        console.log(`  ▶️  Replaying queued transcript: "${pending}"`);
        setTimeout(() => this.handleEndOfTurn(pending, true), 300);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("  ⚡ Agent aborted (barge-in)");
        this.turnSM.onInterrupt();
        return;
      }
      this.turnSM.onInterrupt();
      const message = err instanceof Error ? err.message : String(err);
      console.error("  🔴 Agent error:", message);
      this.send("error", { message: "Companion response failed" });
    } finally {
      this.currentAbort = null;
    }
  }

  private async handleCompanionTurn(text: string): Promise<void> {
    this.send("response_text", { chunk: text });
    if (this.ttsBridge) {
      this.ttsBridge.sendText(text);
      await this.ttsBridge.finish();
    }
    this.send("audio_done");
  }

  handleToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: unknown
  ): void {
    this.send("tool_call", { tool, args, result });

    if (tool === "logAttempt") {
      this.processReward(args);
    }

    if (tool === "showCanvas") {
      const r = (result ?? args) as {
        svg?: string;
        label?: string;
        mode?: string;
        lottieData?: Record<string, unknown>;
      };
      if (r?.mode === "reward" || r?.mode === "championship") {
        const { takeover_ms } = getRewardDurations(this.childName);
        this.send("reward", {
          rewardStyle: "takeover",
          svg: r?.svg,
          label: r?.label,
          lottieData: r?.lottieData,
          displayDuration_ms: takeover_ms,
        });
        this.logRewardEvent("takeover", takeover_ms);
      }
    }
  }

  private processReward(attemptArgs: Record<string, unknown>): void {
    const correct = attemptArgs.correct === true;

    if (correct) {
      this.correctStreak++;

      if (this.childName === "Ila") {
        const { flash_ms } = getRewardDurations(this.childName);
        this.send("reward", {
          rewardStyle: "flash",
          displayDuration_ms: flash_ms,
        });
        this.logRewardEvent("flash", flash_ms);
      }

      if (this.correctStreak === 3) {
        this.send("phase", { phase: "riddle" });
      }

      if (this.correctStreak === 5) {
        this.send("phase", { phase: "championship" });
        this.correctStreak = 0;
      }
    } else {
      this.correctStreak = 0;
    }
  }

  private logRewardEvent(style: string, duration_ms: number): void {
    this.rewardLog.push({
      timestamp: new Date().toISOString(),
      rewardStyle: style as "flash" | "takeover" | "none",
      displayDuration_ms: duration_ms,
      timeToNextUtterance_ms: -1,
      nextAnswerCorrect: null,
      childVerbalReaction: null,
      sessionPhase: "learning",
      correctStreakAtTime: this.correctStreak,
    });
  }
}
