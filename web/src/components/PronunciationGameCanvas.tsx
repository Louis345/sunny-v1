import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { classifyKaraokeWordMatch } from "../../../src/shared/karaokeMatchWord";
import { useKaraokeReading } from "../hooks/useKaraokeReading";

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@700;800;900&family=Lexend:wght@400;600&family=Caveat:wght@700&display=swap";

const TRAVEL_MS = 3000;
const ZONE_MS = 2000;
const TOTAL_MS = TRAVEL_MS + ZONE_MS;
const GAME_MS = 60_000;
const HEAT_THRESHOLD = 3;
const HIT_MS = 300;
const YANK_OUT_MS = 300;
const YANK_BACK_MS = 400;
const WRONG_DEBOUNCE_MS = 1200;

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    const Ctor =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (Ctor) _audioCtx = new Ctor();
  }
  return _audioCtx;
}

function playHitChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  (
    [
      [523.25, 0],
      [659.25, 0.015],
      [783.99, 0.03],
    ] as const
  ).forEach(([freq, delay]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now + delay);
    g.gain.linearRampToValueAtTime(0.18, now + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(now + delay);
    o.stop(now + delay + 0.6);
  });
}

function playMissBuzz(missCountForWord: number) {
  if (missCountForWord > 1) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(220, now);
  o.frequency.exponentialRampToValueAtTime(110, now + 0.25);
  g.gain.setValueAtTime(0.15, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + 0.3);
}

export type PronunciationCompleteResult = {
  wordsHit: number;
  wordsAttempted: number;
  accuracy: number;
  flaggedWords: string[];
  xpEarned: number;
};

export interface PronunciationGameCanvasProps {
  words: string[];
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  backgroundImageUrl?: string;
  accentColor?: string;
  onComplete?: (result: PronunciationCompleteResult) => void;
  /** Extra top padding (px) to clear a fixed banner above the component. */
  topInset?: number;
}

type BlockPhase = "approaching" | "hit" | "miss";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
};

function streakMultiplier(streak: number): number {
  if (streak >= 10) return 2.0;
  if (streak >= 5) return 1.5;
  return 1.0;
}

function scoreForHit(hitStreakAfterHit: number, displayStreak: number): number {
  const mult =
    hitStreakAfterHit >= HEAT_THRESHOLD ? 2.0 : streakMultiplier(displayStreak);
  return Math.round(10 * mult);
}

