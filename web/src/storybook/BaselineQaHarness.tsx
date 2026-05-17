import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type BaselineFixtureState,
  type BaselineQaFixture,
  type IframeBaselineActivityId,
  makeIframeGameUrl,
} from "./baselineQaFixtures";

export interface BaselineQaHarnessProps {
  fixture: BaselineQaFixture;
  transcript: string;
  onTranscript: (text: string) => void;
  children: React.ReactNode;
}

type SpeechRecognitionAlternative = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  0?: SpeechRecognitionAlternative;
};

type SpeechRecognitionEventLike = {
  resultIndex?: number;
  results?: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type NarrationRequestLike = {
  type?: unknown;
  activityId?: unknown;
  word?: unknown;
  text?: unknown;
  reason?: unknown;
};

function browserSpeechRecognition(): SpeechRecognitionConstructor | null {
  const candidateWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidateWindow.SpeechRecognition ?? candidateWindow.webkitSpeechRecognition ?? null;
}

function narrationText(data: NarrationRequestLike): string {
  const word = typeof data.word === "string" ? data.word.trim() : "";
  if (word) return word;
  const text = typeof data.text === "string" ? data.text.trim() : "";
  return text.replace(/[.!?]+$/g, "").trim();
}

const shellStyle: React.CSSProperties = {
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  background: "#071013",
  color: "#f8fafc",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const frameStyle: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  background: "#0f172a",
};

const panelStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 10000,
  borderLeft: "1px solid rgba(148, 163, 184, 0.22)",
  background: "#101820",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 0,
};

function buttonStyle(
  kind: "primary" | "neutral" | "danger" = "neutral",
  disabled = false,
): React.CSSProperties {
  const bg =
    kind === "primary" ? "#22c55e" : kind === "danger" ? "#ef4444" : "#263341";
  const color = kind === "primary" ? "#052e16" : "#f8fafc";
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 8,
    background: bg,
    color,
    opacity: disabled ? 0.48 : 1,
    padding: "9px 10px",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "lowercase",
  };
}

function isLiveMicPermissionError(event: SpeechRecognitionErrorLike): boolean {
  const reason = event.error ?? event.message ?? "";
  return reason === "not-allowed" || reason === "service-not-allowed";
}

