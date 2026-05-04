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
const ZONE_MS = 1800;
const TOTAL_MS = TRAVEL_MS + ZONE_MS;
const GAME_MS = 60_000;
const HEAT_THRESHOLD = 3;
const HIT_MS = 300;
const MISS_MS = 700;
const WRONG_DEBOUNCE_MS = 900;
const HEARD_STICKY_MS = 450;
const AUTO_SKIP_MISSES = 3;

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
}

type BlockPhase = "approaching" | "hit" | "miss";
type HeatState = "off" | "heating";

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

function scoreForHit(hitStreakAfterHit: number): number {
  return hitStreakAfterHit >= HEAT_THRESHOLD ? 20 : 10;
}

function debugPronunciationHit(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.debug("[PG-HIT]", payload);
}

export function PronunciationGameCanvas({
  words,
  interimTranscript,
  sendMessage,
  backgroundImageUrl: _backgroundImageUrl,
  accentColor: _accentColor,
  onComplete,
}: PronunciationGameCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const blockWrapRef = useRef<HTMLDivElement>(null);
  const particlesRefData = useRef<Particle[]>([]);
  const rafParticlesRef = useRef(0);
  const completeSentRef = useRef(false);
  const prevWordIndexRef = useRef(0);
  const wordIndexRef = useRef(0);
  const blockPhaseRef = useRef<BlockPhase>("approaching");
  const cycleStartRef = useRef(0);
  const timeoutArmedRef = useRef(true);
  const wrongTimerRef = useRef<number | null>(null);
  const heardClearTimeoutRef = useRef<number | null>(null);
  const interimRef = useRef(interimTranscript);
  const missesForWordRef = useRef(0);
  const hitsRef = useRef(0);
  const wordsAttemptedRef = useRef(0);
  const xpRef = useRef(0);
  const flaggedWordsRef = useRef<string[]>([]);

  const [cameraOk, setCameraOk] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  const [blockPhase, setBlockPhaseState] =
    useState<BlockPhase>("approaching");
  const [showWrongBadge, setShowWrongBadge] = useState(false);
  const [showHitBadge, setShowHitBadge] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hits, setHits] = useState(0);
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hitStreak, setHitStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [heatState, setHeatState] = useState<HeatState>("off");
  const [cooledDownStamp, setCooledDownStamp] = useState(false);
  const [heardTranscript, setHeardTranscript] = useState("");

  const { wordIndex, flaggedWords, isComplete, handleSkipWord } =
    useKaraokeReading({
      words,
      interimTranscript,
      sendMessage,
      mode: "sequential",
    });

  const setBlockPhase = useCallback((phase: BlockPhase) => {
    blockPhaseRef.current = phase;
    setBlockPhaseState(phase);
  }, []);

  useEffect(() => {
    interimRef.current = interimTranscript;
    const trimmed = interimTranscript.trim();
    if (trimmed) {
      if (heardClearTimeoutRef.current !== null) {
        window.clearTimeout(heardClearTimeoutRef.current);
        heardClearTimeoutRef.current = null;
      }
      setHeardTranscript(trimmed);
      return;
    }
    if (heardClearTimeoutRef.current !== null) {
      window.clearTimeout(heardClearTimeoutRef.current);
    }
    heardClearTimeoutRef.current = window.setTimeout(() => {
      heardClearTimeoutRef.current = null;
      setHeardTranscript("");
    }, HEARD_STICKY_MS);
  }, [interimTranscript]);

  useEffect(() => {
    wordIndexRef.current = wordIndex;
    hitsRef.current = hits;
    wordsAttemptedRef.current = wordsAttempted;
    xpRef.current = xp;
    flaggedWordsRef.current = flaggedWords;
  }, [wordIndex, hits, wordsAttempted, xp, flaggedWords]);

  const expectedWord =
    wordIndex < words.length ? (words[wordIndex] ?? "") : "";
  const heard = heardTranscript.split(/\s+/).filter(Boolean).pop() || "—";
  const listening =
    !ended && !isComplete && wordIndex < words.length && cameraOk;

  const clearWrongTimer = useCallback(() => {
    if (wrongTimerRef.current !== null) {
      window.clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
  }, []);

  const burst = useCallback((x: number, y: number, heat: HeatState) => {
    const colors =
      heat === "heating"
        ? ["#f97316", "#fb923c", "#fbbf24", "#fff7ed"]
        : ["#4ade80", "#86efac", "#bbf7d0", "#ffffff"];
    for (let i = 0; i < 48; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5;
      particlesRefData.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff",
        life: 0.5 + Math.random() * 0.35,
        maxLife: 0.85,
      });
    }
  }, []);

  const coolDown = useCallback(() => {
    if (heatState === "off") return;
    setHeatState("off");
    setCooledDownStamp(true);
    window.setTimeout(() => setCooledDownStamp(false), 800);
  }, [heatState]);

  const markMiss = useCallback(
    (reason: "wrong_word" | "timeout") => {
      if (blockPhaseRef.current !== "approaching" || ended || isComplete) {
        return;
      }
      if (!timeoutArmedRef.current) return;
      timeoutArmedRef.current = false;
      clearWrongTimer();
      missesForWordRef.current += 1;
      const currentWord = words[wordIndexRef.current] ?? "";
      if (currentWord) {
        flaggedWordsRef.current = Array.from(
          new Set([...flaggedWordsRef.current, currentWord.toLowerCase().trim()]),
        ).filter(Boolean);
      }
      debugPronunciationHit({
        event: "miss",
        reason,
        wordIndex: wordIndexRef.current,
        word: currentWord,
      });
      setShowWrongBadge(true);
      setBlockPhase("miss");
      setWordsAttempted((w) => w + 1);
      setStreak(0);
      setHitStreak(0);
      coolDown();
      window.setTimeout(() => {
        setShowWrongBadge(false);
        if (missesForWordRef.current >= AUTO_SKIP_MISSES) {
          handleSkipWord(wordIndexRef.current);
          missesForWordRef.current = 0;
          return;
        }
        setCycleKey((k) => k + 1);
        cycleStartRef.current = performance.now();
        timeoutArmedRef.current = true;
        setBlockPhase("approaching");
      }, MISS_MS);
    },
    [
      clearWrongTimer,
      coolDown,
      ended,
      handleSkipWord,
      isComplete,
      setBlockPhase,
      words,
    ],
  );

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
    prevWordIndexRef.current = 0;
    wordIndexRef.current = 0;
    missesForWordRef.current = 0;
    cycleStartRef.current = performance.now();
    timeoutArmedRef.current = true;
    completeSentRef.current = false;
    clearWrongTimer();
    queueMicrotask(() => {
      setCycleKey((k) => k + 1);
      setBlockPhase("approaching");
      setShowWrongBadge(false);
      setShowHitBadge(false);
      setHits(0);
      setWordsAttempted(0);
      setXp(0);
      setStreak(0);
      setHitStreak(0);
      setBestStreak(0);
      setHeatState("off");
      setCooledDownStamp(false);
      setEnded(false);
    });
  }, [words, clearWrongTimer, setBlockPhase]);

  useEffect(() => {
    if (ended) return;
    const endId = window.setTimeout(() => setEnded(true), GAME_MS);
    return () => window.clearTimeout(endId);
  }, [ended]);

  useEffect(() => {
    if (!isComplete || ended) return;
    queueMicrotask(() => setEnded(true));
  }, [isComplete, ended]);

  useEffect(() => {
    if (!ended || completeSentRef.current) return;
    completeSentRef.current = true;
    const wa = wordsAttemptedRef.current;
    const h = hitsRef.current;
    const accuracy = wa > 0 ? h / wa : 0;
    onComplete?.({
      wordsHit: h,
      wordsAttempted: wa,
      accuracy,
      flaggedWords: [...flaggedWordsRef.current],
      xpEarned: xpRef.current,
    });
  }, [ended, onComplete]);

  useEffect(() => {
    if (blockPhase !== "approaching" || ended || isComplete) return;
    cycleStartRef.current = performance.now();
    timeoutArmedRef.current = true;
    const id = window.setInterval(() => {
      if (!timeoutArmedRef.current) return;
      if (performance.now() - cycleStartRef.current >= TOTAL_MS) {
        markMiss("timeout");
      }
    }, 160);
    return () => window.clearInterval(id);
  }, [blockPhase, cycleKey, ended, isComplete, markMiss]);

  useEffect(() => {
    clearWrongTimer();
    if (blockPhase !== "approaching" || ended || isComplete) return;
    const last = interimTranscript.trim().split(/\s+/).filter(Boolean).pop() ?? "";
    if (last.length <= 2) return;
    const expected = words[wordIndex];
    if (!expected) return;
    if (classifyKaraokeWordMatch(last, expected) === "match") return;

    wrongTimerRef.current = window.setTimeout(() => {
      wrongTimerRef.current = null;
      if (blockPhaseRef.current !== "approaching") return;
      const latest =
        interimRef.current.trim().split(/\s+/).filter(Boolean).pop() ?? "";
      if (latest.length <= 3) return;
      const currentExpected = words[wordIndexRef.current];
      if (!currentExpected) return;
      if (classifyKaraokeWordMatch(latest, currentExpected) === "match") {
        return;
      }
      markMiss("wrong_word");
    }, WRONG_DEBOUNCE_MS);
    return clearWrongTimer;
  }, [
    blockPhase,
    clearWrongTimer,
    ended,
    interimTranscript,
    isComplete,
    markMiss,
    wordIndex,
    words,
  ]);

  useEffect(() => {
    if (wordIndex <= prevWordIndexRef.current) return;
    if (ended) return;
    clearWrongTimer();
    missesForWordRef.current = 0;
    prevWordIndexRef.current = wordIndex;
    timeoutArmedRef.current = false;
    const advancedTo = wordIndex;
    debugPronunciationHit({
      event: "accept",
      wordIndex: advancedTo - 1,
      word: words[advancedTo - 1] ?? "",
    });
    queueMicrotask(() => {
      setShowHitBadge(true);
      setBlockPhase("hit");
      setHits((h) => h + 1);
      setWordsAttempted((wa) => wa + 1);
      setStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => (ns > b ? ns : b));
        setHitStreak((hs) => {
          const nhs = hs + 1;
          setXp((x) => x + scoreForHit(nhs));
          if (nhs >= HEAT_THRESHOLD) setHeatState("heating");
          return nhs;
        });
        return ns;
      });
    });
    requestAnimationFrame(() => {
      const el = blockWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, heatState);
    });
    window.setTimeout(() => {
      setShowHitBadge(false);
      if (advancedTo >= words.length) return;
      setCycleKey((k) => k + 1);
      cycleStartRef.current = performance.now();
      timeoutArmedRef.current = true;
      setBlockPhase("approaching");
    }, HIT_MS);
  }, [wordIndex, words, ended, burst, clearWrongTimer, heatState, setBlockPhase]);

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
      const arr = particlesRefData.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i]!;
        p.life -= 1 / 60;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        if (p.life <= 0) {
          arr.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
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

  useEffect(() => {
    return () => {
      clearWrongTimer();
      if (heardClearTimeoutRef.current !== null) {
        window.clearTimeout(heardClearTimeoutRef.current);
      }
    };
  }, [clearWrongTimer]);

  const blockAnim =
    blockPhase === "approaching"
      ? `pg-approach ${TRAVEL_MS}ms linear forwards`
      : blockPhase === "hit"
        ? `pg-hit-pass ${HIT_MS}ms ease-out forwards`
        : `pg-miss-shatter ${MISS_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards`;

  const css = `
    @keyframes pg-approach {
      0% { transform: translate(-50%, -62%) scale(0.36); opacity: 0.62; }
      72% { transform: translate(-50%, -54%) scale(1.18); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.42); opacity: 1; }
    }
    @keyframes pg-ring-expand {
      0% { width: 30px; height: 30px; opacity: 1; border-width: 4px; }
      100% { width: 280px; height: 280px; opacity: 0; border-width: 1px; }
    }
    @keyframes pg-xp-float {
      0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
      30% { transform: translate(-50%, -82%) scale(1.4); opacity: 1; }
      100% { transform: translate(-50%, -165%) scale(0.8); opacity: 0; }
    }
    @keyframes pg-hit-pass {
      0% { transform: translate(-50%, -50%) scale(1.42); }
      50% { transform: translate(-50%, -50%) scale(2); filter: brightness(1.8); }
      100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
    }
    @keyframes pg-miss-shatter {
      0%, 5%, 15%, 25% { transform: translate(-50%, -50%) scale(1.42); }
      10% { transform: translate(calc(-50% + 8px), -50%) scale(1.42); filter: brightness(2) hue-rotate(-40deg); }
      20% { transform: translate(calc(-50% - 8px), -50%) scale(1.42); }
      100% { transform: translate(-50%, -52%) scale(0.34) rotate(12deg); opacity: 0; filter: grayscale(1); }
    }
    @keyframes pg-miss-stamp {
      0% { transform: translate(-50%, -50%) rotate(4deg) scale(0); }
      50% { transform: translate(-50%, -50%) rotate(4deg) scale(1.25); opacity: 1; }
      100% { transform: translate(-50%, -50%) rotate(4deg) scale(1); opacity: 0.85; }
    }
    @keyframes pg-heat-banner-in {
      from { transform: translateY(-120%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes pg-cooled {
      0% { transform: translate(-50%, -50%) scale(0.4) rotate(-5deg); opacity: 0; }
      35% { transform: translate(-50%, -50%) scale(1.1) rotate(-5deg); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(0.8) rotate(-5deg); opacity: 0; }
    }
    @keyframes pg-mic-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.75); }
    }
  `;

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
            "radial-gradient(ellipse at center, #111827 0%, #05070c 74%)",
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
          zIndex: 1,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          transform: "scaleX(-1)",
          background: "transparent",
          display: cameraOk ? "block" : "none",
        }}
      />
      {heatState === "heating" ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at center, rgba(255, 120, 40, 0.2), rgba(255, 120, 40, 0.02) 55%, transparent 75%)",
          }}
        />
      ) : null}
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "18%",
          bottom: "14%",
          width: 2,
          transform: "translateX(-50%)",
          zIndex: 2,
          background:
            "linear-gradient(to bottom, transparent, rgba(255,255,255,0.08), transparent)",
          pointerEvents: "none",
        }}
      />

      {!ended && !isComplete && expectedWord ? (
        <div
          key={`${cycleKey}-${wordIndex}`}
          ref={blockWrapRef}
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            zIndex: 3,
            pointerEvents: "none",
            animation: blockAnim,
            willChange: "transform, opacity",
          }}
        >
          <div
            style={{
              position: "relative",
              minWidth: 280,
              padding: "24px 48px",
              borderRadius: 22,
              border: "3px solid rgba(255,255,255,0.56)",
              background:
                heatState === "heating"
                  ? "linear-gradient(135deg, #f97316, #fbbf24)"
                  : "linear-gradient(135deg, #6D5EF5, #a78bfa)",
              boxShadow:
                heatState === "heating"
                  ? "0 0 70px rgba(251, 146, 60, 0.78)"
                  : "0 0 62px rgba(109,94,245,0.62)",
              color: "white",
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              textAlign: "center",
              textShadow: "0 2px 8px rgba(0,0,0,0.36)",
              userSelect: "none",
              zIndex: 2,
            }}
          >
            {expectedWord}
          </div>

          {showHitBadge
            ? [0, 100, 200].map((delay, i) => (
                <div
                  key={delay}
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
              ))
            : null}

          {showHitBadge ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                fontFamily: "'Fredoka', sans-serif",
                fontWeight: 900,
                fontSize: 30,
                color: "#fbbf24",
                textShadow: "0 0 12px #fbbf24",
                animation: "pg-xp-float 900ms ease-out both",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 3,
              }}
            >
              +{scoreForHit(hitStreak)} XP
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
                fontSize: 54,
                color: "#FFF4E2",
                WebkitTextStroke: "3px #000",
                textShadow: "3px 3px 0 #6366f1, 4px 4px 0 #3730a3",
                animation:
                  "pg-miss-stamp 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
                animationDelay: "80ms",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 20,
              }}
            >
              ✕ MISS!
            </div>
          ) : null}
        </div>
      ) : null}

      <canvas
        ref={particlesRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 4,
          pointerEvents: "none",
        }}
      />

      {heatState === "heating" ? (
        <div
          style={{
            position: "fixed",
            top: 42,
            left: 0,
            right: 0,
            zIndex: 6,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: 52,
              fontWeight: 700,
              color: "#fbbf24",
              textShadow: "0 2px 14px rgba(0,0,0,0.58)",
              animation:
                "pg-heat-banner-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            HEATING UP
          </div>
        </div>
      ) : null}

      {cooledDownStamp ? (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            zIndex: 7,
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 34,
            fontWeight: 900,
            color: "#dbeafe",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            animation: "pg-cooled 800ms ease-out both",
            pointerEvents: "none",
          }}
        >
          COOLED DOWN
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
            top: 20,
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
            top: 20,
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
          FIRE {hitStreak}
        </div>
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 104,
            padding: "10px 18px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(52, 211, 153, 0.75), rgba(16, 185, 129, 0.85))",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            pointerEvents: "auto",
          }}
        >
          STREAK {streak}
        </div>
        <div
          style={{
            position: "absolute",
            top: 20,
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
          XP {xp}
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
              ? "amazing!"
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
        </div>
      ) : null}
    </div>
  );
}
