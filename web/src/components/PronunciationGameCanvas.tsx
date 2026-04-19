import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKaraokeReading } from "../hooks/useKaraokeReading";

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@700&family=Lexend:wght@400;600&family=Caveat:wght@700&display=swap";

const PALETTE: [string, string][] = [
  ["#8b7cff", "#6D5EF5"],
  ["#f9a8d4", "#f472b6"],
  ["#22d3ee", "#06b6d4"],
  ["#34d399", "#10b981"],
  ["#fbbf24", "#f59e0b"],
  ["#a78bfa", "#8b5cf6"],
];

const BELT_MODE = "depth" as const;
const SPAWN_MS = 1400;
const TRAVEL_MS = 3800;
const GAME_MS = 60_000;
const MAX_ACTIVE = 3;

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

/** Port of pronunciation-game.html `beltPosition` (depth lane). */
export function beltPosition(
  t: number,
  mode: "depth" | "horizontal" = "depth",
): {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  inSayZone: boolean;
} {
  const clamped = Math.max(0, Math.min(1, t));

  if (mode === "depth") {
    const x = 50;
    const y = 30 + 40 * clamped;
    const scale = 0.35 + (1.15 - 0.35) * clamped;
    const opacity = Math.min(1.0, 0.5 + (0.5 * clamped) / 0.75);
    const inSayZone = y >= 55 && y <= 75;
    return { x, y, scale, opacity, inSayZone };
  }

  if (mode === "horizontal") {
    const x = 100 - 100 * clamped;
    const y = 50;
    let scale: number;
    if (clamped <= 0.5) {
      scale = 0.5 + (1.15 - 0.5) * (clamped / 0.5);
    } else {
      scale = 1.15 - (1.15 - 0.7) * ((clamped - 0.5) / 0.5);
    }
    const opacity = 1.0;
    const inSayZone = x >= 35 && x <= 65;
    return { x, y, scale, opacity, inSayZone };
  }

  throw new Error(`Unknown belt mode: ${mode}`);
}

function streakMultiplier(streak: number): number {
  if (streak >= 10) return 2.0;
  if (streak >= 5) return 1.5;
  return 1.0;
}

function scoreForHit(streak: number): number {
  return Math.round(10 * streakMultiplier(streak));
}

type BeltPill = {
  id: number;
  wordIndex: number;
  spawnedAt: number;
  travelMs: number;
  palette: [string, string];
  phase: "live" | "hit" | "miss";
};

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

