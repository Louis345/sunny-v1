import { useMemo } from "react";
import { questUnlockCompanionBubbleText } from "./QuestBriefingModal";
import { QuestParticles } from "./QuestParticles";
import type { QuestUnlockState } from "./useQuestUnlockSequence";
import "./QuestUnlockSequence.css";

function makeCardStars(active: boolean) {
  if (!active) return [];
  return Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${(i * 31) % 100}%`,
    top: `${(i * 47) % 100}%`,
    duration: `${3 + (i % 4)}s`,
    delay: `${(i % 5) * 0.22}s`,
    fontSize: `${10 + (i % 6) * 2}px`,
  }));
}

/** @deprecated Legacy AdventureMap quest flow. Live homework Quest choices use AdventureChoiceModal. */
export function QuestUnlockSequence(props: QuestUnlockState) {
  const {
    overlayActive,
    burstActive,
    toastActive,
    companionActive,
    particlesActive,
    raysActive,
    cardStarsActive,
    origin,
    childId,
    companionId,
    companionBubbleText,
    previewTopOffsetPx,
  } = props;
  const rays = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const cardStars = useMemo(
    () => makeCardStars(cardStarsActive),
    [cardStarsActive],
  );

  return (
    <>
      {overlayActive ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 140,
            pointerEvents: "none",
            opacity: 1,
            background:
              "radial-gradient(ellipse at center, rgba(255,180,0,.12) 0%, rgba(0,0,0,.55) 100%)",
            transition: "opacity .4s ease",
          }}
        />
      ) : null}

      {raysActive ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: origin.x,
            top: origin.y,
            zIndex: 142,
            pointerEvents: "none",
          }}
        >
          {rays.map((ray) => {
            const angle = (ray / rays.length) * 360;
            return (
              <div
                key={ray}
                style={{
                  position: "absolute",
                  left: -2,
                  top: 0,
                  width: 4,
                  height: 200,
                  background:
                    "linear-gradient(to bottom, rgba(255,220,100,.9), transparent)",
                  transformOrigin: "top center",
                  transform: `rotate(${angle}deg)`,
                  animation:
                    "rayPulse 1.5s ease-in-out infinite alternate",
                  animationDelay: `${ray * 0.05}s`,
                  ["--angle" as string]: `${angle}deg`,
                }}
              />
            );
          })}
        </div>
      ) : null}

      {burstActive
        ? [0, 1, 2, 3].map((ring) => (
            <div
              key={ring}
              aria-hidden
              style={{
                position: "fixed",
                left: origin.x,
                top: origin.y,
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: `3px solid ${ring % 2 === 0 ? "#FFD84D" : "#FF9A00"}`,
                animation: "burstRing 0.95s ease-out forwards",
                animationDelay: `${ring * 100}ms`,
                pointerEvents: "none",
                zIndex: 143,
              }}
            />
          ))
        : null}

      {toastActive ? (
        <div
          className="quest-unlock-toast-in"
          style={{
            position: "fixed",
            top: previewTopOffsetPx,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 145,
            background: "linear-gradient(90deg, #C87800, #FFD84D)",
            color: "#1a0800",
            font: "800 15px/1 Lexend, system-ui, sans-serif",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            padding: "14px 32px",
            borderRadius: "0 0 20px 20px",
            boxShadow: "0 8px 40px rgba(255,180,0,.6)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            backgroundSize: "200% auto",
            animation:
              "quest-unlock-toast-slide .5s cubic-bezier(.34,1.56,.64,1) forwards, bannerShimmer 2s linear infinite",
          }}
        >
          ⚡ Quest Unlocked! ⚡
        </div>
      ) : null}

      {companionActive ? (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 92,
            zIndex: 146,
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
            pointerEvents: "none",
            maxWidth: 360,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "16px 16px 4px 16px",
              background: "rgba(25,18,55,.95)",
              color: "white",
              border: "1px solid rgba(124,58,237,.4)",
              boxShadow: "0 0 20px rgba(124,58,237,.3)",
              fontFamily: "Lexend, system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            {companionBubbleText ||
              questUnlockCompanionBubbleText(childId, companionId)}
          </div>
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: "50%",
              background: "linear-gradient(145deg, #a78bfa, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              animation: "companionExcited 1.2s ease-in-out",
            }}
          >
            ✨
          </div>
        </div>
      ) : null}

      {cardStarsActive ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: origin.x - 160,
            top: origin.y - 160,
            width: 320,
            height: 320,
            zIndex: 144,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {cardStars.map((star) => (
            <div
              key={star.id}
              style={{
                position: "absolute",
                left: star.left,
                top: star.top,
                color: "#FFD84D",
                fontSize: star.fontSize,
                opacity: 0.4,
                animation: "qcStarFloat linear infinite",
                animationDuration: star.duration,
                animationDelay: star.delay,
              }}
            >
              ✦
            </div>
          ))}
        </div>
      ) : null}

      <QuestParticles active={particlesActive} origin={origin} />
    </>
  );
}