export function BaselineQaHarness({
  fixture,
  transcript,
  onTranscript,
  children,
}: BaselineQaHarnessProps): React.ReactElement {
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [liveMicState, setLiveMicState] = useState<"idle" | "listening" | "unavailable" | "error" | "blocked">("idle");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const push = useCallback((event: string) => {
    setEventLog((current) => [`${new Date().toLocaleTimeString()} · ${event}`, ...current].slice(0, 8));
  }, []);
  const setTranscript = useCallback(
    (event: string, text: string) => {
      onTranscript(text);
      push(`${event}: ${text || "clear"}`);
    },
    [onTranscript, push],
  );
  const stopLiveMic = useCallback(() => {
    if (liveMicState !== "listening") return;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setLiveMicState("idle");
    push("live_mic_stop");
  }, [liveMicState, push]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as NarrationRequestLike;
      if (!data || typeof data !== "object" || data.type !== "narration_request") return;
      const text = narrationText(data);
      const activityId = typeof data.activityId === "string" ? data.activityId : fixture.activityId;
      if (!text) {
        push(`storybook_audio_bridge: ${activityId} missing_text`);
        return;
      }
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
        push(`storybook_audio_bridge: ${activityId} unavailable ${text}`);
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.02;
        synth.cancel();
        synth.speak(utterance);
        push(`storybook_audio_bridge: ${activityId} ${text}`);
        console.info(" 🎮 [storybook-audio] narration_request played", {
          activityId,
          text,
          reason: data.reason,
        });
      } catch (error) {
        push(`storybook_audio_bridge: ${activityId} failed ${text}`);
        console.warn(" 🎮 [storybook-audio] narration_request failed", error);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fixture.activityId, push]);

  const startLiveMic = useCallback(() => {
    if (liveMicState === "blocked") {
      push("live_mic_blocked_retry_ignored");
      return;
    }
    const Recognition = browserSpeechRecognition();
    if (!Recognition) {
      setLiveMicState("unavailable");
      push("live_mic_unavailable");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const parts: string[] = [];
      const start = event.resultIndex ?? 0;
      for (let i = start; i < (event.results?.length ?? 0); i += 1) {
        const text = event.results?.[i]?.[0]?.transcript?.trim();
        if (text) parts.push(text);
      }
      const next = parts.join(" ").trim();
      if (!next) return;
      onTranscript(next);
      push(`live_mic: ${next}`);
    };
    recognition.onerror = (event) => {
      if (isLiveMicPermissionError(event)) {
        recognition.stop();
        recognitionRef.current = null;
        setLiveMicState("blocked");
        push(`live_mic_blocked: ${event.error ?? event.message ?? "unknown"}`);
        return;
      }
      setLiveMicState("error");
      push(`live_mic_error: ${event.error ?? event.message ?? "unknown"}`);
    };
    recognition.onend = () => {
      setLiveMicState((current) => (current === "listening" ? "idle" : current));
    };
    recognitionRef.current = recognition;
    setLiveMicState("listening");
    push("live_mic_start");
    recognition.start();
  }, [liveMicState, onTranscript, push]);

  const liveMicBlocked = liveMicState === "blocked";
  const liveMicListening = liveMicState === "listening";

  return (
    <div style={shellStyle}>
      <main style={frameStyle}>{children}</main>
      <aside style={panelStyle} aria-label="Baseline QA controls">
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 900 }}>
            {fixture.activityId} · {fixture.state}
          </div>
          <h1 style={{ fontSize: 18, lineHeight: 1.2, margin: "6px 0 6px" }}>{fixture.title}</h1>
          <p style={{ fontSize: 13, lineHeight: 1.4, color: "#cbd5e1", margin: 0 }}>
            {fixture.purpose}
          </p>
        </div>

        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
          transcript
          <textarea
            value={transcript}
            onChange={(event) => onTranscript(event.currentTarget.value)}
            rows={4}
            style={{
              resize: "vertical",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "#071013",
              color: "#f8fafc",
              padding: 10,
              font: "inherit",
            }}
          />
        </label>

        <div
          style={{
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 8,
            background: "#071013",
            border: "1px solid rgba(148,163,184,0.26)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#cbd5e1" }}>live user speech</div>
            <div
              aria-label="Live mic state"
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: liveMicState === "listening" ? "#86efac" : liveMicState === "error" || liveMicState === "blocked" ? "#fca5a5" : "#94a3b8",
              }}
            >
              {liveMicState}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              style={buttonStyle("primary", liveMicBlocked)}
              onClick={startLiveMic}
              disabled={liveMicBlocked}
            >
              {liveMicBlocked ? "mic blocked" : "start live mic"}
            </button>
            <button
              type="button"
              style={buttonStyle("neutral", !liveMicListening)}
              onClick={stopLiveMic}
              disabled={!liveMicListening}
            >
              stop live mic
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            type="button"
            style={buttonStyle("primary")}
            onClick={() => setTranscript("say_current", fixture.currentWord)}
          >
            say current
          </button>
          <button
            type="button"
            style={buttonStyle("danger")}
            onClick={() => setTranscript("say_wrong", fixture.wrongTranscript)}
          >
            say wrong
          </button>
          <button
            type="button"
            style={buttonStyle()}
            onClick={() => setTranscript("help_support", fixture.supportTranscript)}
          >
            help/support
          </button>
          <button
            type="button"
            style={buttonStyle("danger")}
            onClick={() => {
              onTranscript("");
              push("miss");
            }}
          >
            miss
          </button>
          <button
            type="button"
            style={buttonStyle("primary")}
            onClick={() => setTranscript("complete", fixture.completionTranscript)}
          >
            complete
          </button>
          <button
            type="button"
            style={buttonStyle()}
            onClick={() => {
              onTranscript("");
              setEventLog([]);
            }}
          >
            reset
          </button>
        </div>

        <div style={{ display: "grid", gap: 6, minHeight: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#94a3b8" }}>event log</div>
          <div
            aria-label="QA event log"
            style={{
              minHeight: 120,
              overflow: "auto",
              borderRadius: 8,
              background: "#071013",
              padding: 10,
              fontSize: 12,
              lineHeight: 1.5,
              color: "#cbd5e1",
            }}
          >
            {eventLog.length ? eventLog.map((event) => <div key={event}>{event}</div>) : "No events yet."}
          </div>
        </div>
      </aside>
    </div>
  );
}

export interface IframeInstrumentFrameProps {
  activityId: IframeBaselineActivityId;
  state: BaselineFixtureState;
  title: string;
}

export function IframeInstrumentFrame({
  activityId,
  state,
  title,
}: IframeInstrumentFrameProps): React.ReactElement {
  return (
    <iframe
      title={title}
      src={makeIframeGameUrl(activityId, state)}
      style={{
        width: "100%",
        height: "100%",
        border: 0,
        display: "block",
        background: "#050816",
      }}
      allow="autoplay; microphone"
    />
  );
}
