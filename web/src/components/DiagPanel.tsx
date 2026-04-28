import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMPANION_EMOTES,
  type CompanionEmote,
} from "../../../src/shared/companionEmotes";
import { COMPANION_ANIMATION_IDS } from "../../../src/shared/companions/companionContract";

const DIAG_CHILD = "creator";

export interface DiagPanelProps {
  startSession: (
    childName: string,
    options?: { diagKiosk?: boolean; silentTts?: boolean; sttOnly?: boolean },
  ) => void;
  endSession: () => void;
  voiceActive: boolean;
  onCameraAct: (
    angle: "close-up" | "mid-shot" | "full-body" | "wide",
  ) => void;
  onTestReading?: () => void;
  onTestPronunciation?: () => void;
  onTestWordRadar?: () => void;
  onTestWordle?: () => void;
  onTestWheelOfFortune?: () => void;
}

async function postTestCompanionEvent(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/map/test-companion-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(" 🎮 [DiagPanel] test-companion-event failed", res.status, err);
  }
}

let diagReadingAutoVoicePrimed = false;

export function DiagPanel({
  startSession,
  endSession,
  voiceActive,
  onCameraAct,
  onTestReading,
  onTestPronunciation,
  onTestWordRadar,
  onTestWordle,
  onTestWheelOfFortune,
}: DiagPanelProps) {
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;

  useEffect(() => {
    if (
      import.meta.env.VITE_DIAG_READING !== "true" &&
      import.meta.env.VITE_DIAG_PRONUNCIATION !== "true"
    ) {
      return;
    }
    if (voiceActive) return;
    if (diagReadingAutoVoicePrimed) return;
    diagReadingAutoVoicePrimed = true;
    startSessionRef.current(DIAG_CHILD, {
      diagKiosk: true,
      silentTts: import.meta.env.VITE_DIAG_READING === "true",
      sttOnly:
        import.meta.env.VITE_DIAG_READING === "true" ||
        import.meta.env.VITE_DIAG_PRONUNCIATION === "true",
    });
    if (import.meta.env.VITE_DIAG_READING === "true") {
      setTimeout(() => {
        fetch("/api/map/test-reading-mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childId: "creator" }),
        }).catch(console.error);
      }, 500);
    }
    if (import.meta.env.VITE_DIAG_PRONUNCIATION === "true") {
      setTimeout(() => {
        fetch("/api/map/test-pronunciation-mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childId: "creator" }),
        }).catch(console.error);
      }, 500);
    }
  }, [voiceActive]);

  const [emote, setEmote] = useState<CompanionEmote>("neutral");
  const [intensity, setIntensity] = useState(0.8);
  const [animation, setAnimation] = useState<string>(COMPANION_ANIMATION_IDS[0]!);
  const startDiagVoiceSession = useCallback(() => {
    startSession(DIAG_CHILD, {
      diagKiosk: true,
    });
  }, [startSession]);

  const toggleVoice = useCallback(() => {
    if (voiceActive) {
      endSession();
    } else {
      startDiagVoiceSession();
    }
  }, [voiceActive, startDiagVoiceSession, endSession]);

  const fireEmote = useCallback(() => {
    void postTestCompanionEvent({
      childId: DIAG_CHILD,
      emote,
      intensity,
    });
  }, [emote, intensity]);

  const fireAnimation = useCallback(() => {
    void postTestCompanionEvent({
      childId: DIAG_CHILD,
      type: "animate",
      payload: { animation },
    });
  }, [animation]);

  const triggerWordRadarTest = useCallback(() => {
    onTestWordRadar?.();
  }, [onTestWordRadar]);

  const [open, setOpen] = useState(false);

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-4 z-[20] flex max-w-[280px] flex-col overflow-hidden rounded-lg border border-white/20 bg-zinc-900/95 text-left text-xs text-zinc-100 shadow-lg"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label="Toggle diagnostics panel"
        onClick={() => setOpen((p) => !p)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "none",
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          color: "inherit",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <span>Diag</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="max-h-[min(70vh,520px)] overflow-y-auto p-3">
      <section className="mb-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
          Voice
        </div>
        <button
          type="button"
          className="w-full rounded-md bg-violet-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
          onClick={toggleVoice}
        >
          {voiceActive ? "Disable Voice" : "Enable Voice"}
        </button>
      </section>

      <section className="mb-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
          Fire emote
        </div>
        <select
          className="mb-2 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
          value={emote}
          onChange={(e) => setEmote(e.target.value as CompanionEmote)}
        >
          {COMPANION_EMOTES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <label className="mb-1 flex items-center gap-2 text-zinc-300">
          <span className="w-16 shrink-0">Intensity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="w-8 tabular-nums">{intensity.toFixed(2)}</span>
        </label>
        <button
          type="button"
          className="mt-2 w-full rounded-md bg-emerald-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          onClick={fireEmote}
        >
          Fire
        </button>
      </section>

      <section className="mb-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
          Animate
        </div>
        <select
          className="mb-2 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
          value={animation}
          onChange={(e) => setAnimation(e.target.value)}
        >
          {COMPANION_ANIMATION_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="w-full rounded-md bg-sky-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          onClick={fireAnimation}
        >
          Fire Animation
        </button>
      </section>

      <section className="mb-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
          Reading test
        </div>
        <button
          type="button"
          className="w-full rounded-md bg-amber-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          onClick={onTestReading}
        >
          Test Reading Mode
        </button>
      </section>

      <section className="mb-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
          Pronunciation test
        </div>
        <button
          type="button"
          className="w-full rounded-md bg-rose-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-rose-600"
          onClick={onTestPronunciation}
        >
          Test Pronunciation
        </button>
      </section>

      {onTestWordRadar != null ? (
        <section className="mb-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
            Word radar test
          </div>
          <button
            type="button"
            className="w-full rounded-md bg-violet-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
            onClick={triggerWordRadarTest}
          >
            Test Word Radar
          </button>
        </section>
      ) : null}

      <section>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
          Camera
        </div>
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              "close-up",
              "mid-shot",
              "full-body",
              "wide",
            ] as const
          ).map((angle) => (
            <button
              key={angle}
              type="button"
              className="rounded bg-zinc-700 px-2 py-1 text-[11px] text-white hover:bg-zinc-600"
              onClick={() => onCameraAct(angle)}
            >
              {angle}
            </button>
          ))}
        </div>
      </section>

      {onTestWordle != null ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 6,
            }}
          >
            WORDLE TEST
          </div>
          <button
            type="button"
            onClick={() => onTestWordle()}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: "#6d28d9",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Test Wordle
          </button>
        </div>
      ) : null}
      {onTestWheelOfFortune != null ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 6,
            }}
          >
            WHEEL OF FORTUNE TEST
          </div>
          <button
            type="button"
            onClick={() => onTestWheelOfFortune()}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: "#6d28d9",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Test Wheel of Fortune
          </button>
        </div>
      ) : null}
        </div>
      ) : null}
    </div>
  );
}
