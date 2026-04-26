import React, { useCallback, useEffect, useMemo } from "react";
import {
  useWordRadar,
  shouldShowPersonalBestBadge,
  type WordRadarGameEvent,
} from "../hooks/useWordRadar";
import { CompanionLayer } from "./CompanionLayer";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { createFlowGameEvents } from "../utils/flowGameEvents";

/** Locked contracts — do not deviate. */
export interface RadarItem {
  display: string;
  acceptedResponses: string[];
  hint?: string;
  label?: string;
  subject?: "spelling" | "math" | "reading" | "science" | string;
  choices?: string[];
}

export interface ItemResult {
  item: RadarItem;
  correct: boolean;
  responseTime_ms: number;
  attempts: number;
  heardTranscript?: string;
  heardToken?: string;
}

export interface WordRadarResult {
  knownItems: RadarItem[];
  weakItems: RadarItem[];
  unknownItems: RadarItem[];
  accuracy: number;
  rawResults: ItemResult[];
  timeSpent_ms: number;
}

export interface WordRadarProps {
  items: RadarItem[];
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  timerSeconds?: number;
  showKeyboard?: boolean;
  inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
  speakStyle?: "option-a" | "option-b";
  keyboardStyle?: "option-b" | "option-c";
  personalBests: Record<string, number>;
  onComplete: (result: WordRadarResult) => void;
  /** Skip the "Ready!" intro screen and start immediately. Use in diagnostic mode. */
  autoStart?: boolean;
  /** Optional companion to show as a portrait avatar (bottom-right circle). */
  companion?: CompanionConfig | null;
  /** Required when companion is provided. */
  childId?: string;
}

const BG = "#12002e";
const SUBJECT_META: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  spelling: { label: "Spelling", color: "#9F7AEA", icon: "✏️", bg: "rgba(159,122,234,0.15)" },
  math: { label: "Math", color: "#FFD93D", icon: "🔢", bg: "rgba(255,217,61,0.12)" },
  reading: { label: "Reading", color: "#1D9E75", icon: "📖", bg: "rgba(29,158,117,0.15)" },
  science: { label: "Science", color: "#38BDF8", icon: "🔬", bg: "rgba(56,189,248,0.15)" },
};
const QWERTY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

function timerColor(ratio: number): string {
  if (ratio > 0.5) return "#facc15";
  if (ratio > 0.2) return "#fb923c";
  return "#ef4444";
}

