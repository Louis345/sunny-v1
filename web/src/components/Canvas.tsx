import { motion } from "framer-motion";

interface CanvasState {
  mode: "idle" | "teaching" | "reward" | "riddle" | "championship";
  svg?: string;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
}

interface RewardEvent {
  rewardStyle: "flash" | "takeover" | "none";
  svg?: string;
  label?: string;
  displayDuration_ms: number;
}

interface Props {
  canvas: CanvasState;
  reward: RewardEvent | null;
  sessionPhase: string;
}

export function Canvas({ canvas, reward, sessionPhase }: Props) {
  const showReward = reward?.rewardStyle === "takeover" && reward.svg;
  const showFlash = reward?.rewardStyle === "flash";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white overflow-auto">
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

      {showReward && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-white flex items-center justify-center z-10 p-8"
        >
          <div
            className="max-w-full max-h-full"
            dangerouslySetInnerHTML={{ __html: reward.svg ?? "" }}
          />
          {reward.label && (
            <div className="absolute bottom-8 text-lg font-medium text-gray-700">
              {reward.label}
            </div>
          )}
        </motion.div>
      )}

      <div className="w-full max-w-2xl">
        {canvas.mode === "idle" && (
          <div className="flex flex-col items-center justify-center gap-4 select-none">
            <div className="text-8xl">🌟</div>
            <div className="text-xl font-medium text-gray-400 tracking-wide">
              Ready when you are
            </div>
          </div>
        )}

        {canvas.mode === "teaching" && (
          <div className="space-y-6">
            {canvas.svg && (
              <div
                className="mx-auto max-w-md"
                dangerouslySetInnerHTML={{ __html: canvas.svg }}
              />
            )}
            {canvas.content &&
              (() => {
                const word = canvas.content;
                const boxes = canvas.phonemeBoxes ?? [];
                const activeBox = boxes.find((b) => b.highlighted);

                const activeIndex = activeBox
                  ? activeBox.position === "first"
                    ? 0
                    : activeBox.position === "last"
                      ? word.length - 1
                      : Math.floor(word.length / 2)
                  : -1;

                return (
                  <div className="flex justify-center items-end gap-1">
                    {word.split("").map((letter, i) => {
                      const isActive = i === activeIndex;
                      return (
                        <span
                          key={i}
                          className="font-bold font-mono transition-all duration-200"
                          style={{
                            fontSize: "6rem",
                            lineHeight: 1,
                            color: isActive ? "#EF9F27" : "#111827",
                            borderBottom: isActive
                              ? "6px solid #EF9F27"
                              : "6px solid transparent",
                            paddingBottom: "4px",
                          }}
                        >
                          {letter}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            {canvas.label && (
              <p className="text-center text-xl font-medium text-gray-900">
                {canvas.label}
              </p>
            )}
          </div>
        )}

        {canvas.mode === "riddle" && (
          <div className="text-center">
            <p className="text-2xl font-medium text-gray-900">Riddle time!</p>
            <p className="text-gray-600 mt-2">Can you solve it?</p>
          </div>
        )}

        {canvas.mode === "championship" && (
          <div className="text-center">
            <p className="text-2xl font-medium text-gray-900">Championship!</p>
            <p className="text-gray-600 mt-2">You did great!</p>
          </div>
        )}

        {sessionPhase && sessionPhase !== "warmup" && (
          <div className="mt-6 text-center text-sm text-gray-400">
            Phase: {sessionPhase}
          </div>
        )}
      </div>
    </div>
  );
}
