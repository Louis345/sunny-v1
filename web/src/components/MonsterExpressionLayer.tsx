import type { CSSProperties, ReactElement } from "react";
import type { CapturedMonsterConfig } from "./capturedMonsterCatalog";

export type MonsterExpressionState = "idle" | "alert" | "happy" | "sleepy";

export interface MonsterExpressionLayerProps {
  creature: CapturedMonsterConfig;
  expressionState: MonsterExpressionState;
  testIds?: {
    layer?: string;
    blink?: string;
  };
}

function blinkCycleForExpression(
  expressionState: MonsterExpressionState,
  cadenceMs: readonly [number, number],
): number {
  const [minCadence, maxCadence] = cadenceMs;
  if (expressionState === "alert") return Math.round(minCadence * 0.78);
  if (expressionState === "happy") return Math.round((minCadence + maxCadence) * 0.36);
  if (expressionState === "sleepy") return Math.round(maxCadence * 0.88);
  return Math.round((minCadence + maxCadence) / 2);
}

export function MonsterExpressionLayer({
  creature,
  expressionState,
  testIds,
}: MonsterExpressionLayerProps): ReactElement {
  const blink = creature.expression.blink;
  const style = {
    "--monster-eye-top": blink.eyeMask.top,
    "--monster-eye-left": blink.eyeMask.left,
    "--monster-eye-width": blink.eyeMask.width,
    "--monster-eye-height": blink.eyeMask.height,
    "--monster-blink-cycle": `${blinkCycleForExpression(expressionState, blink.cadenceMs)}ms`,
    "--monster-blink-cycle-min": `${blink.cadenceMs[0]}ms`,
    "--monster-blink-cycle-max": `${blink.cadenceMs[1]}ms`,
    "--monster-eyelid-color": blink.eyelidColor,
    "--monster-blink-opacity": String(blink.opacity),
  } as CSSProperties;

  return (
    <>
      <span
        className="monster-expression-layer"
        data-testid={testIds?.layer}
        data-expression-state={expressionState}
        data-blink-mode={blink.mode}
        style={style}
      >
        <span
          className="monster-expression-layer__blink"
          data-testid={testIds?.blink}
          aria-hidden="true"
        />
      </span>
      <MonsterExpressionLayerStyles />
    </>
  );
}

function MonsterExpressionLayerStyles(): ReactElement {
  return (
    <style>{`
      .monster-expression-layer {
        inset: 0;
        pointer-events: none;
        position: absolute;
        z-index: 5;
      }

      .monster-expression-layer__blink {
        height: var(--monster-eye-height);
        left: var(--monster-eye-left);
        opacity: 0;
        position: absolute;
        top: var(--monster-eye-top);
        transform: scaleY(0.08);
        transform-origin: 50% 50%;
        width: var(--monster-eye-width);
      }

      .monster-expression-layer__blink::before,
      .monster-expression-layer__blink::after {
        background:
          radial-gradient(ellipse at 50% 42%, rgba(255, 255, 255, 0.2), transparent 34%),
          var(--monster-eyelid-color);
        border-radius: 999px;
        content: "";
        filter: blur(0.2px);
        height: 100%;
        opacity: var(--monster-blink-opacity);
        position: absolute;
        top: 0;
        width: 28%;
      }

      .monster-expression-layer__blink::before {
        left: 16%;
      }

      .monster-expression-layer__blink::after {
        right: 16%;
      }

      .monster-expression-layer[data-blink-mode="css-overlay"][data-expression-state="idle"] .monster-expression-layer__blink {
        animation: monsterExpressionBlink var(--monster-blink-cycle) ease-in-out infinite;
      }

      .monster-expression-layer[data-blink-mode="css-overlay"][data-expression-state="alert"] .monster-expression-layer__blink {
        animation: monsterExpressionAlertBlink var(--monster-blink-cycle) ease-in-out infinite;
      }

      .monster-expression-layer[data-blink-mode="css-overlay"][data-expression-state="happy"] .monster-expression-layer__blink {
        animation: monsterExpressionHappyBlink var(--monster-blink-cycle) ease-in-out infinite;
      }

      .monster-expression-layer[data-blink-mode="css-overlay"][data-expression-state="sleepy"] .monster-expression-layer__blink {
        animation: monsterExpressionSleepyBlink var(--monster-blink-cycle) ease-in-out infinite;
      }

      @keyframes monsterExpressionBlink {
        0%, 88%, 100% {
          opacity: 0;
          transform: scaleY(0.08);
        }
        91%, 94% {
          opacity: 0.92;
          transform: scaleY(0.88);
        }
      }

      @keyframes monsterExpressionAlertBlink {
        0%, 72%, 100% {
          opacity: 0;
          transform: scaleY(0.08);
        }
        75%, 79% {
          opacity: 0.96;
          transform: scaleY(0.72);
        }
      }

      @keyframes monsterExpressionHappyBlink {
        0%, 78%, 100% {
          opacity: 0;
          transform: translateY(0) scaleY(0.06);
        }
        82%, 88% {
          opacity: 0.78;
          transform: translateY(2%) scaleY(0.46);
        }
      }

      @keyframes monsterExpressionSleepyBlink {
        0%, 52%, 100% {
          opacity: 0.72;
          transform: translateY(2%) scaleY(0.64);
        }
        62%, 72% {
          opacity: 0;
          transform: translateY(0) scaleY(0.08);
        }
      }
    `}</style>
  );
}