/** Confidence bar label + colors for speakStyle option-b (STT partial match). */
function wordRadarConfidencePresentation(
  matchRatio: number,
  matched: boolean,
): { label: string; labelColor: string; fillWidthPct: number; barFill: string } {
  const fillWidthPct =
    matched || matchRatio >= 1 ? 100 : Math.max(0, Math.min(100, matchRatio * 100));
  if (matched || matchRatio >= 1) {
    return {
      label: "got it!",
      labelColor: "#86efac",
      fillWidthPct,
      barFill: "#86efac",
    };
  }
  if (matchRatio < 0.1) {
    return {
      label: "listening...",
      labelColor: "rgba(233,213,255,0.4)",
      fillWidthPct,
      barFill: "rgba(167,139,250,0.55)",
    };
  }
  if (matchRatio < 0.5) {
    return {
      label: "keep going...",
      labelColor: "#a5b4fc",
      fillWidthPct,
      barFill: "linear-gradient(90deg, #a78bfa 0%, #818cf8 100%)",
    };
  }
  if (matchRatio < 0.85) {
    return {
      label: "almost there!",
      labelColor: "#a5b4fc",
      fillWidthPct,
      barFill: "linear-gradient(90deg, #a78bfa 0%, #a5b4fc 100%)",
    };
  }
  return {
    label: "almost there!",
    labelColor: "#86efac",
    fillWidthPct,
    barFill: "linear-gradient(90deg, #a78bfa 0%, #86efac 100%)",
  };
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function WordRadar({
  items,
  interimTranscript,
  sendMessage,
  timerSeconds,
  showKeyboard = false,
  inputMode,
  speakStyle,
  keyboardStyle,
  personalBests,
  onComplete,
  autoStart = false,
  companion,
  childId,
}: WordRadarProps): React.ReactElement {
  const flowEvents = useMemo(
    () =>
      createFlowGameEvents({
        game: "word-radar",
        childId: childId || "unknown",
        sendMessage,
      }),
    [childId, sendMessage],
  );

  const handleWordRadarEvent = useCallback(
    (event: WordRadarGameEvent) => {
      if (event.type === "ready") {
        flowEvents.reportState("Word Radar intro ready.");
        return;
      }
      if (event.type === "heard" && event.item) {
        flowEvents.reportState(`Heard "${event.heardToken ?? ""}"`, {
          expected: event.item.display,
          label: event.item.label,
          subject: event.item.subject,
          heardTranscript: event.heardTranscript,
          attempts: event.attempts,
        });
        return;
      }
      if ((event.type === "correct" || event.type === "incorrect" || event.type === "timeout") && event.item) {
        const correct = event.type === "correct";
        flowEvents.fireCompanionEvent(correct ? "correct_answer" : "wrong_answer", {
          game: "word-radar",
          expected: event.item.display,
          heardToken: event.heardToken,
          heardTranscript: event.heardTranscript,
          attempts: event.attempts,
          responseTime_ms: event.responseTime_ms,
          reason: event.reason ?? event.type,
        });
        flowEvents.reportState(
          `${correct ? "Correct" : "Missed"}: expected ${event.item.display}, heard ${event.heardToken ?? ""}`,
          {
            expected: event.item.display,
            heardToken: event.heardToken,
            result: event.type,
          },
        );
        return;
      }
      if (event.type === "complete" && event.result) {
        flowEvents.reportState("Word Radar complete.", {
          accuracy: event.result.accuracy,
          rawResults: event.result.rawResults,
        });
      }
    },
    [flowEvents],
  );

  const handleFinish = (result: WordRadarResult) => {
    sendMessage("word_radar_complete", result as unknown as Record<string, unknown>);
    flowEvents.complete(result as unknown as Record<string, unknown>);
    onComplete(result);
  };

  const hook = useWordRadar({
    items,
    interimTranscript,
    timerSeconds,
    startImmediately: false,
    showKeyboard,
    inputMode,
    speakStyle,
    keyboardStyle,
    personalBests,
    onEvent: handleWordRadarEvent,
    onFinish: handleFinish,
  });

  const hookPhase = hook.phase;
  const hookStart = hook.start;
  useEffect(() => {
    if (autoStart && hookPhase === "intro") {
      hookStart();
    }
  }, [autoStart, hookPhase, hookStart]);

  useEffect(() => {
    document.body.classList.add("word-radar-active");
    sendMessage("game_event", {
      event: {
        type: "voice_control",
        voiceEnabled: false,
        payload: {
          game: "word-radar",
          childId: childId || "unknown",
        },
        version: "1.0",
      },
    });
    return () => {
      document.body.classList.remove("word-radar-active");
      sendMessage("game_event", {
        event: {
          type: "voice_control",
          voiceEnabled: true,
          payload: {
            game: "word-radar",
            childId: childId || "unknown",
          },
          version: "1.0",
        },
      });
    };
  }, [childId, sendMessage]);

  const effectiveSpeakStyle = speakStyle ?? "option-a";
  const confidencePresentation = useMemo(() => {
    if (hook.phase !== "response" || effectiveSpeakStyle !== "option-b") return null;
    return wordRadarConfidencePresentation(hook.matchRatio, false);
  }, [hook.phase, hook.matchRatio, effectiveSpeakStyle]);

  const stars = useMemo(() => {
    const rnd = mulberry32(0x5f3759df);
    return Array.from({ length: 55 }, (_, i) => ({
      id: i,
      left: `${(rnd() * 100).toFixed(2)}%`,
      top: `${(rnd() * 100).toFixed(2)}%`,
      size: 1 + rnd() * 2,
      delay: `${(rnd() * 4).toFixed(2)}s`,
      dur: `${(2 + rnd() * 3).toFixed(2)}s`,
    }));
  }, []);

  const display = hook.currentItem?.display ?? "";
  const showPb =
    hook.currentItem &&
    shouldShowPersonalBestBadge(timerSeconds, personalBests, hook.currentItem.display);
  const pbMs = hook.currentItem
    ? personalBests[hook.currentItem.display]
    : undefined;

  const ringRadius = 52;
  const circumference = 2 * Math.PI * ringRadius;
  const dash = circumference * hook.timerRemainingRatio;
  const subjectKey = hook.currentItem?.subject ?? hook.currentItem?.label?.toLowerCase() ?? "reading";
  const subjectMeta = SUBJECT_META[subjectKey] ?? SUBJECT_META.reading!;
  const tileCount = Math.max(display.length, 1);
  const hideLetterTilesInResponse =
    hook.phase === "response" && effectiveSpeakStyle === "option-b";
  const activeInputMode = inputMode ?? (showKeyboard ? "keyboard" : "whole-word");
  const keyboardVisible = showKeyboard || activeInputMode === "keyboard";

  return (
    <>
    <div
      data-testid="word-radar-root"
      style={{
        position: "absolute",
        inset: 0,
        background: BG,
        fontFamily: "'Lexend', system-ui, sans-serif",
        overflow: "hidden",
        zIndex: 40,
      }}
    >
      <span
        data-testid="word-radar-phase"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        aria-hidden
      >
        {hook.phase}
      </span>
      <style>{`
        @keyframes wr-twinkle {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        @keyframes wr-shoot {
          0% { transform: translate(0,0) rotate(-35deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(-120vw, 60vh) rotate(-35deg); opacity: 0; }
        }
        @keyframes wr-slamIn {
          0% { transform: scale(2.2); opacity: 0.85; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes wr-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes wr-floatUp {
          0% { transform: translateY(24px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes wr-tileIn {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          70% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes wr-micPulse {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.06); opacity: 1; }
        }
      `}</style>

      <div data-testid="word-radar-starfield" style={{ position: "absolute", inset: 0 }}>
        {stars.map((s) => (
          <span
            key={s.id}
            className="wr-star"
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              background: "#fff",
              opacity: 0.5,
              animation: `wr-twinkle ${s.dur} ease-in-out infinite`,
              animationDelay: s.delay,
            }}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={`shoot-${i}`}
            aria-hidden
            style={{
              position: "absolute",
              right: `${-10 + i * 18}%`,
              top: `${8 + i * 12}%`,
              width: 80,
              height: 2,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.85))",
              borderRadius: 2,
              animation: `wr-shoot ${7 + i}s linear infinite`,
              animationDelay: `${i * 2.1}s`,
            }}
          />
        ))}
      </div>

      {/* Progress dots */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 8,
          zIndex: 5,
        }}
      >
        {items.map((_, i) => {
          const tone = hook.dotOutcomes[i] ?? "pending";
          const bg =
            tone === "known"
              ? "#22c55e"
              : tone === "weak"
                ? "#eab308"
                : tone === "unknown"
                  ? "#ef4444"
                  : "rgba(255,255,255,0.25)";
          return (
            <span
              key={i}
              data-testid="word-radar-progress-dot"
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: bg,
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            />
          );
        })}
      </div>

      {showPb && typeof pbMs === "number" ? (
        <div
          data-testid="word-radar-personal-best"
          style={{
            position: "absolute",
            top: 20,
            right: 24,
            zIndex: 6,
            color: "#fef08a",
            fontSize: 14,
            fontWeight: 700,
            textShadow: "0 0 12px rgba(250,204,21,0.6)",
          }}
        >
          ⚡ {(pbMs / 1000).toFixed(1)}s
        </div>
      ) : null}

      {/* Feedback full-screen flash */}
      {hook.phase === "feedback" && hook.lastFeedback ? (
        <div
          data-testid="word-radar-feedback-flash"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            pointerEvents: "none",
            background:
              hook.lastFeedback === "got"
                ? "rgba(34,197,94,0.45)"
                : "rgba(239,68,68,0.45)",
            animation: "wr-twinkle 0.35s ease-out 1",
          }}
        />
      ) : null}

      <div
        style={{
          position: "relative",
          zIndex: 4,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        {hook.phase === "intro" ? (
          <div
            style={{
              textAlign: "center",
              width: "min(560px, 90vw)",
              animation: "wr-floatUp 420ms ease both",
            }}
          >
            <div
              style={{
                color: "#b89dff",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Quick game first
            </div>
            <h1
              style={{
                color: "#FFD93D",
                fontSize: "clamp(42px, 7vw, 72px)",
                lineHeight: 1.05,
                fontWeight: 900,
                textShadow: "0 8px 28px rgba(0,0,0,0.45)",
                marginBottom: 18,
              }}
            >
              Let's see what you know!
            </h1>
            <p
              style={{
                color: "rgba(233,213,255,0.75)",
                fontSize: 15,
                lineHeight: 1.5,
                fontWeight: 700,
                maxWidth: 380,
                margin: "0 auto 28px",
              }}
            >
              Things will flash fast. Say what you see.
            </p>
            <button
              type="button"
              data-testid="word-radar-ready"
              onClick={hook.start}
              style={{
                border: "none",
                borderRadius: 24,
                padding: "18px 54px",
                background: "linear-gradient(135deg,#FFD93D,#FF9800)",
                color: "#12002e",
                fontSize: 22,
                fontWeight: 900,
                boxShadow: "0 14px 34px rgba(255,152,0,0.35)",
                cursor: "pointer",
              }}
            >
              Ready!
            </button>
          </div>
        ) : null}

        {hook.phase === "end" ? (
          <div
            style={{
              textAlign: "center",
              color: "#e9d5ff",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            Session complete
          </div>
        ) : null}

        {hook.phase === "flash" && hook.currentItem ? (
          <div
            key={hook.itemIndex}
            style={{
              animation: `wr-slamIn 350ms cubic-bezier(0.22, 1, 0.36, 1) both`,
              fontSize: "clamp(48px, 12vw, 96px)",
              fontWeight: 900,
              color: "#faf5ff",
              textAlign: "center",
              textShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: subjectMeta.bg,
                border: `1.5px solid ${subjectMeta.color}55`,
                borderRadius: 999,
                padding: "6px 14px",
                color: subjectMeta.color,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 18,
              }}
            >
              <span>{subjectMeta.icon}</span>
              {hook.currentItem.label ?? subjectMeta.label}
            </div>
            <div>{hook.currentItem.display}</div>
          </div>
        ) : null}

        {(hook.phase === "response" || hook.phase === "feedback") && hook.currentItem ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 28,
              width: "100%",
              maxWidth: 720,
            }}
          >
            {hook.phase === "response" &&
            typeof timerSeconds === "number" &&
            timerSeconds > 0 ? (
              <div
                style={{
                  position: "relative",
                  width: 120,
                  height: 120,
                }}
              >
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 120 120"
                  aria-hidden
                  data-testid="word-radar-timer"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke={timerColor(hook.timerRemainingRatio)}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference}`}
                    transform="rotate(-90 60 60)"
                    style={{ transition: "stroke-dasharray 0.05s linear, stroke 0.2s" }}
                  />
                </svg>
                <div
                  data-testid="word-radar-timer-readout"
                  aria-live="polite"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    fontFamily: "'Lexend', system-ui, sans-serif",
                  }}
                >
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: "#f8fafc",
                      textShadow: "0 2px 14px rgba(0,0,0,0.7)",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Math.max(0, Math.ceil(hook.timerRemainingRatio * timerSeconds))}s
                  </span>
                  <span
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "rgba(248,250,252,0.55)",
                    }}
                  >
                    of {timerSeconds}s
                  </span>
                </div>
              </div>
            ) : null}

            {hook.phase === "response" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: effectiveSpeakStyle === "option-b" ? 10 : 0,
                }}
              >
                <div
                  data-testid="word-radar-mic"
                  aria-hidden
                  style={{
                    fontSize: 36,
                    lineHeight: 1,
                    filter: "drop-shadow(0 0 12px rgba(167,139,250,0.55))",
                    animation: "wr-micPulse 1.2s ease-in-out infinite",
                  }}
                >
                  🎤
                </div>
                {confidencePresentation ? (
                  <div
                    data-testid="word-radar-confidence-bar"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      width: 260,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(15,23,42,0.65)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        overflow: "hidden",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        data-testid="word-radar-confidence-fill"
                        style={{
                          height: "100%",
                          width: `${confidencePresentation.fillWidthPct}%`,
                          borderRadius: 999,
                          background: confidencePresentation.barFill,
                          transition: "width 0.12s ease-out, background 0.2s ease",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: confidencePresentation.labelColor,
                        fontFamily: "'Lexend', system-ui, sans-serif",
                        transition: "color 0.2s ease",
                      }}
                    >
                      {confidencePresentation.label}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!hideLetterTilesInResponse ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 8,
                  ...(hook.phase === "feedback" && hook.lastFeedback === "missed"
                    ? { animation: "wr-shake 0.4s ease" }
                    : {}),
                }}
              >
                {Array.from({ length: tileCount }).map((_, i) => {
                  const ch = display[i] ?? "";
                  const isFeedback = hook.phase === "feedback";
                  const got = isFeedback && hook.lastFeedback === "got";
                  const missed = isFeedback && hook.lastFeedback === "missed";
                  const responseLetter =
                    hook.phase === "response" ? hook.lockedLetters[i] ?? "" : "";
                  const isTileShake =
                    hook.phase === "response" && hook.shakeLetterIndex === i;
                  return (
                    <span
                      key={`${hook.itemIndex}-${i}`}
                      data-testid="word-radar-letter-tile"
                      style={{
                        minWidth: 44,
                        minHeight: 60,
                        padding: "10px 12px",
                        borderRadius: 10,
                        boxSizing: "border-box",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        fontSize: 32,
                        fontWeight: 800,
                        border: "2px solid rgba(255,255,255,0.2)",
                        background: got
                          ? "rgba(34,197,94,0.45)"
                          : missed
                            ? "rgba(239,68,68,0.25)"
                            : "rgba(15,23,42,0.5)",
                        color: got ? "#ecfccb" : "#e2e8f0",
                        transition: "background 0.15s ease, color 0.15s ease",
                        animation: got ? "wr-tileIn 180ms ease both" : undefined,
                        animationDelay: got ? `${i * 55}ms` : undefined,
                        ...(isTileShake ? { animation: "wr-shake 0.4s ease" } : {}),
                      }}
                    >
                      {got ? ch : responseLetter}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {hook.phase === "response" && hook.currentItem.hint ? (
              <div style={{ color: "rgba(226,232,240,0.75)", fontSize: 15 }}>
                {hook.currentItem.hint}
              </div>
            ) : null}

            {hook.phase === "response" && keyboardVisible ? (
              <div
                data-testid="word-radar-keyboard"
                style={{
                  width: "100%",
                  maxWidth: 520,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                  ...(hook.shakeKeyboard ? { animation: "wr-shake 0.4s ease" } : {}),
                }}
              >
                <input
                  type="text"
                  data-testid="word-radar-input"
                  value={hook.typedBuffer}
                  onChange={(e) => hook.setTypedBuffer(e.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Type the word"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 12,
                    border: "2px solid rgba(255,255,255,0.25)",
                    background: "rgba(15,23,42,0.55)",
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    padding: "14px 16px",
                    textAlign: "center",
                  }}
                />
                {QWERTY_ROWS.map((row) => (
                  <div
                    key={row.join("")}
                    style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}
                  >
                    {row.map((k) => (
                      <button
                        key={k}
                        type="button"
                        data-testid={`word-radar-key-${k}`}
                        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-lg font-bold uppercase text-white hover:bg-white/20"
                        onClick={() => hook.appendTypedKey(k)}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                  <button
                    type="button"
                    data-testid="word-radar-key-space"
                    className="rounded-lg border border-white/20 bg-white/10 px-6 py-2 text-sm font-bold text-white"
                    onClick={() => hook.appendTypedKey(" ")}
                  >
                    Space
                  </button>
                  <button
                    type="button"
                    data-testid="word-radar-key-back"
                    className="rounded-lg border border-white/20 bg-white/10 px-6 py-2 text-sm font-bold text-white"
                    onClick={() => hook.appendTypedKey("Backspace")}
                  >
                    ⌫
                  </button>
                </div>
              </div>
            ) : null}

            {hook.phase === "response" ? (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  data-testid="word-radar-btn-skip"
                  onClick={hook.handleSkip}
                  style={{
                    border: "1.5px solid rgba(255,255,255,0.2)",
                    borderRadius: 18,
                    padding: "12px 28px",
                    background: "rgba(15,23,42,0.55)",
                    color: "rgba(248,250,252,0.75)",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
                {hook.canTryAgain ? (
                  <button
                    type="button"
                    data-testid="word-radar-btn-try-again"
                    onClick={hook.handleTryAgain}
                    style={{
                      border: "none",
                      borderRadius: 18,
                      padding: "12px 28px",
                      background: "linear-gradient(135deg,#6d28d9,#4f46e5)",
                      color: "#ede9fe",
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Try Again
                  </button>
                ) : null}
              </div>
            ) : null}

            {hook.phase === "feedback" ? (
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fef3c7" }}>
                {hook.lastFeedback === "got" ? "Got it!" : "Missed"}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
    {companion && childId ? (
      <CompanionLayer
        mode="portrait"
        childId={childId}
        companion={companion}
        toggledOff={false}
      />
    ) : null}
    </>
  );
}
