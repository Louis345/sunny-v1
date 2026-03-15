import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import LottieRaw from "lottie-react";
const Lottie = (LottieRaw as unknown as { default: typeof LottieRaw }).default ?? LottieRaw;

function unescapeSvg(svg: string | undefined): string {
  if (!svg) return "";
  return svg
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

interface CanvasState {
  mode: "idle" | "teaching" | "reward" | "riddle" | "championship";
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
}

interface RewardEvent {
  rewardStyle: "flash" | "takeover" | "none";
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  displayDuration_ms: number;
}

interface Props {
  canvas: CanvasState;
  reward: RewardEvent | null;
  sessionPhase: string;
  sessionState: string;
  accentColor?: string;
  onCanvasDone: () => void;
}

function RewardTakeover({
  reward,
}: {
  reward: RewardEvent & { svg?: string; lottieData?: Record<string, unknown>; label?: string };
}) {
  const showContent = reward?.lottieData || reward?.svg;
  if (!showContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-white flex flex-col items-center justify-center z-10 p-8"
    >
      {reward?.lottieData ? (
        <Lottie
          animationData={reward.lottieData}
          loop={false}
          autoplay={true}
          style={{ width: 320, height: 320 }}
        />
      ) : reward?.svg ? (
        <div
          className="max-w-full max-h-full"
          dangerouslySetInnerHTML={{ __html: unescapeSvg(reward.svg) }}
        />
      ) : null}
      {reward?.label && (
        <div className="absolute bottom-8 text-lg font-medium text-gray-700">
          {reward.label}
        </div>
      )}
    </motion.div>
  );
}

function isMath(content: string): boolean {
  return /[\d+\-×÷=]/.test(content) && content.length < 12;
}

function TeachingContent({
  content,
  phonemeBoxes,
  label,
  canvasSvg,
}: {
  content: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  label?: string;
  canvasSvg?: string;
}) {
  const nunito = { fontFamily: "'Nunito', sans-serif", fontWeight: 900 };

  if (isMath(content)) {
    const tokens = content.split(/\s+/).filter(Boolean);
    const parts: { type: "num" | "op" | "q"; text: string }[] = [];
    for (const t of tokens) {
      if (/^[\d]+$/.test(t)) parts.push({ type: "num", text: t });
      else if (/^[+\-×÷=]$/.test(t)) parts.push({ type: "op", text: t });
    }
    if (parts.length > 0 && parts[parts.length - 1]?.type !== "op") {
      parts.push({ type: "op", text: "=" });
    }
    parts.push({ type: "q", text: "?" });

    return (
      <div className="space-y-6">
        {canvasSvg && (
          <div
            className="mx-auto max-w-md"
            dangerouslySetInnerHTML={{ __html: unescapeSvg(canvasSvg) }}
          />
        )}
        <div
          className="canvas-content flex flex-row items-center justify-center gap-4"
          style={nunito}
        >
          {parts.map((p, i) => (
            <span
              key={i}
              className={p.type === "q" ? "q-pulse" : ""}
              style={{
                fontSize:
                  p.type === "num"
                    ? "10rem"
                    : p.type === "op"
                      ? "7rem"
                      : "8rem",
                color:
                  p.type === "op"
                    ? "#6366f1"
                    : p.type === "q"
                      ? "#EF9F27"
                      : "#1a1a2e",
                lineHeight: 1,
              }}
            >
              {p.text}
            </span>
          ))}
        </div>
        {label && (
          <p className="text-center text-xl font-medium text-gray-900">
            {label}
          </p>
        )}
      </div>
    );
  }

  const letters = content.split("");
  const boxes = phonemeBoxes ?? [];

  return (
    <div className="space-y-6">
      {canvasSvg && (
        <div
          className="mx-auto max-w-md"
          dangerouslySetInnerHTML={{ __html: unescapeSvg(canvasSvg) }}
        />
      )}
      {boxes.length > 0 ? (
        <div className="canvas-content flex justify-center items-center gap-4">
          {boxes.map((b, i) => (
            <div
              key={i}
              className="flex items-center justify-center rounded-xl transition-transform duration-200 ease-out"
              style={{
                minWidth: 100,
                minHeight: 120,
                border: `4px solid ${b.highlighted ? "#EF9F27" : "#CBD5E1"}`,
                background: b.highlighted ? "#FFF9F0" : "white",
                transform: b.highlighted ? "scale(1.08)" : "scale(1)",
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 900,
                fontSize: "5rem",
                color: "#1a1a2e",
                lineHeight: 1,
              }}
            >
              {b.value}
            </div>
          ))}
        </div>
      ) : (
        <div className="canvas-content flex justify-center items-end gap-1">
          {letters.map((letter, i) => {
            const activeBox = boxes.find((b) => b.highlighted);
            const activeIndex = activeBox
              ? activeBox.position === "first"
                ? 0
                : activeBox.position === "last"
                  ? letters.length - 1
                  : Math.floor(letters.length / 2)
              : -1;
            const isActive = i === activeIndex;
            return (
              <span
                key={i}
                className="letter-bounce"
                style={{
                  fontSize: "9rem",
                  lineHeight: 1,
                  color: isActive ? "#EF9F27" : "#1a1a2e",
                  borderBottom: isActive
                    ? "6px solid #EF9F27"
                    : "6px solid transparent",
                  paddingBottom: "4px",
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 900,
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      )}
      {label && (
        <p className="text-center text-xl font-medium text-gray-900">
          {label}
        </p>
      )}
    </div>
  );
}

function CanvasRewardVisual({
  svg,
  lottieData,
}: {
  svg?: string;
  lottieData?: Record<string, unknown>;
}) {
  if (lottieData) {
    return (
      <div className="canvas-content mx-auto mb-4 max-w-[200px]">
        <Lottie
          animationData={lottieData}
          loop={false}
          autoplay={true}
          style={{ width: 200, height: 200 }}
        />
      </div>
    );
  }
  if (svg) {
    return (
      <div
        className="canvas-content mx-auto mb-4 max-w-[200px]"
        dangerouslySetInnerHTML={{ __html: unescapeSvg(svg) }}
      />
    );
  }
  return null;
}

function spawnParticles(
  container: HTMLElement | null,
  count: number,
  color: string,
) {
  if (!container) return;
  container.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "particle";
    el.style.cssText = `
      position: absolute;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: ${color};
      left: 50%; top: 50%;
      pointer-events: none;
    `;
    container.appendChild(el);

    const angle = (i / count) * Math.PI * 2;
    const dist = 80 + Math.random() * 60;
    gsap.fromTo(
      el,
      { x: 0, y: 0, opacity: 1, scale: 1 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        opacity: 0,
        scale: 0.3,
        duration: 0.8 + Math.random() * 0.4,
        ease: "power2.out",
        delay: Math.random() * 0.1,
      },
    );
  }
}

export function Canvas({
  canvas,
  reward,
  sessionPhase,
  sessionState,
  accentColor = "#854F0B",
  onCanvasDone,
}: Props) {
  const [displayContent, setDisplayContent] = useState("");
  const [riddleLabel, setRiddleLabel] = useState("");
  const [displayMode, setDisplayMode] = useState<CanvasState["mode"]>("idle");
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const particlesRef = useRef<HTMLDivElement>(null);

  const showReward =
    reward?.rewardStyle === "takeover" && (reward.svg || reward.lottieData);
  const showFlash = reward?.rewardStyle === "flash";

  const runAnimation = useCallback(
    (payload: CanvasState) => {
      const { mode, content, label } = payload;
      const text = content ?? label ?? "";

      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
      gsap.killTweensOf(".canvas-content");

      switch (mode) {
        case "teaching": {
          setDisplayContent(text);
          setDisplayMode("teaching");
          setRiddleLabel("");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { scale: 0.3, opacity: 0, y: -40 },
                {
                  scale: 1,
                  opacity: 1,
                  y: 0,
                  duration: 0.4,
                  ease: "elastic.out(1, 0.5)",
                },
              );
              setTimeout(() => onCanvasDone(), 400);
            });
          });
          break;
        }
        case "riddle": {
          setDisplayMode("riddle");
          setDisplayContent("");
          setRiddleLabel(label ?? "");
          let i = 0;
          typewriterRef.current = setInterval(() => {
            i++;
            setDisplayContent(text.slice(0, i));
            if (i >= text.length) {
              if (typewriterRef.current) {
                clearInterval(typewriterRef.current);
                typewriterRef.current = null;
              }
              onCanvasDone();
            }
          }, 18);
          break;
        }
        case "reward": {
          setDisplayContent(label ?? text);
          setDisplayMode("reward");
          setRiddleLabel("");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { scale: 1.4, opacity: 0 },
                { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" },
              );
              spawnParticles(particlesRef.current, 12, "#FFD700");
              setTimeout(() => onCanvasDone(), 800);
            });
          });
          break;
        }
        case "championship": {
          setDisplayContent(label ?? text);
          setDisplayMode("championship");
          setRiddleLabel("");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { scale: 0, rotation: -15, opacity: 0 },
                {
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                  duration: 0.6,
                  ease: "elastic.out(1, 0.4)",
                },
              );
              spawnParticles(particlesRef.current, 20, "#FFD700");
              setTimeout(() => onCanvasDone(), 1200);
            });
          });
          break;
        }
        default:
          setDisplayContent("");
          setDisplayMode("idle");
          setRiddleLabel("");
      }
    },
    [onCanvasDone],
  );

  useEffect(() => {
    const hasContent =
      canvas.content ||
      canvas.label ||
      ((canvas.svg || canvas.lottieData) &&
        (canvas.mode === "reward" || canvas.mode === "championship"));
    if (
      canvas.mode !== "idle" &&
      hasContent &&
      (canvas.mode === "teaching" ||
        canvas.mode === "riddle" ||
        canvas.mode === "reward" ||
        canvas.mode === "championship")
    ) {
      runAnimation(canvas);
    } else if (canvas.mode === "idle") {
      setDisplayContent("");
      setDisplayMode("idle");
      setRiddleLabel("");
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    }
    return () => {
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
      }
    };
  }, [canvas, runAnimation]);

  const showAnimatedContent =
    displayMode === "teaching" ||
    displayMode === "riddle" ||
    displayMode === "reward" ||
    displayMode === "championship";
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white overflow-hidden relative">
      <style>{`@keyframes letterBounce { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } .letter-bounce { animation: letterBounce 0.3s ease-out backwards; } @keyframes qPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } } .q-pulse { animation: qPulse 1.5s ease-in-out infinite; } @keyframes riddleTilt { 0%, 100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } } .riddle-emoji { animation: riddleTilt 2s ease-in-out infinite; }`}</style>
      {sessionState === "LOADING" && (
        <div
          className="thinking-indicator"
          style={{ ["--accent" as string]: accentColor }}
        >
          <span />
          <span />
          <span />
        </div>
      )}
      {showFlash && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-yellow-200/80 flex items-center justify-center z-20"
        >
          <span className="text-6xl">⭐</span>
        </motion.div>
      )}

      {showReward && reward && (
        <RewardTakeover reward={reward} />
      )}

      <div
        className="canvas-wrapper w-full max-w-2xl flex flex-col items-center justify-center"
        style={{ position: "relative", minHeight: 200 }}
        data-mode={displayMode}
      >
        {canvas.mode === "idle" && !showAnimatedContent && (
          <div
            className="flex flex-col items-center justify-center gap-4 select-none"
            style={{ fontFamily: "'Nunito', sans-serif" }}
          >
            <div className="text-8xl">🌟</div>
            <div className="text-xl font-medium text-gray-400 tracking-wide">
              Ready when you are
            </div>
          </div>
        )}

        {displayMode === "teaching" &&
        (canvas.phonemeBoxes?.length || displayContent) ? (
          <TeachingContent
            content={displayContent}
            phonemeBoxes={canvas.phonemeBoxes}
            label={canvas.label}
            canvasSvg={canvas.svg}
          />
        ) : showAnimatedContent ? (
          <div className="text-center w-full">
            {displayMode === "riddle" && (
              <div className="space-y-4">
                <div
                  className="riddle-emoji text-6xl"
                  style={{ fontSize: "5rem" }}
                >
                  🤔
                </div>
                <p
                  className="text-2xl font-bold"
                  style={{
                    fontFamily: "'Nunito', sans-serif",
                    fontWeight: 900,
                    color: "#6366f1",
                  }}
                >
                  Can you solve this riddle?
                </p>
                <div
                  className="mx-auto max-w-[560px] rounded-[20px] px-8 py-6"
                  style={{
                    background: "#fef3c7",
                    border: "3px solid #FCD34D",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#92400e",
                    lineHeight: 1.6,
                    textAlign: "center",
                  }}
                >
                  {displayContent}
                </div>
                {riddleLabel && (
                  <p className="text-sm text-gray-500">{riddleLabel}</p>
                )}
              </div>
            )}
            {(displayMode === "reward" || displayMode === "championship") && (
              <div className="space-y-4">
                {(canvas.svg || canvas.lottieData) && (
                  <CanvasRewardVisual
                    svg={canvas.svg}
                    lottieData={canvas.lottieData}
                  />
                )}
                <p
                  className="canvas-content text-3xl font-bold"
                  style={{
                    fontFamily: "'Nunito', sans-serif",
                    fontWeight: 900,
                    color:
                      displayMode === "championship" ? "#EF9F27" : "#1a1a2e",
                  }}
                >
                  {displayContent}
                </p>
              </div>
            )}
          </div>
        ) : null}

        <div
          ref={particlesRef}
          className="canvas-particles"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        />
      </div>

      {sessionPhase && sessionPhase !== "warmup" && (
        <div className="mt-6 text-center text-sm text-gray-400">
          Phase: {sessionPhase}
        </div>
      )}
    </div>
  );
}