export function PronunciationGameCanvas({
  words,
  interimTranscript,
  sendMessage,
  backgroundImageUrl: _backgroundImageUrl,
  accentColor: _accentColor,
  onComplete,
}: PronunciationGameCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const starsRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const beltRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const nextSpawnIdxRef = useRef(0);
  const particlesRefData = useRef<Particle[]>([]);
  const rafTickRef = useRef<number>(0);
  const rafParticlesRef = useRef<number>(0);
  const completeSentRef = useRef(false);
  const processedHitKeysRef = useRef<Set<string>>(new Set());
  const hitsRef = useRef(0);
  const wordsAttemptedRef = useRef(0);
  const xpRef = useRef(0);
  const flaggedWordsRef = useRef<string[]>([]);

  const [cameraOk, setCameraOk] = useState(false);
  const [pills, setPills] = useState<BeltPill[]>([]);
  const [nowTick, setNowTick] = useState(0);
  const [hits, setHits] = useState(0);
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [ended, setEnded] = useState(false);

  hitsRef.current = hits;
  wordsAttemptedRef.current = wordsAttempted;
  xpRef.current = xp;

  const activeWordIndices = useMemo(() => {
    const t = nowTick;
    const idxs: number[] = [];
    for (const p of pills) {
      if (p.phase !== "live") continue;
      const u = (t - p.spawnedAt) / Math.max(1, p.travelMs);
      const pos = beltPosition(Math.min(1, u), BELT_MODE);
      if (pos.inSayZone) idxs.push(p.wordIndex);
    }
    return idxs;
  }, [pills, nowTick]);

  const { hitWordIndex, flaggedWords } = useKaraokeReading({
    words,
    interimTranscript,
    sendMessage,
    mode: "multi",
    activeWordIndices,
  });
  flaggedWordsRef.current = flaggedWords;

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
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) return;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          setCameraOk(true);
        }
      } catch {
        setCameraOk(false);
      }
    })();
    return () => {
      cancelled = true;
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const burst = useCallback((x: number, y: number, colors: string[]) => {
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      particlesRefData.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff",
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
      });
    }
  }, []);

  useEffect(() => {
    const spawnId = window.setInterval(() => {
      setPills((prev) => {
        const active = prev.filter((p) => p.phase === "live");
        if (active.length >= MAX_ACTIVE || words.length === 0) return prev;
        const wi = nextSpawnIdxRef.current % words.length;
        nextSpawnIdxRef.current += 1;
        const pal = PALETTE[nextIdRef.current % PALETTE.length]!;
        const id = nextIdRef.current++;
        return [
          ...prev,
          {
            id,
            wordIndex: wi,
            spawnedAt: performance.now(),
            travelMs: TRAVEL_MS,
            palette: pal,
            phase: "live",
          },
        ];
      });
    }, SPAWN_MS);
    return () => window.clearInterval(spawnId);
  }, [words]);

  useEffect(() => {
    if (ended) return;
    const endId = window.setTimeout(() => setEnded(true), GAME_MS);
    return () => window.clearTimeout(endId);
  }, [ended]);

  useEffect(() => {
    if (hitWordIndex === null) {
      processedHitKeysRef.current.clear();
      return;
    }
    const t = performance.now();
    const match = pills.find(
      (p) =>
        p.phase === "live" &&
        p.wordIndex === hitWordIndex &&
        beltPosition(
          Math.min(1, (t - p.spawnedAt) / Math.max(1, p.travelMs)),
          BELT_MODE,
        ).inSayZone,
    );
    if (!match) return;
    const key = `${hitWordIndex}:${match.id}`;
    if (processedHitKeysRef.current.has(key)) return;
    processedHitKeysRef.current.add(key);

    setPills((prev) =>
      prev.map((p) =>
        p.id === match.id ? { ...p, phase: "hit" as const } : p,
      ),
    );

    setHits((h) => h + 1);
    setWordsAttempted((w) => w + 1);
    setStreak((s) => {
      const ns = s + 1;
      setBestStreak((b) => (ns > b ? ns : b));
      setXp((x) => x + scoreForHit(ns));
      return ns;
    });

    const id = match.id;
    requestAnimationFrame(() => {
      const el = beltRef.current?.querySelector(
        `[data-pill-id="${id}"]`,
      ) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, [
          match.palette[0],
          match.palette[1],
        ]);
      }
    });

    window.setTimeout(() => {
      setPills((prev) => prev.filter((p) => p.id !== id));
    }, 220);
  }, [hitWordIndex, pills, burst]);

  useEffect(() => {
    const c = starsRef.current;
    if (!c) return;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      r: Math.random() * 1.5 + 0.3,
      a: Math.random(),
      s: (Math.random() * 0.02 + 0.005) * (Math.random() < 0.5 ? -1 : 1),
    }));
    const ctx = c.getContext("2d");
    if (!ctx) return () => window.removeEventListener("resize", resize);
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of stars) {
        s.a += s.s;
        if (s.a > 1 || s.a < 0.2) s.s = -s.s;
        ctx.globalAlpha = s.a * 0.55;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const c = particlesRef.current;
    if (!c) return;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const ctx = c.getContext("2d");
    if (!ctx) return () => window.removeEventListener("resize", resize);
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const arr = particlesRefData.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life -= 1 / 60;
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
      rafParticlesRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafParticlesRef.current);
    };
  }, []);

  useEffect(() => {
    if (ended) return;
    const tick = () => {
      const t = performance.now();
      setNowTick(t);
      setPills((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          if (p.phase !== "live") return p;
          const u = (t - p.spawnedAt) / Math.max(1, p.travelMs);
          if (u >= 1) {
            changed = true;
            setWordsAttempted((w) => w + 1);
            setStreak(0);
            return { ...p, phase: "miss" as const };
          }
          return p;
        });
        return changed ? next : prev;
      });
      rafTickRef.current = requestAnimationFrame(tick);
    };
    rafTickRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafTickRef.current);
  }, [ended]);

  useEffect(() => {
    if (!ended || completeSentRef.current) return;
    completeSentRef.current = true;
    const wa = wordsAttemptedRef.current;
    const h = hitsRef.current;
    const x = xpRef.current;
    const accuracy = wa > 0 ? h / wa : 0;
    onComplete?.({
      wordsHit: h,
      wordsAttempted: wa,
      accuracy,
      flaggedWords: [...flaggedWordsRef.current],
      xpEarned: x,
    });
  }, [ended, onComplete]);

  useEffect(() => {
    const missIds = pills.filter((p) => p.phase === "miss").map((p) => p.id);
    if (missIds.length === 0) return;
    const tid = window.setTimeout(() => {
      setPills((prev) => prev.filter((p) => p.phase !== "miss"));
    }, 330);
    return () => window.clearTimeout(tid);
  }, [pills]);

  const heard =
    interimTranscript.trim().split(/\s+/).pop() || "—";

  const css = `
    @keyframes pg-spring-in {
      from { transform: translate(-50%, -50%) scale(0); }
      to { transform: translate(-50%, -50%) scale(var(--enter-scale, 0.35)); }
    }
    @keyframes pg-pill-hit {
      0% { transform: translate(-50%, -50%) scaleX(1.15) scaleY(0.7); }
      100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    }
    @keyframes pg-pill-miss {
      0% { filter: brightness(1.6) hue-rotate(-60deg); }
      100% { transform: translate(-50%, -50%) scale(0); opacity: 0; filter: brightness(1); }
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
          zIndex: 1,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          transform: "scaleX(-1)",
          background: "transparent",
          display: cameraOk ? "block" : "none",
        }}
      />
      <canvas
        ref={starsRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      <div
        ref={beltRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
        }}
      >
        {pills.map((p) => {
          const w = words[p.wordIndex] ?? "";
          const t = Math.min(
            1,
            (nowTick - p.spawnedAt) / Math.max(1, p.travelMs),
          );
          const pos = beltPosition(t, BELT_MODE);
          const anim =
            p.phase === "hit"
              ? "pg-pill-hit 200ms ease-out forwards"
              : p.phase === "miss"
                ? "pg-pill-miss 320ms ease-out forwards"
                : "pg-spring-in 180ms cubic-bezier(.34, 1.56, .64, 1) forwards";
          return (
            <div
              key={p.id}
              data-pill-id={p.id}
              style={{
                position: "absolute",
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: `translate(-50%, -50%) scale(${pos.scale})`,
                opacity: pos.opacity,
                padding: "14px 28px",
                borderRadius: 18,
                border: "2px solid rgba(255, 255, 255, 0.45)",
                boxShadow: `0 10px 24px rgba(0,0,0,0.45), 0 0 40px ${p.palette[1]}44`,
                fontFamily: "'Fredoka', sans-serif",
                fontWeight: 700,
                fontSize: 32,
                lineHeight: 1,
                whiteSpace: "nowrap",
                color: "white",
                textShadow: "0 2px 4px rgba(0,0,0,0.3)",
                userSelect: "none",
                willChange: "transform, opacity",
                background: `linear-gradient(135deg, ${p.palette[0]}, ${p.palette[1]})`,
                animation: anim,
                ["--enter-scale" as string]: String(pos.scale),
              }}
            >
              {w}
            </div>
          );
        })}
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
              background: activeWordIndices.length ? "#10b981" : "#ef4444",
              boxShadow: activeWordIndices.length
                ? "0 0 10px #10b981"
                : undefined,
              animation: activeWordIndices.length
                ? "pg-mic-pulse 1.4s infinite"
                : undefined,
            }}
          />
          {activeWordIndices.length ? "listening" : "waiting"}
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
          🔥 {streak}
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
            ].map((s) => (
              <div
                key={s.l}
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
                  {s.v}
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
                  {s.l}
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
                {flaggedWords.map((fw) => (
                  <button
                    key={fw}
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
                      const u = new SpeechSynthesisUtterance(fw);
                      u.rate = 0.8;
                      speechSynthesis.speak(u);
                    }}
                  >
                    🔊 {fw}
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
