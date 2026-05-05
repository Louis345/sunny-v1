import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { classifyKaraokeWordMatch } from "../../../src/shared/karaokeMatchWord";
import { useKaraokeReading } from "../hooks/useKaraokeReading";
import { playGameSfx } from "../utils/gameSfx";

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@700;800;900&family=Lexend:wght@400;600&family=Caveat:wght@700&display=swap";

const TRAVEL_MS = 3000;
const ZONE_MS = 2000;
const GAME_MS = 60_000;
const HEAT_THRESHOLD = 3;
const COMBO_BREAKER_STREAK = 8;
const COMBO_BREAKER_BANNER_MS = 1800;
const HIT_MS = 300;
const YANK_OUT_MS = 300;
const YANK_BACK_MS = 400;
const WRONG_DEBOUNCE_MS = 1200;
const HEARD_STICKY_MS = 450;

function transcriptWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function lastTranscriptWord(text: string): string {
  return transcriptWords(text).at(-1) ?? "";
}

function transcriptMatchesExpectedPhrase(
  heardWords: string[],
  expected: string,
): "match" | "partial" | "mismatch" {
  const expectedTokens = expected.split(/\s+/).filter(Boolean);
  if (expectedTokens.length <= 1) {
    let result: "match" | "partial" | "mismatch" = "mismatch";
    for (const heardWord of heardWords) {
      const candidate = classifyKaraokeWordMatch(heardWord, expected);
      if (candidate === "match") return "match";
      if (candidate === "partial") result = "partial";
    }
    return result;
  }
  const normalizedExpected = expectedTokens.join(" ");
  for (let start = 0; start <= heardWords.length - expectedTokens.length; start += 1) {
    const phrase = heardWords.slice(start, start + expectedTokens.length).join(" ");
    if (classifyKaraokeWordMatch(phrase, normalizedExpected) === "match") {
      return "match";
    }
    if (
      classifyKaraokeWordMatch(
        phrase.replace(/\s+/g, ""),
        normalizedExpected.replace(/\s+/g, ""),
      ) === "match"
    ) {
      return "match";
    }
  }
  const partialPhrase = heardWords.slice(-expectedTokens.length).join(" ");
  return partialPhrase &&
    classifyKaraokeWordMatch(partialPhrase, normalizedExpected) === "partial"
    ? "partial"
    : "mismatch";
}

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
  onExit?: () => void;
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

function pronunciationSpeedMultiplier(hitStreak: number): number {
  if (hitStreak >= COMBO_BREAKER_STREAK) return 1.4;
  if (hitStreak >= 5) return 1.25;
  if (hitStreak >= HEAT_THRESHOLD) return 1.12;
  return 1;
}

const LOW_VALUE_PRONUNCIATION_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "away",
  "by",
  "down",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "out",
  "over",
  "the",
  "to",
  "under",
  "up",
  "with",
]);

function pronunciationTargetTokens(rawWord: string): string[] {
  const tokens = rawWord
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const meaningfulTokens = tokens.filter(
    (token) => token.length >= 3 && !LOW_VALUE_PRONUNCIATION_WORDS.has(token),
  );
  return meaningfulTokens.length > 0 ? meaningfulTokens : tokens.slice(0, 1);
}

function dedupePronunciationWords(words: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const word of words) {
    for (const target of pronunciationTargetTokens(word)) {
      if (!target || seen.has(target)) continue;
      seen.add(target);
      deduped.push(target);
    }
  }
  return deduped;
}

function pronunciationWordsKey(words: string[]): string {
  return words.flatMap(pronunciationTargetTokens).join("\u0001");
}

