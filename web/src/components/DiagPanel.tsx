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

const READING_TEST_EXCERPT =
  "Chimpanzees are apes. They inhabit steamy rainforests and other parts of Africa. Chimps gather in bands that number from 15 to 150 chimps.";

async function postTestReadingMode(): Promise<void> {
  const res = await fetch("/api/map/test-reading-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      childId: "creator",
      text: READING_TEST_EXCERPT,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(" 🎮 [DiagPanel] test-reading-mode failed", res.status, err);
  }
}

async function postTestPronunciationMode(): Promise<void> {
  const res = await fetch("/api/map/test-pronunciation-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childId: "creator" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(
      " 🎮 [DiagPanel] test-pronunciation-mode failed",
      res.status,
      err,
    );
  }
}

let diagReadingAutoVoicePrimed = false;

export function DiagPanel({
  startSession,
  endSession,
  voiceActive,
  onCameraAct,
}: DiagPanelProps) {
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;

  useEffect(() => {
    if (import.meta.env.VITE_DIAG_READING !== "true") return;
    if (voiceActive) return;
    if (diagReadingAutoVoicePrimed) return;
    diagReadingAutoVoicePrimed = true;
    startSessionRef.current(DIAG_CHILD, {
      diagKiosk: true,
      silentTts: import.meta.env.VITE_DIAG_READING === "true",
      sttOnly: import.meta.env.VITE_DIAG_READING === "true",
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
  }, [voiceActive]);

  const [emote, setEmote] = useState<CompanionEmote>("neutral");
  const [intensity, setIntensity] = useState(0.8);
  const [animation, setAnimation] = useState<string>(COMPANION_ANIMATION_IDS[0]!);

  const toggleVoice = useCallback(() => {
    if (voiceActive) {
      endSession();
    } else {
      startSession(DIAG_CHILD, {
        diagKiosk: true,
        silentTts: import.meta.env.VITE_DIAG_READING === "true",
        sttOnly: import.meta.env.VITE_DIAG_READING === "true",
      });
    }
  }, [voiceActive, startSession, endSession]);

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

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-4 z-[20] max-w-[280px] rounded-lg border border-white/20 bg-zinc-900/95 p-3 text-left text-xs text-zinc-100 shadow-lg"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="mb-3 border-b border-white/10 pb-2 font-semibold text-white/90">
        Diag
      </div>

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
          onClick={() => {
            void postTestReadingMode();
          }}
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
          onClick={() => {
            void postTestPronunciationMode();
          }}
        >
          Test Pronunciation
        </button>
      </section>

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
    </div>
  );
}