export function PronunciationGameCanvas({
  words,
  interimTranscript,
  sendMessage,
  backgroundImageUrl: _backgroundImageUrl, // eslint-disable-line @typescript-eslint/no-unused-vars
  accentColor: _accentColor, // eslint-disable-line @typescript-eslint/no-unused-vars
  onComplete,
  topInset = 0,
}: PronunciationGameCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const particlesDataRef = useRef<Particle[]>([]);
  const rafParticlesRef = useRef(0);
  const blockWrapRef = useRef<HTMLDivElement>(null);

  const completeSentRef = useRef(false);
  const prevWordIndexRef = useRef(-1);
  const cycleStartRef = useRef(0);
  const wrongTimerRef = useRef<number | null>(null);
  const lastHitInterimRef = useRef("");
  const hitCooldownUntilRef = useRef(0);
  const timeoutIntervalRef = useRef<number | null>(null);
  const hitProcessedForWordIndexRef = useRef(-1);
  const missSeqRef = useRef(0);
  const timeoutArmedRef = useRef(true);
  const interimRef = useRef(interimTranscript);
  const wordIndexRef = useRef(0);
  const hitsRef = useRef(0);
  const wordsAttemptedRef = useRef(0);
  const xpRef = useRef(0);
  const flaggedWordsRef = useRef<string[]>([]);
  const missCountByWordRef = useRef<Map<string, number>>(new Map());

  const [cameraOk, setCameraOk] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  const [blockPhase, setBlockPhase] = useState<BlockPhase>("approaching");
  const [missSeq, setMissSeq] = useState(0);
  const [showWrongBadge, setShowWrongBadge] = useState(false);
  const [showHitBadge, setShowHitBadge] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hits, setHits] = useState(0);
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hitStreak, setHitStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [heatBanner, setHeatBanner] = useState<"off" | "heating">("off");

  const {
    wordIndex,
    flaggedWords,
    isComplete,
  } = useKaraokeReading({
    words,
    interimTranscript,
    sendMessage,
    mode: "sequential",
  });

  useEffect(() => {
    interimRef.current = interimTranscript;
  });
  useEffect(() => {
    wordIndexRef.current = wordIndex;
  });
  useEffect(() => {
    hitsRef.current = hits;
    wordsAttemptedRef.current = wordsAttempted;
    xpRef.current = xp;
    flaggedWordsRef.current = flaggedWords;
  });

  const expectedWord =
    wordIndex < words.length ? (words[wordIndex] ?? "") : "";
  const heard =
    interimTranscript.trim().split(/\s+/).pop() || "—";

  const burst = useCallback((x: number, y: number) => {
    const colors = ["#4ade80", "#86efac", "#bbf7d0", "#fff"];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particlesDataRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff",
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.75,
      });
    }
  }, []);

  useEffect(() => {
    const elId = "pronunciation-game-fonts";
    if (!document.getElementById(elId)) {
      const link = document.createElement("link");
      link.id = elId;
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
        setCameraOk(true);
      } catch {
        setCameraOk(false);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useLayoutEffect(() => {
    if (!hasStarted) return;
    prevWordIndexRef.current = -1;
    hitProcessedForWordIndexRef.current = -1;
    cycleStartRef.current = performance.now();
    timeoutArmedRef.current = true;
    queueMicrotask(() => {
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setHits(0);
      setWordsAttempted(0);
      setXp(0);
      setStreak(0);
      setHitStreak(0);
      setBestStreak(0);
      setHeatBanner("off");
      completeSentRef.current = false;
      setEnded(false);
      missCountByWordRef.current = new Map();
    });
  }, [words, hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    if (ended) return;
    const endId = window.setTimeout(() => setEnded(true), GAME_MS);
    return () => window.clearTimeout(endId);
  }, [hasStarted, ended]);

  const finalizeOnce = useCallback(() => {
    if (completeSentRef.current) return;
    completeSentRef.current = true;
    const h = hitsRef.current;
    const wa = wordsAttemptedRef.current;
    const x = xpRef.current;
    const fw = flaggedWordsRef.current;
    const acc = wa > 0 ? Math.round((h / wa) * 100) : 0;
    onComplete?.({
      wordsHit: h,
      wordsAttempted: wa,
      accuracy: acc,
      flaggedWords: [...fw],
      xpEarned: x,
    });
  }, [onComplete]);

  useEffect(() => {
    if (!ended) return;
    finalizeOnce();
  }, [ended, finalizeOnce]);

  useEffect(() => {
    if (!isComplete || ended) return;
    queueMicrotask(() => setEnded(true));
  }, [isComplete, ended]);

  const triggerMissYank = useCallback(() => {
    console.log(
      "[PG] MISS YANK | word:",
      words[wordIndexRef.current],
      "| blockPhase:",
      blockPhase,
      "| timeoutArmed:",
      timeoutArmedRef.current,
    );
    if (blockPhase !== "approaching" || ended || isComplete) return;
    if (!timeoutArmedRef.current) return;
    timeoutArmedRef.current = false;
    const w = words[wordIndexRef.current] ?? "";
    const prev = missCountByWordRef.current.get(w) ?? 0;
    const newCount = prev + 1;
    missCountByWordRef.current.set(w, newCount);
    playMissBuzz(newCount);
    const seq = (missSeqRef.current += 1);
    setMissSeq(seq);
    setShowWrongBadge(true);
    setBlockPhase("miss");
    setWordsAttempted((w) => w + 1);
    setStreak(0);
    setHitStreak(0);
    setHeatBanner("off");
    window.setTimeout(() => {
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setShowWrongBadge(false);
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
    }, YANK_OUT_MS + YANK_BACK_MS);
  }, [blockPhase, ended, isComplete, words]);

  useEffect(() => {
    if (blockPhase !== "approaching" || ended || isComplete) return;
    cycleStartRef.current = performance.now();
    timeoutArmedRef.current = true;
    timeoutIntervalRef.current = window.setInterval(() => {
      if (!timeoutArmedRef.current) return;
      if (performance.now() - cycleStartRef.current >= TOTAL_MS) {
        console.log(
          "[PG] TIMEOUT | elapsed:",
          performance.now() - cycleStartRef.current,
          "| word:",
          words[wordIndexRef.current],
        );
        triggerMissYank();
      }
    }, 200);
    return () => {
      if (timeoutIntervalRef.current !== null) {
        clearInterval(timeoutIntervalRef.current);
        timeoutIntervalRef.current = null;
      }
    };
  }, [blockPhase, cycleKey, ended, isComplete, triggerMissYank, words]);

  useEffect(() => {
    if (wrongTimerRef.current) {
      clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    if (blockPhase !== "approaching" || ended || isComplete) return;
    const t = interimTranscript.trim();
    const last = t.split(/\s+/).filter(Boolean).pop() ?? "";
    console.log(
      "[PG] interim changed | heard:",
      last,
      "| expected:",
      words[wordIndex],
      "| blockPhase:",
      blockPhase,
      "| debounce length check:",
      last.length,
    );
    if (last.length <= 2) return;
    const w = words[wordIndex];
    if (!w) return;
    if (classifyKaraokeWordMatch(last, w) === "match") return;

    if (performance.now() < hitCooldownUntilRef.current) return;

    wrongTimerRef.current = window.setTimeout(() => {
      wrongTimerRef.current = null;
      if (performance.now() < hitCooldownUntilRef.current) return;
      const t2 = interimRef.current.trim();
      const last2 = t2.split(/\s+/).filter(Boolean).pop() ?? "";
      if (last2.length <= 3) return;
      const wi = wordIndexRef.current;
      const w2 = words[wi];
      if (!w2) return;
      const result2 = classifyKaraokeWordMatch(last2, w2);
      if (result2 === "match" || result2 === "partial") return;
      // If the interim hasn't changed since the last hit, it's stale — ignore
      if (last2 === lastHitInterimRef.current) return;
      console.log(
        "[PG] DEBOUNCE FIRED | heard2:",
        last2,
        "| expected:",
        words[wordIndexRef.current],
        "| match result:",
        classifyKaraokeWordMatch(
          last2,
          words[wordIndexRef.current] ?? "",
        ),
      );
      triggerMissYank();
    }, WRONG_DEBOUNCE_MS);
    return () => {
      if (wrongTimerRef.current) {
        clearTimeout(wrongTimerRef.current);
        wrongTimerRef.current = null;
      }
    };
  }, [
    interimTranscript,
    blockPhase,
    wordIndex,
    words,
    ended,
    isComplete,
    triggerMissYank,
  ]);

  useEffect(() => {
    // SYNCHRONOUS guards — must run before any async work
    if (ended) return;
    // prev starts at -1; `0 <= -1` is false in JS, so block mount-only wordIndex 0 explicitly
    if (wordIndex === 0 && prevWordIndexRef.current < 0) return;
    if (wordIndex <= prevWordIndexRef.current) return;
    if (hitProcessedForWordIndexRef.current === wordIndex) return;
    prevWordIndexRef.current = wordIndex;
    hitProcessedForWordIndexRef.current = wordIndex;

    console.log(
      "[PG] HIT | wordIndex advanced to:",
      wordIndex,
      "| word was:",
      words[wordIndex - 1],
      "| blockPhase:",
      blockPhase,
    );
    if (timeoutIntervalRef.current !== null) {
      clearInterval(timeoutIntervalRef.current);
      timeoutIntervalRef.current = null;
    }
    timeoutArmedRef.current = false;
    const advancedTo = wordIndex;
    // Clear the wrong-word debounce timer immediately on hit
    if (wrongTimerRef.current) {
      clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    hitCooldownUntilRef.current = performance.now() + 1500;
    // Record the interim at hit time so debounce can ignore stale values
    lastHitInterimRef.current = interimRef.current.trim();
    queueMicrotask(() => {
      playHitChime();
      setShowHitBadge(true);
      setBlockPhase("hit");
      setHits((h) => h + 1);
      setWordsAttempted((wa) => wa + 1);
      setStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => (ns > b ? ns : b));
        setHitStreak((hs) => {
          const nhs = hs + 1;
          setXp((x) => x + scoreForHit(nhs, ns));
          if (nhs >= HEAT_THRESHOLD) setHeatBanner("heating");
          return nhs;
        });
        return ns;
      });
    });
    requestAnimationFrame(() => {
      const el = blockWrapRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
    window.setTimeout(() => {
      setShowHitBadge(false);
      if (advancedTo >= words.length) return;
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
    }, HIT_MS);
    // Diagnostic log reads words/blockPhase; effect timing unchanged from pre-log version.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- PG diagnostics only
  }, [wordIndex, words.length, ended, burst]);

  useEffect(() => {
    const c = particlesRef.current;
    if (!c) return;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const tick = () => {
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const arr = particlesDataRef.current;
      const dt = 1 / 60;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i]!;
        p.life -= dt;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        if (p.life <= 0) {
          arr.splice(i, 1);
          continue;
        }
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafParticlesRef.current = requestAnimationFrame(tick);
    };
    rafParticlesRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafParticlesRef.current);
    };
  }, []);

  const listening =
    !ended && !isComplete && wordIndex < words.length && cameraOk;

  const css = `
    @keyframes pg-approach {
      from { transform: translateX(-50%) translateY(-50%) scale(0.3); opacity: 0.6; }
      to { transform: translateX(-50%) translateY(-50%) scale(1.4); opacity: 1; }
    }
    /* SHOCKWAVE HIT */
    @keyframes pg-ring-expand {
      0%   { width: 30px; height: 30px; opacity: 1; border-width: 4px; }
      100% { width: 280px; height: 280px; opacity: 0; border-width: 1px; }
    }
    @keyframes pg-xp-float {
      0%   { transform: translate(-50%, -50%) scale(0); opacity: 1; }
      30%  { transform: translate(-50%, -80%) scale(1.4); opacity: 1; }
      100% { transform: translate(-50%, -160%) scale(0.8); opacity: 0; }
    }
    @keyframes pg-hit-pass {
      0%   { transform: translateX(-50%) translateY(-50%) scale(1.4); }
      50%  { transform: translateX(-50%) translateY(-50%) scale(2);
             filter: brightness(1.8); }
      100% { transform: translateX(-50%) translateY(-50%) scale(3); opacity: 0; }
    }
    /* COMIC MISS */
    @keyframes pg-miss-shatter {
      0%,5%,15%,25% { transform: translateX(-50%) translateY(-50%) scale(1.4); }
      10%  { transform: translate(calc(-50% + 6px), -50%) scale(1.4);
             filter: brightness(2) hue-rotate(-40deg); }
      20%  { transform: translate(calc(-50% - 6px), -50%) scale(1.4); }
      100% { transform: translateX(-50%) translateY(-50%) scale(0.3) rotate(12deg);
             opacity: 0; filter: grayscale(1); }
    }
    @keyframes pg-miss-stamp {
      0%   { transform: translate(-50%, -50%) rotate(4deg) scale(0); }
      50%  { transform: translate(-50%, -50%) rotate(4deg) scale(1.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) rotate(4deg) scale(1); opacity: 0.85; }
    }
    @keyframes pg-heat-banner-in {
      from { transform: translateY(-120%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes pg-mic-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.75); }
    }
  `;

  const blockAnim =
    blockPhase === "approaching"
      ? `pg-approach ${TRAVEL_MS}ms linear forwards`
      : blockPhase === "hit"
        ? `pg-hit-pass ${HIT_MS}ms ease-out forwards`
        : `pg-miss-shatter ${YANK_OUT_MS + YANK_BACK_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards`;

  if (!hasStarted) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, #0e172a 0%, #05070c 75%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Lexend', system-ui, sans-serif",
          color: "white",
          gap: 32,
          paddingTop: topInset,
        }}
      >
        <style>{css}</style>
        <div
          style={{
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 40,
            fontWeight: 800,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          Say each word aloud
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
            maxWidth: 480,
          }}
        >
          {words.map((w) => (
            <span
              key={w}
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(109,94,245,0.25)",
                border: "1px solid rgba(109,94,245,0.5)",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {w}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setHasStarted(true)}
          style={{
            marginTop: 8,
            padding: "18px 52px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #6D5EF5, #a78bfa)",
            border: "none",
            color: "white",
            fontSize: 22,
            fontFamily: "'Fredoka', sans-serif",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(109,94,245,0.5)",
            letterSpacing: "0.02em",
          }}
        >
          Let's Go!
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#05070c",
        fontFamily: "'Lexend', system-ui, sans-serif",
        color: "white",
      }}
    >
      <style>{css}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse at center, #0e172a 0%, #05070c 75%)",
          display: cameraOk ? "none" : "block",
        }}
      />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 1,
        }}
      />

      {heatBanner === "heating" ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
            boxShadow: "inset 0 0 120px rgba(255, 120, 40, 0.2)",
          }}
        />
      ) : null}

      <div
        key={`${cycleKey}-${wordIndex}-${missSeq}`}
        ref={blockWrapRef}
        style={{
          position: "fixed",
          left: "50%",
          top: "42%",
          transform: "translateX(-50%) translateY(-50%)",
          zIndex: 3,
          pointerEvents: "none",
          animation: blockAnim,
          willChange: "transform, opacity",
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: 20,
            padding: "24px 48px",
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            color: "white",
            textAlign: "center",
            minWidth: 280,
            background: "linear-gradient(135deg, #6D5EF5, #a78bfa)",
            border: "3px solid rgba(255,255,255,0.5)",
            boxShadow: "0 0 60px rgba(109,94,245,0.6)",
            textShadow: "0 2px 8px rgba(0,0,0,0.35)",
            userSelect: "none",
            zIndex: 2,
          }}
        >
          <span style={{ position: "relative", zIndex: 1 }}>
            {expectedWord || "—"}
          </span>
        </div>

        {showHitBadge &&
          [0, 100, 200].map((delay, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                borderRadius: "50%",
                border: `3px solid ${
                  i === 0 ? "#fbbf24" : i === 1 ? "#f472b6" : "#22d3ee"
                }`,
                transform: "translate(-50%, -50%)",
                animation: `pg-ring-expand 700ms ease-out ${delay}ms both`,
                pointerEvents: "none",
                zIndex: 0,
                boxSizing: "border-box",
              }}
            />
          ))}

        {showHitBadge ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              fontFamily: "'Fredoka', sans-serif",
              fontWeight: 800,
              fontSize: 28,
              color: "#fbbf24",
              textShadow: "0 0 12px #fbbf24",
              animation: "pg-xp-float 900ms ease-out both",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 3,
            }}
          >
            +{scoreForHit(hitStreak, streak)} XP
          </div>
        ) : null}

        {showWrongBadge ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              fontFamily: "'Fredoka', sans-serif",
              fontWeight: 900,
              fontSize: 52,
              color: "#FFF4E2",
              WebkitTextStroke: "3px #000",
              textShadow: "3px 3px 0 #6366f1, 4px 4px 0 #3730a3",
              animation: `pg-miss-stamp ${YANK_OUT_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
              animationDelay: "80ms",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 20,
            }}
          >
            MISS!
          </div>
        ) : null}
      </div>

      <canvas
        ref={particlesRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 4,
          pointerEvents: "none",
        }}
      />

      {heatBanner === "heating" ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            paddingTop: Math.max(48, topInset + 8),
          }}
        >
          <div
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: 48,
              fontWeight: 700,
              color: "#fbbf24",
              textShadow: "0 2px 12px rgba(0,0,0,0.5)",
              animation:
                "pg-heat-banner-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            HEATING UP 🔥
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 20 + topInset,
            left: 20,
            padding: "10px 18px",
            borderRadius: 999,
            background: "rgba(10, 12, 18, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            fontSize: 15,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: listening ? "#10b981" : "#ef4444",
              boxShadow: listening ? "0 0 10px #10b981" : undefined,
              animation: listening ? "pg-mic-pulse 1.4s infinite" : undefined,
            }}
          />
          {listening ? "listening" : "waiting"}
        </div>
        <div
          style={{
            position: "absolute",
            top: 20 + topInset,
            right: 200,
            padding: "10px 18px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(251, 191, 36, 0.85), rgba(239, 68, 68, 0.85))",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          🔥 {hitStreak}
        </div>
        <div
          style={{
            position: "absolute",
            top: 20 + topInset,
            right: 20,
            padding: "10px 18px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(139, 92, 246, 0.85), rgba(109, 94, 245, 0.85))",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          ✨ {xp} XP
        </div>
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 22px",
            borderRadius: 14,
            background: "rgba(10, 12, 18, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            fontSize: 16,
            minWidth: 220,
            textAlign: "center",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            zIndex: 5,
            pointerEvents: "auto",
          }}
        >
          heard: <strong>{heard}</strong>
        </div>
      </div>

      {ended ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 40,
            background: "rgba(5, 7, 12, 0.55)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            pointerEvents: "auto",
          }}
        >
          <h1
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: 64,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {wordsAttempted > 0 && hits / wordsAttempted >= 0.7
              ? "🎉 amazing!"
              : "keep practicing!"}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 20,
              margin: "24px 0",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {[
              { v: hits, l: "words hit" },
              { v: xp, l: "xp earned" },
              { v: bestStreak, l: "best streak" },
            ].map((st) => (
              <div
                key={st.l}
                style={{
                  padding: "18px 28px",
                  borderRadius: 18,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  minWidth: 120,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Fredoka', sans-serif",
                    fontSize: 36,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {st.v}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.65,
                    marginTop: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {st.l}
                </div>
              </div>
            ))}
          </div>
          {flaggedWords.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 15, opacity: 0.7 }}>tap to hear</p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  maxWidth: 600,
                }}
              >
                {flaggedWords.map((word) => (
                  <button
                    key={word}
                    type="button"
                    style={{
                      padding: "8px 16px",
                      borderRadius: 999,
                      background: "rgba(239, 68, 68, 0.18)",
                      border: "1px solid rgba(239, 68, 68, 0.45)",
                      cursor: "pointer",
                      fontFamily: "'Fredoka', sans-serif",
                      fontSize: 15,
                      color: "white",
                    }}
                    onClick={() => {
                      const u = new SpeechSynthesisUtterance(word);
                      u.rate = 0.8;
                      speechSynthesis.speak(u);
                    }}
                  >
                    🔊 {word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