export function PronunciationGameCanvas({
  words: rawWords,
  interimTranscript,
  sendMessage,
  backgroundImageUrl: _backgroundImageUrl, // eslint-disable-line @typescript-eslint/no-unused-vars
  accentColor: _accentColor, // eslint-disable-line @typescript-eslint/no-unused-vars
  onComplete,
  onExit,
  topInset = 0,
}: PronunciationGameCanvasProps): React.ReactElement {
  const rawWordsKey = pronunciationWordsKey(rawWords);
  const words = useMemo(() => dedupePronunciationWords(rawWords), [rawWordsKey]);
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
  const heardClearTimeoutRef = useRef<number | null>(null);
  const comboBannerTimeoutRef = useRef<number | null>(null);
  const wordIndexRef = useRef(0);
  const hitsRef = useRef(0);
  const wordsAttemptedRef = useRef(0);
  const xpRef = useRef(0);
  const flaggedWordsRef = useRef<string[]>([]);
  const missCountByWordRef = useRef<Map<string, number>>(new Map());
  const bonusWordIndexRef = useRef<number | null>(null);

  const [cameraOk, setCameraOk] = useState(false);
  const [hasStarted, setHasStarted] = useState(true);
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
  const [heardTranscript, setHeardTranscript] = useState("");
  const [bonusWordIndex, setBonusWordIndex] = useState<number | null>(null);
  const [comboBreakerBanner, setComboBreakerBanner] = useState(false);
  const [lastHitXp, setLastHitXp] = useState(0);
  const [lastHitWasBonus, setLastHitWasBonus] = useState(false);

  const {
    wordIndex,
    flaggedWords,
    isComplete,
  } = useKaraokeReading({
    words,
    interimTranscript,
    sendMessage,
    mode: "sequential",
    suppressDuplicateTranscriptMatches: true,
  });

  useEffect(() => {
    interimRef.current = interimTranscript;
    const trimmed = interimTranscript.trim();
    if (trimmed) {
      if (heardClearTimeoutRef.current !== null) {
        window.clearTimeout(heardClearTimeoutRef.current);
        heardClearTimeoutRef.current = null;
      }
      const expected = words[wordIndexRef.current] ?? "";
      const expectedTokenCount = expected.split(/\s+/).filter(Boolean).length;
      const heardWords = transcriptWords(trimmed);
      setHeardTranscript(
        expectedTokenCount > 1
          ? heardWords.slice(-expectedTokenCount).join(" ") || trimmed
          : heardWords.at(-1) ?? trimmed,
      );
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
    return () => {
      if (heardClearTimeoutRef.current !== null) {
        window.clearTimeout(heardClearTimeoutRef.current);
      }
      if (comboBannerTimeoutRef.current !== null) {
        window.clearTimeout(comboBannerTimeoutRef.current);
      }
    };
  }, []);
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
    heardTranscript || interimTranscript.trim().split(/\s+/).filter(Boolean).pop() || "—";
  const speedMultiplier = pronunciationSpeedMultiplier(hitStreak);
  const travelMs = Math.round(TRAVEL_MS / speedMultiplier);
  const zoneMs = Math.round(ZONE_MS / speedMultiplier);
  const totalMs = travelMs + zoneMs;
  const heatedUp = hitStreak >= HEAT_THRESHOLD;

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
      bonusWordIndexRef.current = null;
      setBonusWordIndex(null);
      setComboBreakerBanner(false);
      setLastHitXp(0);
      setLastHitWasBonus(false);
      completeSentRef.current = false;
      setEnded(false);
      missCountByWordRef.current = new Map();
    });
  }, [words, hasStarted]);

  const triggerComboBreaker = useCallback(
    (streakCount: number, nextWordIndex: number) => {
      const bonusIndex = nextWordIndex < words.length ? nextWordIndex : null;
      const bonusWord = bonusIndex !== null ? words[bonusIndex] ?? "" : "";
      if (bonusIndex !== null) {
        bonusWordIndexRef.current = bonusIndex;
        setBonusWordIndex(bonusIndex);
      }

      console.log(" 🎮 [pronunciation] combo_breaker fired", {
        streak: streakCount,
        bonusWord,
      });
      playGameSfx("pronunciation", "comboBreaker");
      sendMessage("game_event", {
        event: {
          type: "combo_breaker",
          payload: {
            game: "pronunciation",
            streak: streakCount,
            bonusWord,
            bonusMultiplier: 2,
            difficulty: "super_hard",
            reason: "huge_streak",
          },
          version: "1.0",
        },
      });

      setComboBreakerBanner(true);
      if (comboBannerTimeoutRef.current !== null) {
        window.clearTimeout(comboBannerTimeoutRef.current);
      }
      comboBannerTimeoutRef.current = window.setTimeout(() => {
        comboBannerTimeoutRef.current = null;
        setComboBreakerBanner(false);
      }, COMBO_BREAKER_BANNER_MS);
    },
    [sendMessage, words],
  );

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
    if (bonusWordIndexRef.current === wordIndexRef.current) {
      bonusWordIndexRef.current = null;
      setBonusWordIndex(null);
    }
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
      if (performance.now() - cycleStartRef.current >= totalMs) {
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
  }, [blockPhase, cycleKey, ended, isComplete, totalMs, triggerMissYank, words]);

  useEffect(() => {
    if (wrongTimerRef.current) {
      clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    if (blockPhase !== "approaching" || ended || isComplete) return;
    const t = interimTranscript.trim();
    const heardWords = transcriptWords(t);
    const last = heardWords.at(-1) ?? "";
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
    if (transcriptMatchesExpectedPhrase(heardWords, w) === "match") return;

    const lastHitWord = lastTranscriptWord(lastHitInterimRef.current);
    if (performance.now() < hitCooldownUntilRef.current && last === lastHitWord) {
      return;
    }

    wrongTimerRef.current = window.setTimeout(() => {
      wrongTimerRef.current = null;
      const t2 = interimRef.current.trim();
      const heardWords2 = transcriptWords(t2);
      const last2 = heardWords2.at(-1) ?? "";
      const lastHitWord2 = lastTranscriptWord(lastHitInterimRef.current);
      if (performance.now() < hitCooldownUntilRef.current && last2 === lastHitWord2) {
        return;
      }
      if (last2.length <= 3) return;
      const wi = wordIndexRef.current;
      const w2 = words[wi];
      if (!w2) return;
      const result2 = transcriptMatchesExpectedPhrase(heardWords2, w2);
      if (result2 === "match" || result2 === "partial") return;
      // If the interim hasn't changed since the last hit, it's stale — ignore
      if (last2 === lastHitInterimRef.current) return;
      console.log(
        "[PG] DEBOUNCE FIRED | heard2:",
        last2,
        "| expected:",
        words[wordIndexRef.current],
        "| match result:",
          transcriptMatchesExpectedPhrase(
            heardWords2,
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
    const hitWordIndex = advancedTo - 1;
    const wasBonusHit = bonusWordIndexRef.current === hitWordIndex;
    if (wasBonusHit) {
      bonusWordIndexRef.current = null;
      setBonusWordIndex(null);
    }
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
          const earnedXp = scoreForHit(nhs, ns) * (wasBonusHit ? 2 : 1);
          setLastHitXp(earnedXp);
          setLastHitWasBonus(wasBonusHit);
          setXp((x) => x + earnedXp);
          if (nhs >= HEAT_THRESHOLD) setHeatBanner("heating");
          if (nhs === COMBO_BREAKER_STREAK) {
            triggerComboBreaker(nhs, advancedTo);
          }
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
  }, [wordIndex, words.length, ended, burst, triggerComboBreaker]);

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
    @keyframes pg-flame-trail {
      0% { transform: translate(-50%, -50%) scale(0.7) rotate(-8deg); opacity: 0.15; }
      45% { opacity: 0.9; }
      100% { transform: translate(-50%, -50%) scale(1.5) rotate(8deg); opacity: 0; }
    }
    @keyframes pg-heat-flame {
      0% { transform: translate(-50%, 0) scale(0.75); opacity: 0.15; }
      35% { opacity: 0.85; }
      100% { transform: translate(-50%, -42px) scale(1.15); opacity: 0; }
    }
    @keyframes pg-heat-flicker {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.25) saturate(1.2); }
    }
    @keyframes pg-combo-pop {
      0% { transform: translateY(-20px) scale(0.8); opacity: 0; }
      55% { transform: translateY(0) scale(1.08); opacity: 1; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes pg-mic-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.75); }
    }
  `;

  const blockAnim =
    blockPhase === "approaching"
      ? `pg-approach ${travelMs}ms linear forwards`
      : blockPhase === "hit"
        ? `pg-hit-pass ${HIT_MS}ms ease-out forwards`
        : `pg-miss-shatter ${YANK_OUT_MS + YANK_BACK_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards`;
  const isBonusWord = bonusWordIndex === wordIndex && blockPhase === "approaching";

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
      <span
        data-testid="pronunciation-speed-state"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {speedMultiplier.toFixed(2)}x
      </span>
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

      {comboBreakerBanner ? (
        <div
          style={{
            position: "fixed",
            top: Math.max(108, topInset + 64),
            left: 0,
            right: 0,
            zIndex: 41,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 34,
              fontWeight: 900,
              color: "#fff7ed",
              padding: "12px 26px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #f97316, #dc2626)",
              border: "2px solid rgba(254,240,138,0.85)",
              boxShadow: "0 0 42px rgba(249,115,22,0.65)",
              textShadow: "0 3px 0 rgba(0,0,0,0.35)",
              animation: "pg-combo-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            COMBO BREAKER! BONUS WORD x2
          </div>
        </div>
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
        {heatedUp && !isBonusWord ? (
          <div
            data-testid="pronunciation-heat-fire"
            style={{
              position: "absolute",
              inset: "-42px -38px",
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${14 + i * 14}%`,
                  bottom: -18,
                  width: 56,
                  height: 86,
                  borderRadius: "50% 50% 45% 45%",
                  background:
                    "radial-gradient(circle at 50% 72%, rgba(254,240,138,0.95) 0%, rgba(249,115,22,0.82) 38%, rgba(220,38,38,0) 72%)",
                  filter: "blur(1px)",
                  animation: `pg-heat-flame ${520 - Math.min(120, hitStreak * 12)}ms ease-out ${i * 65}ms infinite`,
                }}
              />
            ))}
          </div>
        ) : null}
        {isBonusWord ? (
          <div
            data-testid="pronunciation-bonus-word"
            style={{
              position: "absolute",
              inset: "-30px -48px",
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${18 + i * 16}%`,
                  top: `${44 + (i % 2) * 18}%`,
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(254,240,138,0.95) 0%, rgba(249,115,22,0.7) 42%, rgba(220,38,38,0) 72%)",
                  filter: "blur(2px)",
                  animation: `pg-flame-trail 800ms ease-out ${i * 90}ms infinite`,
                }}
              />
            ))}
          </div>
        ) : null}
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
            background: isBonusWord
              ? "linear-gradient(135deg, #f97316, #facc15 48%, #dc2626)"
              : "linear-gradient(135deg, #6D5EF5, #a78bfa)",
            border: isBonusWord
              ? "4px solid rgba(254,240,138,0.95)"
              : "3px solid rgba(255,255,255,0.5)",
            boxShadow: isBonusWord
              ? "0 0 80px rgba(249,115,22,0.85), 0 0 18px rgba(254,240,138,0.8) inset"
              : heatedUp
                ? "0 0 86px rgba(249,115,22,0.72), 0 0 26px rgba(254,240,138,0.32) inset"
                : "0 0 60px rgba(109,94,245,0.6)",
            textShadow: "0 2px 8px rgba(0,0,0,0.35)",
            userSelect: "none",
            zIndex: 2,
            animation: heatedUp && !isBonusWord ? "pg-heat-flicker 720ms ease-in-out infinite" : undefined,
          }}
        >
          {isBonusWord ? (
            <div
              style={{
                position: "absolute",
                top: -18,
                right: 18,
                padding: "5px 12px",
                borderRadius: 999,
                background: "#111827",
                color: "#fef08a",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "0.04em",
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}
            >
              x2 SUPER HARD
            </div>
          ) : null}
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
            +{lastHitXp || scoreForHit(hitStreak, streak)} XP{lastHitWasBonus ? " x2" : ""}
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
            THEY'RE HEATING UP 🔥
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
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              aria-label="Back to map"
              style={{
                marginTop: 28,
                border: "none",
                borderRadius: 999,
                padding: "12px 24px",
                background: "linear-gradient(135deg, #fbbf24, #f97316)",
                color: "#111827",
                cursor: "pointer",
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 18,
                fontWeight: 900,
                boxShadow: "0 12px 30px rgba(249,115,22,0.28)",
              }}
            >
              Back to map
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
