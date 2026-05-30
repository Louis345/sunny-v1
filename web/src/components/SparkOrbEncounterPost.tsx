import {
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

export type SparkOrbEncounterPhase =
  | "idle"
  | "charge-1"
  | "charge-2"
  | "ready"
  | "launching"
  | "collected";

export type SparkOrbEncounterEventType =
  | "charge"
  | "ready"
  | "launch"
  | "collected"
  | "reset";

export interface SparkOrbEncounterEvent {
  type: SparkOrbEncounterEventType;
  phase: SparkOrbEncounterPhase;
  chargeCount: number;
  creatureName: string;
}

export interface SparkOrbEncounterPostProps {
  phase: SparkOrbEncounterPhase;
  creatureName?: string;
  statLabel?: string;
  statValue?: number;
  orbCount?: number;
  attribution?: string;
  timestamp?: string;
  views?: string;
  hint?: string;
  onEncounterEvent?: (event: SparkOrbEncounterEvent) => void;
}

const assetBase = "/encounters/spark-orb";

function chargeCountForPhase(phase: SparkOrbEncounterPhase): number {
  switch (phase) {
    case "idle":
      return 0;
    case "charge-1":
      return 1;
    case "charge-2":
      return 2;
    case "ready":
    case "launching":
    case "collected":
      return 3;
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

function emitEncounterEvent(
  args: {
    type: SparkOrbEncounterEventType;
    phase: SparkOrbEncounterPhase;
    creatureName: string;
    onEncounterEvent?: (event: SparkOrbEncounterEvent) => void;
  },
): void {
  const event = {
    type: args.type,
    phase: args.phase,
    chargeCount: chargeCountForPhase(args.phase),
    creatureName: args.creatureName,
  };
  console.log(" 🎮 [spark-orb] [encounter-event] [emitted]", event);
  args.onEncounterEvent?.(event);
}

export function SparkOrbEncounterPost({
  phase,
  creatureName = "Lumipuff",
  statLabel = "SPARK",
  statValue = 214,
  orbCount = 7,
  attribution = "Sunny Lab",
  hint = "Flick up to launch",
  onEncounterEvent,
}: SparkOrbEncounterPostProps) {
  const chargeCount = chargeCountForPhase(phase);
  const emittedReadyRef = useRef(false);

  useEffect(() => {
    if (phase !== "ready") {
      emittedReadyRef.current = false;
      return;
    }
    if (emittedReadyRef.current) return;
    emittedReadyRef.current = true;
    playSparkOrbSfx("ready");
    emitEncounterEvent({
      type: "ready",
      phase,
      creatureName,
      onEncounterEvent,
    });
  }, [creatureName, onEncounterEvent, phase]);

  const handleCharge = () => {
    playSparkOrbSfx("charge");
    emitEncounterEvent({
      type: "charge",
      phase,
      creatureName,
      onEncounterEvent,
    });
  };

  const handleLaunch = () => {
    playSparkOrbSfx("launch");
    emitEncounterEvent({
      type: "launch",
      phase,
      creatureName,
      onEncounterEvent,
    });
  };

  const handleCollect = () => {
    playSparkOrbSfx("collected");
    emitEncounterEvent({
      type: "collected",
      phase,
      creatureName,
      onEncounterEvent,
    });
  };

  const handleReset = () => {
    emitEncounterEvent({
      type: "reset",
      phase,
      creatureName,
      onEncounterEvent,
    });
  };

  const ready = phase === "ready";
  const launching = phase === "launching";
  const collected = phase === "collected";
  const charged = ready || launching || collected;

  return (
    <div className="spark-orb-post" data-testid="spark-orb-encounter" data-phase={phase}>
      <header className="spark-orb-post__header">
        <button className="spark-orb-post__back" type="button" aria-label="Back">
          <ArrowLeft size={32} strokeWidth={2.5} />
        </button>
        <h1>Post</h1>
      </header>

      <section className="spark-orb-post__card" aria-label="Sunny Spark Orb encounter">
        <img
          className="spark-orb-post__backdrop"
          src={`${assetBase}/park-background.png`}
          alt=""
          aria-hidden="true"
        />
        <div className="spark-orb-post__sunwash" aria-hidden="true" />

        <div className="spark-orb-post__hud spark-orb-post__hud--top">
          <button
            className="spark-orb-post__round-button"
            type="button"
            aria-label="Reset encounter"
            onClick={handleReset}
          >
            <RotateCcw size={24} strokeWidth={3} />
          </button>

          <div className="spark-orb-post__nameplate">
            <div className="spark-orb-post__creature-name">{creatureName}</div>
            <div className="spark-orb-post__stat-pill">
              {statLabel} {statValue}
            </div>
          </div>

          <div className="spark-orb-post__orb-count" aria-label={`${orbCount} Sunny orbs left`}>
            <span>ORB</span>
            <strong>{orbCount}</strong>
          </div>
        </div>

        <div className="spark-orb-post__scene" aria-hidden="true">
          <div className="spark-orb-post__creature-shadow" />
          <img
            className="spark-orb-post__creature"
            src={`${assetBase}/lumipuff.png`}
            alt=""
          />
          <div className="spark-orb-post__aura" />
          <div
            className="spark-orb-post__energy-rings"
            data-testid="spark-orb-energy-rings"
            data-active={charged ? "true" : "false"}
          >
            <span />
            <span />
            <span />
          </div>
          <div
            className="spark-orb-post__spectral-stream"
            data-testid="spark-orb-spectral-stream"
            data-active={launching ? "true" : "false"}
          >
            <span />
            <span />
            <span />
          </div>
          <img
            className="spark-orb-post__orb"
            data-testid="spark-orb"
            data-phase={phase}
            data-ready={ready ? "true" : "false"}
            data-launching={launching ? "true" : "false"}
            data-collected={collected ? "true" : "false"}
            src={`${assetBase}/spark-orb.png`}
            alt=""
          />
        </div>

        <div className="spark-orb-post__charge-panel">
          <span>Charge {chargeCount} / 3</span>
          <div className="spark-orb-post__charge-dots" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span key={index} data-filled={index < chargeCount ? "true" : "false"} />
            ))}
          </div>
        </div>

        <div className="spark-orb-post__actions">
          <button type="button" onClick={handleCharge}>
            Charge orb
          </button>
          <button type="button" onClick={handleLaunch} disabled={!ready}>
            Launch Sunny orb
          </button>
        </div>

        {collected && (
          <div
            className="spark-orb-post__collectible"
            role="dialog"
            aria-label={`${creatureName} collectible card`}
          >
            <img src={`${assetBase}/lumipuff.png`} alt="" aria-hidden="true" />
            <div>
              <span>Collected</span>
              <strong>Spark Garden friend</strong>
              <p>Collectible creature card</p>
            </div>
            <button type="button" onClick={handleCollect}>
              Collect {creatureName}
            </button>
          </div>
        )}

        <div className="spark-orb-post__encounter-gradient" aria-hidden="true" />
        <div className="spark-orb-post__chrome">
          <div className="spark-orb-post__attribution">From {attribution}</div>
          <div className="spark-orb-post__controls">
            <div className="spark-orb-post__hint">{hint}</div>
          </div>
        </div>
      </section>

      <style>{`
        .spark-orb-post {
          box-sizing: border-box;
          min-height: 100vh;
          background: #f7f9fb;
          color: #111820;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 0 12px 28px;
        }

        .spark-orb-post *,
        .spark-orb-post *::before,
        .spark-orb-post *::after {
          box-sizing: border-box;
        }

        .spark-orb-post__header {
          align-items: center;
          display: grid;
          gap: 10px;
          grid-template-columns: 46px 1fr;
          height: 76px;
          margin: 0 auto;
          max-width: 1020px;
        }

        .spark-orb-post__header h1 {
          font-size: clamp(29px, 4vw, 38px);
          font-weight: 850;
          line-height: 1;
          margin: 0;
        }

        .spark-orb-post__back,
        .spark-orb-post__round-button,
        .spark-orb-post__controls button {
          align-items: center;
          border: 0;
          color: inherit;
          cursor: pointer;
          display: inline-flex;
          justify-content: center;
          padding: 0;
        }

        .spark-orb-post__back {
          background: transparent;
          height: 44px;
          width: 44px;
        }

        .spark-orb-post__card {
          aspect-ratio: 1 / 1;
          border: 1px solid rgba(17, 24, 39, 0.13);
          border-radius: 22px;
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.12);
          display: block;
          margin: 4px auto 0;
          max-width: min(96vw, 990px);
          overflow: hidden;
          position: relative;
          width: 100%;
        }

        .spark-orb-post__backdrop,
        .spark-orb-post__sunwash,
        .spark-orb-post__encounter-gradient {
          inset: 0;
          position: absolute;
        }

        .spark-orb-post__backdrop {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }

        .spark-orb-post__sunwash {
          background:
            radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.2), transparent 29%),
            linear-gradient(180deg, rgba(12, 169, 221, 0.08), transparent 34%);
          pointer-events: none;
        }

        .spark-orb-post__hud {
          position: absolute;
          z-index: 8;
        }

        .spark-orb-post__hud--top {
          align-items: start;
          display: grid;
          grid-template-columns: 72px 1fr 72px;
          left: 26px;
          right: 26px;
          top: 26px;
        }

        .spark-orb-post__round-button,
        .spark-orb-post__orb-count {
          background: rgba(31, 46, 58, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.26);
          color: white;
          height: 58px;
          justify-self: start;
          width: 58px;
        }

        .spark-orb-post__orb-count {
          align-items: center;
          display: flex;
          flex-direction: column;
          gap: 0;
          justify-content: center;
          justify-self: end;
          line-height: 1;
        }

        .spark-orb-post__orb-count span {
          color: rgba(255, 255, 255, 0.82);
          font-size: 12px;
          font-weight: 850;
        }

        .spark-orb-post__orb-count strong {
          color: #ffffff;
          font-size: 23px;
          font-weight: 900;
        }

        .spark-orb-post__nameplate {
          color: #ffffff;
          justify-self: center;
          text-align: center;
          text-shadow: 0 3px 10px rgba(15, 23, 42, 0.52);
        }

        .spark-orb-post__creature-name {
          font-size: clamp(35px, 5vw, 48px);
          font-weight: 900;
          line-height: 1.02;
        }

        .spark-orb-post__stat-pill {
          background: rgba(31, 46, 58, 0.82);
          border-radius: 999px;
          box-shadow: 0 7px 15px rgba(15, 23, 42, 0.26);
          display: inline-flex;
          font-size: 18px;
          font-weight: 900;
          line-height: 1;
          margin-top: 8px;
          padding: 9px 20px 10px;
        }

        .spark-orb-post__scene {
          inset: 0;
          position: absolute;
          z-index: 3;
        }

        .spark-orb-post__creature {
          filter: drop-shadow(0 18px 28px rgba(72, 58, 114, 0.28));
          left: 50%;
          position: absolute;
          top: 38%;
          transform: translate(-50%, -50%);
          width: clamp(220px, 35%, 360px);
        }

        .spark-orb-post[data-phase="ready"] .spark-orb-post__creature,
        .spark-orb-post[data-phase="collected"] .spark-orb-post__creature {
          animation: sparkOrbCreatureBounce 1.8s ease-in-out infinite;
        }

        .spark-orb-post[data-phase="launching"] .spark-orb-post__creature {
          transform: translate(-48%, -50%) rotate(-6deg) scale(0.96);
        }

        .spark-orb-post__creature-shadow {
          background: rgba(35, 67, 42, 0.24);
          border-radius: 999px;
          filter: blur(5px);
          height: 18px;
          left: 50%;
          position: absolute;
          top: 62%;
          transform: translateX(-50%);
          width: 132px;
        }

        .spark-orb-post__aura {
          border: 2px solid rgba(197, 253, 255, 0.55);
          border-radius: 999px;
          box-shadow:
            0 0 42px rgba(120, 235, 255, 0.32),
            inset 0 0 40px rgba(255, 255, 255, 0.34);
          height: clamp(138px, 20vw, 218px);
          left: 50%;
          opacity: 0;
          position: absolute;
          top: 41%;
          transform: translate(-50%, -50%) scale(0.9);
          transition:
            opacity 220ms ease,
            transform 220ms ease;
          width: clamp(138px, 20vw, 218px);
        }

        .spark-orb-post__energy-rings {
          bottom: calc(11% - 12px);
          height: clamp(138px, 21%, 204px);
          left: 50%;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          transform: translateX(-50%) scale(0.84);
          transition:
            bottom 420ms cubic-bezier(0.2, 0.7, 0.2, 1),
            opacity 180ms ease,
            transform 420ms cubic-bezier(0.2, 0.7, 0.2, 1);
          width: clamp(138px, 21%, 204px);
          z-index: 4;
        }

        .spark-orb-post__energy-rings::before,
        .spark-orb-post__energy-rings::after {
          border-radius: 999px;
          content: "";
          inset: 14%;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          transition: opacity 180ms ease;
        }

        .spark-orb-post__energy-rings::before {
          background:
            radial-gradient(circle at 50% 50%, rgba(255, 244, 172, 0.34), transparent 34%),
            conic-gradient(
              from 140deg,
              transparent 0 14%,
              rgba(110, 255, 234, 0.72) 18%,
              transparent 24% 56%,
              rgba(198, 131, 255, 0.7) 62%,
              transparent 68%
            );
          filter: blur(5px);
        }

        .spark-orb-post__energy-rings::after {
          border: 1px solid rgba(255, 239, 126, 0.54);
          box-shadow:
            0 0 20px rgba(113, 255, 236, 0.46),
            0 0 34px rgba(197, 113, 255, 0.32);
          transform: rotate(-18deg) scaleX(1.34) scaleY(0.42);
        }

        .spark-orb-post__energy-rings span {
          border-radius: 999px;
          inset: 0;
          position: absolute;
        }

        .spark-orb-post__energy-rings span:nth-child(1) {
          background:
            conic-gradient(
              from 20deg,
              transparent 0 18%,
              rgba(124, 255, 241, 0.92) 21%,
              transparent 25% 47%,
              rgba(255, 232, 104, 0.92) 50%,
              transparent 55% 78%,
              rgba(185, 118, 255, 0.82) 82%,
              transparent 88%
            );
          filter: blur(1px);
          mask: radial-gradient(circle, transparent 55%, #000 58%, #000 64%, transparent 68%);
        }

        .spark-orb-post__energy-rings span:nth-child(2) {
          border: 2px solid rgba(143, 248, 255, 0.5);
          box-shadow:
            0 0 22px rgba(91, 245, 255, 0.48),
            inset 0 0 22px rgba(255, 255, 255, 0.18);
          transform: scale(1.12);
        }

        .spark-orb-post__energy-rings span:nth-child(3) {
          background:
            radial-gradient(circle at 50% 4%, rgba(255, 239, 119, 0.95) 0 4px, transparent 6px),
            radial-gradient(circle at 90% 50%, rgba(133, 255, 243, 0.92) 0 4px, transparent 6px),
            radial-gradient(circle at 20% 75%, rgba(202, 142, 255, 0.85) 0 3px, transparent 5px);
        }

        .spark-orb-post__energy-rings[data-active="true"] {
          animation: sparkOrbRingThrum 0.92s ease-in-out infinite;
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }

        .spark-orb-post__energy-rings[data-active="true"]::before {
          animation: sparkOrbCoreFlicker 0.58s ease-in-out infinite;
          opacity: 1;
        }

        .spark-orb-post__energy-rings[data-active="true"]::after {
          animation: sparkOrbCrossCurrent 0.72s ease-in-out infinite;
          opacity: 1;
        }

        .spark-orb-post__energy-rings[data-active="true"] span:nth-child(1) {
          animation: sparkOrbRingSpin 1.3s linear infinite;
        }

        .spark-orb-post__energy-rings[data-active="true"] span:nth-child(2) {
          animation: sparkOrbRingPulse 1.1s ease-in-out infinite;
        }

        .spark-orb-post__energy-rings[data-active="true"] span:nth-child(3) {
          animation: sparkOrbSparkOrbit 1.75s linear infinite;
        }

        .spark-orb-post[data-phase="ready"] .spark-orb-post__aura,
        .spark-orb-post[data-phase="launching"] .spark-orb-post__aura,
        .spark-orb-post[data-phase="collected"] .spark-orb-post__aura {
          animation: sparkOrbAuraPulse 1.15s ease-in-out infinite;
          opacity: 0.78;
          transform: translate(-50%, -50%) scale(1);
        }

        .spark-orb-post[data-phase="launching"] .spark-orb-post__energy-rings,
        .spark-orb-post[data-phase="collected"] .spark-orb-post__energy-rings {
          bottom: 41%;
          transform: translateX(-50%) rotate(18deg) scale(0.98);
        }

        .spark-orb-post__spectral-stream {
          height: clamp(220px, 30vw, 330px);
          left: 50%;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          top: 42%;
          transform: translate(-50%, -3%) rotate(-7deg) scaleY(0.55);
          transform-origin: 50% 100%;
          transition:
            opacity 140ms ease,
            transform 260ms ease;
          width: clamp(92px, 12vw, 138px);
          z-index: 4;
        }

        .spark-orb-post__spectral-stream span {
          border-radius: 999px;
          left: 50%;
          position: absolute;
          top: 0;
          transform: translateX(-50%);
        }

        .spark-orb-post__spectral-stream span:nth-child(1) {
          background:
            linear-gradient(
              0deg,
              rgba(255, 226, 86, 0.04),
              rgba(94, 255, 241, 0.62) 32%,
              rgba(255, 249, 190, 0.94) 66%,
              rgba(175, 109, 255, 0.22)
            );
          box-shadow:
            0 0 28px rgba(94, 255, 241, 0.44),
            0 0 42px rgba(255, 230, 94, 0.34);
          filter: blur(2.4px);
          height: 100%;
          width: 36%;
        }

        .spark-orb-post__spectral-stream span:nth-child(2) {
          background:
            repeating-linear-gradient(
              0deg,
              rgba(255, 248, 171, 0.86) 0 8px,
              rgba(105, 255, 234, 0.32) 8px 15px,
              transparent 15px 25px
            );
          filter: blur(0.4px);
          height: 92%;
          width: 10%;
        }

        .spark-orb-post__spectral-stream span:nth-child(3) {
          border: 2px solid rgba(129, 255, 235, 0.52);
          box-shadow: 0 0 18px rgba(114, 255, 235, 0.42);
          height: 46%;
          top: 34%;
          width: 80%;
        }

        .spark-orb-post__spectral-stream[data-active="true"] {
          animation: sparkOrbStreamWobble 0.34s ease-in-out infinite;
          opacity: 1;
          transform: translate(-50%, -3%) rotate(-7deg) scaleY(1);
        }

        .spark-orb-post__spectral-stream::before,
        .spark-orb-post__spectral-stream::after {
          border-radius: 999px;
          content: "";
          height: 92%;
          left: 50%;
          opacity: 0;
          position: absolute;
          top: 6%;
          transform-origin: 50% 100%;
          transition: opacity 140ms ease;
          width: 18px;
        }

        .spark-orb-post__spectral-stream::before {
          background: linear-gradient(0deg, transparent, rgba(102, 255, 236, 0.82), transparent);
          filter: blur(2px);
          transform: translateX(-50%) rotate(-23deg);
        }

        .spark-orb-post__spectral-stream::after {
          background: linear-gradient(0deg, transparent, rgba(255, 223, 87, 0.88), transparent);
          filter: blur(2.4px);
          transform: translateX(-50%) rotate(21deg);
        }

        .spark-orb-post__spectral-stream[data-active="true"]::before {
          animation: sparkOrbLeftCurrent 0.5s ease-in-out infinite;
          opacity: 1;
        }

        .spark-orb-post__spectral-stream[data-active="true"]::after {
          animation: sparkOrbRightCurrent 0.46s ease-in-out infinite;
          opacity: 1;
        }

        .spark-orb-post__spectral-stream[data-active="true"] span:nth-child(2) {
          animation: sparkOrbStreamScan 0.38s linear infinite;
        }

        .spark-orb-post__orb {
          bottom: 11%;
          filter:
            drop-shadow(0 20px 20px rgba(8, 51, 68, 0.22))
            drop-shadow(0 0 18px rgba(255, 220, 94, 0.28));
          left: 50%;
          position: absolute;
          transform: translateX(-50%);
          transition:
            bottom 420ms cubic-bezier(0.2, 0.7, 0.2, 1),
            filter 220ms ease,
            opacity 220ms ease,
            transform 420ms cubic-bezier(0.2, 0.7, 0.2, 1);
          width: clamp(112px, 17%, 170px);
        }

        .spark-orb-post__orb[data-phase="idle"] {
          filter: grayscale(0.45) brightness(0.86) drop-shadow(0 13px 16px rgba(8, 51, 68, 0.16));
          opacity: 0.82;
        }

        .spark-orb-post__orb[data-phase="charge-1"] {
          filter: saturate(1.08) drop-shadow(0 16px 18px rgba(8, 51, 68, 0.2));
        }

        .spark-orb-post__orb[data-phase="charge-2"] {
          filter:
            saturate(1.16)
            drop-shadow(0 18px 20px rgba(8, 51, 68, 0.22))
            drop-shadow(0 0 16px rgba(255, 221, 80, 0.3));
        }

        .spark-orb-post__orb[data-ready="true"] {
          animation: sparkOrbReadyPulse 0.64s ease-in-out infinite;
          filter:
            saturate(1.25)
            drop-shadow(0 20px 20px rgba(8, 51, 68, 0.22))
            drop-shadow(0 0 28px rgba(255, 228, 93, 0.58));
        }

        .spark-orb-post__orb[data-launching="true"] {
          bottom: 42%;
          transform: translateX(-50%) rotate(18deg) scale(0.82);
        }

        .spark-orb-post__orb[data-collected="true"] {
          bottom: 41%;
          opacity: 0.1;
          transform: translateX(-50%) scale(1.3);
        }

        .spark-orb-post__charge-panel {
          align-items: center;
          background: rgba(7, 18, 25, 0.68);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          bottom: 118px;
          color: white;
          display: inline-flex;
          gap: 12px;
          left: 50%;
          padding: 10px 16px;
          position: absolute;
          transform: translateX(-50%);
          z-index: 9;
        }

        .spark-orb-post__charge-panel span:first-child {
          font-size: 15px;
          font-weight: 850;
          line-height: 1;
          white-space: nowrap;
        }

        .spark-orb-post__charge-dots {
          display: inline-flex;
          gap: 6px;
        }

        .spark-orb-post__charge-dots span {
          background: rgba(255, 255, 255, 0.28);
          border-radius: 999px;
          height: 10px;
          width: 10px;
        }

        .spark-orb-post__charge-dots span[data-filled="true"] {
          background: #ffe46b;
          box-shadow: 0 0 12px rgba(255, 228, 107, 0.62);
        }

        .spark-orb-post__actions {
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          display: block;
          height: 1px;
          overflow: hidden;
          position: absolute;
          white-space: nowrap;
          width: 1px;
        }

        .spark-orb-post__actions button,
        .spark-orb-post__collectible button {
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 999px;
          color: #10202d;
          cursor: pointer;
          font-size: 13px;
          font-weight: 850;
          padding: 10px 14px;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }

        .spark-orb-post__actions button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .spark-orb-post__collectible {
          align-items: center;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(231, 252, 255, 0.9));
          border: 1px solid rgba(255, 255, 255, 0.72);
          border-radius: 18px;
          box-shadow: 0 22px 54px rgba(16, 24, 40, 0.24);
          color: #112334;
          display: grid;
          gap: 13px;
          grid-template-columns: 82px 1fr;
          left: 50%;
          max-width: min(84%, 390px);
          padding: 16px;
          position: absolute;
          top: 47%;
          transform: translate(-50%, -50%);
          width: 390px;
          z-index: 11;
        }

        .spark-orb-post__collectible img {
          filter: drop-shadow(0 10px 14px rgba(89, 77, 131, 0.2));
          width: 82px;
        }

        .spark-orb-post__collectible span {
          color: #0e8f9f;
          display: block;
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
        }

        .spark-orb-post__collectible strong {
          display: block;
          font-size: 26px;
          font-weight: 950;
          line-height: 1.05;
          margin-top: 5px;
        }

        .spark-orb-post__collectible p {
          color: #526170;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.2;
          margin: 5px 0 0;
        }

        .spark-orb-post__collectible button {
          grid-column: 1 / -1;
          justify-self: stretch;
        }

        .spark-orb-post__encounter-gradient {
          background: linear-gradient(180deg, transparent 56%, rgba(0, 0, 0, 0.74));
          pointer-events: none;
          z-index: 6;
        }

        .spark-orb-post__chrome {
          bottom: 18px;
          color: #ffffff;
          left: 26px;
          position: absolute;
          right: 26px;
          z-index: 12;
        }

        .spark-orb-post__attribution {
          background: rgba(0, 0, 0, 0.76);
          border-radius: 7px;
          display: inline-flex;
          font-size: 22px;
          font-weight: 850;
          line-height: 1;
          margin-bottom: 16px;
          padding: 8px 11px 9px;
        }

        .spark-orb-post__controls {
          align-items: center;
          display: flex;
          gap: 17px;
          min-height: 56px;
        }

        .spark-orb-post__hint {
          background: rgba(0, 0, 0, 0.46);
          border-radius: 999px;
          color: rgba(255, 255, 255, 0.76);
          flex: 0 1 360px;
          font-size: 17px;
          font-weight: 850;
          line-height: 1;
          max-width: 360px;
          overflow: hidden;
          padding: 13px 20px;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @keyframes sparkOrbReadyPulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
          }
          45% {
            transform: translateX(-50%) scale(1.08);
          }
          55% {
            transform: translateX(-50%) scale(1.04) rotate(-2deg);
          }
        }

        @keyframes sparkOrbCreatureBounce {
          0%, 100% {
            transform: translate(-50%, -50%);
          }
          50% {
            transform: translate(-50%, -53%);
          }
        }

        @keyframes sparkOrbAuraPulse {
          0%, 100% {
            box-shadow:
              0 0 42px rgba(120, 235, 255, 0.32),
              inset 0 0 40px rgba(255, 255, 255, 0.34);
          }
          50% {
            box-shadow:
              0 0 64px rgba(255, 232, 104, 0.45),
              inset 0 0 58px rgba(130, 255, 238, 0.4);
          }
        }

        @keyframes sparkOrbRingSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes sparkOrbRingPulse {
          0%, 100% {
            opacity: 0.62;
            transform: scale(1.02);
          }
          50% {
            opacity: 1;
            transform: scale(1.22);
          }
        }

        @keyframes sparkOrbRingThrum {
          0%, 100% {
            filter: drop-shadow(0 0 10px rgba(94, 255, 241, 0.4));
          }
          50% {
            filter: drop-shadow(0 0 26px rgba(255, 232, 104, 0.76));
          }
        }

        @keyframes sparkOrbSparkOrbit {
          to {
            transform: rotate(-360deg);
          }
        }

        @keyframes sparkOrbCoreFlicker {
          0%, 100% {
            transform: scale(0.96);
          }
          50% {
            transform: scale(1.08);
          }
        }

        @keyframes sparkOrbCrossCurrent {
          0%, 100% {
            transform: rotate(-18deg) scaleX(1.34) scaleY(0.42);
          }
          50% {
            transform: rotate(18deg) scaleX(1.42) scaleY(0.5);
          }
        }

        @keyframes sparkOrbStreamWobble {
          0%, 100% {
            filter: drop-shadow(0 0 12px rgba(99, 255, 239, 0.42));
          }
          50% {
            filter: drop-shadow(0 0 28px rgba(255, 232, 104, 0.7));
          }
        }

        @keyframes sparkOrbLeftCurrent {
          0%, 100% {
            transform: translateX(-50%) rotate(-24deg) scaleY(0.98);
          }
          50% {
            transform: translateX(-50%) rotate(-15deg) scaleY(1.06);
          }
        }

        @keyframes sparkOrbRightCurrent {
          0%, 100% {
            transform: translateX(-50%) rotate(22deg) scaleY(0.98);
          }
          50% {
            transform: translateX(-50%) rotate(12deg) scaleY(1.08);
          }
        }

        @keyframes sparkOrbStreamScan {
          to {
            background-position-y: -40px;
          }
        }

        @media (max-width: 720px) {
          .spark-orb-post {
            padding-left: 0;
            padding-right: 0;
          }

          .spark-orb-post__header {
            padding: 0 12px;
          }

          .spark-orb-post__card {
            border-left: 0;
            border-radius: 0;
            border-right: 0;
            max-width: 100vw;
          }

          .spark-orb-post__hud--top {
            grid-template-columns: 54px 1fr 54px;
            left: 14px;
            right: 14px;
            top: 18px;
          }

          .spark-orb-post__round-button,
          .spark-orb-post__orb-count {
            height: 50px;
            width: 50px;
          }

          .spark-orb-post__charge-panel {
            bottom: 102px;
          }

          .spark-orb-post__chrome {
            bottom: 10px;
            left: 14px;
            right: 14px;
          }

          .spark-orb-post__hint {
            display: none;
          }

          .spark-orb-post__attribution {
            font-size: 17px;
          }
        }
      `}</style>
    </div>
  );
}
