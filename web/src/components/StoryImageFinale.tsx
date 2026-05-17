import { useEffect, useMemo, useRef, useState } from "react";

type PurchaseResult = { balance: number; cost: number };

function playSpendSound(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    if (ac.state === "suspended") void ac.resume();
    const start = ac.currentTime;
    const freqs = [780, 620, 480];
    freqs.forEach((freq, idx) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start + idx * 0.07);
      gain.gain.setValueAtTime(0.0001, start + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.11, start + idx * 0.07 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + idx * 0.07 + 0.16);
      osc.start(start + idx * 0.07);
      osc.stop(start + idx * 0.07 + 0.18);
    });
    window.setTimeout(() => {
      void ac.close().catch(() => {});
    }, 800);
  } catch {
    /* ignore */
  }
}

export type StoryImageFinaleProps = {
  childId: string;
  childDisplayName?: string;
  imageUrl: string | null;
  loading: boolean;
  failed: boolean;
  companionCurrency: number;
  purchaseCost: number;
  onGenerateMovie?: (imageUrl: string) => Promise<string | null>;
  onPurchaseMovie: (cost: number) => Promise<PurchaseResult>;
  onExit: () => void;
};

export function StoryImageFinale(props: StoryImageFinaleProps) {
  const displayName =
    props.childDisplayName?.trim() || props.childId.trim() || "Your";
  const storyOwner = useMemo(
    () =>
      displayName === "Your"
        ? "Your"
        : displayName.endsWith("s")
          ? `${displayName}'`
          : `${displayName}'s`,
    [displayName],
  );
  const [displayBalance, setDisplayBalance] = useState(
    Math.max(0, Math.floor(Number(props.companionCurrency) || 0)),
  );
  const [movieUnlocked, setMovieUnlocked] = useState(false);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const [movieUrl, setMovieUrl] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!movieUnlocked && !purchasing) {
      setDisplayBalance(Math.max(0, Math.floor(Number(props.companionCurrency) || 0)));
    }
  }, [movieUnlocked, props.companionCurrency, purchasing]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) {
        window.clearTimeout(t);
      }
      timersRef.current = [];
    };
  }, []);

  function schedule(fn: () => void, ms: number): void {
    const id = window.setTimeout(fn, ms) as unknown as number;
    timersRef.current.push(id);
  }

  function animateBalance(from: number, to: number): Promise<void> {
    return new Promise((resolve) => {
      const steps = 8;
      const delta = from - to;
      let ticks = 0;
      const guardLimit = 10;
      const run = () => {
        ticks += 1;
        const progress = Math.min(1, ticks / steps);
        const next = Math.max(to, from - Math.round(delta * progress));
        setDisplayBalance(next);
        if (ticks >= steps) {
          resolve();
          return;
        }
        if (ticks > guardLimit) {
          throw new Error("story_movie_balance_animation_guard_exceeded");
        }
        schedule(run, 70);
      };
      schedule(run, 70);
    });
  }

  function finishMoviePlayback(): void {
    schedule(() => {
      setMoviePlaying(false);
    }, 1800);
  }

  async function handlePurchase(): Promise<void> {
    if (purchasing || moviePlaying || movieUnlocked) return;
    if (!props.imageUrl) return;
    setPurchasing(true);
    setPurchaseError(null);
    const currentBalance = Math.max(0, Math.floor(Number(displayBalance) || 0));
    try {
      const generatedMovieUrl = props.onGenerateMovie
        ? await props.onGenerateMovie(props.imageUrl)
        : null;
      if (!generatedMovieUrl) {
        throw new Error("Movie generation failed. Coins were not spent.");
      }
      const out = await props.onPurchaseMovie(props.purchaseCost);
      playSpendSound();
      await animateBalance(currentBalance, out.balance);
      setMovieUrl(generatedMovieUrl);
      setMovieUnlocked(true);
      setMoviePlaying(true);
      finishMoviePlayback();
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : "Movie purchase failed");
    } finally {
      setPurchasing(false);
    }
  }

  function handleReplay(): void {
    if (!movieUnlocked || moviePlaying) return;
    setMoviePlaying(true);
    finishMoviePlayback();
  }

  if (!props.imageUrl) {
    return (
      <div
        data-testid="map-story-image-finale"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff8f0",
          overflow: "hidden",
          fontFamily: "Lexend, system-ui, sans-serif",
        }}
      >
        <button
          type="button"
          onClick={props.onExit}
          aria-label="Back to map"
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            border: "none",
            borderRadius: 999,
            padding: "10px 16px",
            background: "rgba(15, 23, 42, 0.76)",
            color: "white",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.24)",
          }}
        >
          Back to map
        </button>
        <div style={{ textAlign: "center", color: "#334155" }}>
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: "50%",
              margin: "0 auto 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "white",
              border: "4px solid #fbbf24",
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            {props.childId.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
            {props.loading
              ? "Creating your story illustration..."
              : props.failed
                ? "Story complete. Image unavailable"
                : "Story complete"}
          </div>
          <div
            style={{
              width: 280,
              height: 10,
              borderRadius: 999,
              background: "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: props.loading ? "82%" : "100%",
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #6D5EF5, #fbbf24)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="map-story-image-finale"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff8f0",
        overflow: "hidden",
        fontFamily: "Lexend, system-ui, sans-serif",
      }}
    >
      <button
        type="button"
        onClick={props.onExit}
        aria-label="Back to map"
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          zIndex: 2,
          border: "none",
          borderRadius: 999,
          padding: "10px 16px",
          background: "rgba(15, 23, 42, 0.76)",
          color: "white",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.24)",
        }}
      >
        Back to map
      </button>
      <img
        src={props.imageUrl}
        alt="Story finale"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: moviePlaying ? "scale(1.12)" : "scale(1)",
          transition: "transform 1.8s ease",
        }}
      />
      {movieUrl ? (
        <video
          key={movieUrl}
          data-testid="story-movie-video"
          src={movieUrl}
          autoPlay={moviePlaying}
          playsInline
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: moviePlaying ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
          onEnded={() => setMoviePlaying(false)}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            moviePlaying
              ? "linear-gradient(rgba(8,15,42,0.08), rgba(8,15,42,0.48))"
              : "linear-gradient(transparent 45%, rgba(0,0,0,0.68))",
          transition: "background 0.5s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          padding: "10px 16px",
          borderRadius: 999,
          color: "white",
          background: "rgba(15, 23, 42, 0.72)",
          fontSize: 18,
          fontWeight: 800,
          boxShadow: "0 12px 28px rgba(15, 23, 42, 0.25)",
        }}
      >
        {displayBalance} coins
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 134,
          left: 24,
          right: 24,
          textAlign: "center",
          color: "white",
          fontSize: moviePlaying ? 28 : 24,
          fontWeight: 800,
          textShadow: "0 2px 14px rgba(0,0,0,0.45)",
          transition: "font-size 0.4s ease",
        }}
      >
        {moviePlaying ? `${storyOwner} movie is playing.` : `${storyOwner} story came to life.`}
      </div>
      <div
        data-testid="story-movie-purchase-sheet"
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
          padding: "18px 18px 20px",
          borderRadius: 24,
          background: "rgba(15, 23, 42, 0.82)",
          color: "white",
          backdropFilter: "blur(10px)",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#fcd34d",
              }}
            >
              Story Reward
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {movieUnlocked ? "Movie unlocked" : `Play movie for ${props.purchaseCost} coins`}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.78)",
                marginTop: 6,
              }}
            >
              {movieUnlocked
                ? `${displayBalance} coins left`
                : `Do you want to use ${props.purchaseCost} of your Sunny coins to make this video?`}
            </div>
          </div>
          {!movieUnlocked ? (
            <button
              type="button"
              onClick={() => {
                void handlePurchase();
              }}
              disabled={purchasing || props.companionCurrency < props.purchaseCost}
              aria-label={`Play movie for ${props.purchaseCost} coins`}
              style={{
                minWidth: 190,
                border: 0,
                borderRadius: 18,
                padding: "14px 18px",
                background:
                  purchasing || props.companionCurrency < props.purchaseCost
                    ? "rgba(148, 163, 184, 0.45)"
                    : "linear-gradient(135deg, #fbbf24, #f97316)",
                color: "#111827",
                fontSize: 16,
                fontWeight: 900,
                cursor:
                  purchasing || props.companionCurrency < props.purchaseCost
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {purchasing ? "Making movie..." : `Play movie for ${props.purchaseCost} coins`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReplay}
              disabled={moviePlaying}
              aria-label="Watch again"
              style={{
                minWidth: 190,
                border: 0,
                borderRadius: 18,
                padding: "14px 18px",
                background:
                  moviePlaying
                    ? "rgba(148, 163, 184, 0.45)"
                    : "linear-gradient(135deg, #22c55e, #14b8a6)",
                color: "#052e16",
                fontSize: 16,
                fontWeight: 900,
                cursor: moviePlaying ? "not-allowed" : "pointer",
              }}
            >
              {moviePlaying ? "Playing now..." : "Watch again"}
            </button>
          )}
        </div>
        {props.companionCurrency < props.purchaseCost && !movieUnlocked ? (
          <div style={{ marginTop: 12, fontSize: 14, color: "#fde68a" }}>
            Need {props.purchaseCost - props.companionCurrency} more coins.
          </div>
        ) : null}
        {purchaseError ? (
          <div style={{ marginTop: 12, fontSize: 14, color: "#fecaca" }}>
            {purchaseError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
