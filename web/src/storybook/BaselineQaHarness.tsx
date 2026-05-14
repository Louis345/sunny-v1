import React, { useCallback, useState } from "react";
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
  borderLeft: "1px solid rgba(148, 163, 184, 0.22)",
  background: "#101820",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 0,
};

function buttonStyle(kind: "primary" | "neutral" | "danger" = "neutral"): React.CSSProperties {
  const bg =
    kind === "primary" ? "#22c55e" : kind === "danger" ? "#ef4444" : "#263341";
  const color = kind === "primary" ? "#052e16" : "#f8fafc";
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 8,
    background: bg,
    color,
    padding: "9px 10px",
    fontWeight: 800,
    cursor: "pointer",
    textTransform: "lowercase",
  };
}

export function BaselineQaHarness({
  fixture,
  transcript,
  onTranscript,
  children,
}: BaselineQaHarnessProps): React.ReactElement {
  const [eventLog, setEventLog] = useState<string[]>([]);
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
