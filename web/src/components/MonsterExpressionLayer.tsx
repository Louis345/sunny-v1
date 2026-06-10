import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { CapturedMonsterConfig } from "./capturedMonsterCatalog";
import {
  assertBlinkLoopGuard,
  getBlinkPhaseDurationMs,
  getBlinkSequenceSteps,
  hasBlinkFrames,
  pickBlinkIntervalMs,
  pickBlinkSequence,
  shouldDoubleBlink,
  type BlinkPhase,
  type MonsterExpressionState,
} from "../utils/monsterBlinkTiming";

export type { MonsterExpressionState };

export interface MonsterExpressionLayerProps {
  creature: CapturedMonsterConfig;
  expressionState: MonsterExpressionState;
  blinkRandom?: () => number;
  testIds?: {
    layer?: string;
    blink?: string;
  };
}

const DOUBLE_BLINK_GAP_MS = 220;
const warnedCreatureIds = new Set<string>();

function warnMissingBlinkFrames(creatureId: string): void {
  if (warnedCreatureIds.has(creatureId)) return;
  warnedCreatureIds.add(creatureId);
  console.warn(
    ` 🎮 [monster-expression] [blink-frames-missing] [skipped] creature=${creatureId}`,
  );
}

export function MonsterExpressionLayer({
  creature,
  expressionState,
  blinkRandom,
  testIds,
}: MonsterExpressionLayerProps): ReactElement | null {
  const blink = creature.expression.blink;
  const random = blinkRandom ?? Math.random;

  if (blink.mode !== "frame-swap" || !hasBlinkFrames(blink.frames)) {
    warnMissingBlinkFrames(creature.id);
    return null;
  }

  const [blinkFrame, setBlinkFrame] = useState<BlinkPhase>("open");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopCountRef = useRef(0);
  const previousExpressionRef = useRef(expressionState);

  const clearBlinkTimeout = useCallback((): void => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const runBlinkRef = useRef<((options?: { forceDouble?: boolean }) => void) | null>(null);

  const scheduleNextBlink = useCallback((): void => {
    const interval = pickBlinkIntervalMs(expressionState, blink.timing, random);
    timeoutRef.current = setTimeout(() => {
      runBlinkRef.current?.();
    }, interval);
  }, [blink.timing, expressionState, random]);

  const runBlink = useCallback(
    (options?: { forceDouble?: boolean }): void => {
      loopCountRef.current += 1;
      assertBlinkLoopGuard(loopCountRef.current);
      clearBlinkTimeout();

      const sequence = pickBlinkSequence(expressionState, random);
      const steps = getBlinkSequenceSteps(sequence);
      let stepIndex = 0;

      const advanceStep = (): void => {
        if (stepIndex >= steps.length) {
          loopCountRef.current = 0;
          setBlinkFrame("open");
          const double =
            options?.forceDouble ?? shouldDoubleBlink(blink.timing, random);
          if (double) {
            timeoutRef.current = setTimeout(() => {
              runBlinkRef.current?.({ forceDouble: false });
            }, DOUBLE_BLINK_GAP_MS);
            return;
          }
          scheduleNextBlink();
          return;
        }

        const phase = steps[stepIndex];
        setBlinkFrame(phase);
        const holdMs = getBlinkPhaseDurationMs(
          phase,
          expressionState,
          blink.timing,
          sequence,
        );
        stepIndex += 1;
        timeoutRef.current = setTimeout(advanceStep, holdMs);
      };

      advanceStep();
    },
    [blink.timing, clearBlinkTimeout, expressionState, random, scheduleNextBlink],
  );

  runBlinkRef.current = runBlink;

  useEffect(() => {
    loopCountRef.current = 0;
    setBlinkFrame("open");
    clearBlinkTimeout();
    scheduleNextBlink();
    return () => {
      clearBlinkTimeout();
    };
  }, [clearBlinkTimeout, creature.id, expressionState, scheduleNextBlink]);

  useEffect(() => {
    if (previousExpressionRef.current === expressionState) return;
    previousExpressionRef.current = expressionState;
    loopCountRef.current = 0;
    runBlinkRef.current?.();
  }, [expressionState]);

  const frameSrc =
    blinkFrame === "half"
      ? blink.frames.half
      : blinkFrame === "closed"
        ? blink.frames.closed
        : undefined;

  return (
    <>
      <span
        className="monster-expression-layer"
        data-testid={testIds?.layer}
        data-expression-state={expressionState}
        data-blink-mode={blink.mode}
        data-blink-frame={blinkFrame}
      >
        {frameSrc ? (
          <img
            className="monster-expression-layer__frame"
            data-testid={testIds?.blink}
            src={frameSrc}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <span
            className="monster-expression-layer__frame-placeholder"
            data-testid={testIds?.blink}
            aria-hidden="true"
          />
        )}
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

      .monster-expression-layer__frame,
      .monster-expression-layer__frame-placeholder {
        height: 100%;
        left: 0;
        position: absolute;
        top: 0;
        width: 100%;
      }

      .monster-expression-layer__frame {
        object-fit: contain;
        opacity: 1;
        transition: opacity 40ms ease-out;
      }

      .monster-expression-layer[data-blink-frame="open"] .monster-expression-layer__frame {
        opacity: 0;
        pointer-events: none;
      }
    `}</style>
  );
}
