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
  childName?: string;
}

export function Canvas({ canvas, reward, sessionPhase, childName = "Ila" }: Props) {
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
            <div
              className="text-8xl"
              style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.08))" }}
            >
              {childName === "Ila" ? "🌟" : "📚"}
            </div>
            <div className="text-xl font-medium text-gray-400 tracking-wide">
              {childName === "Ila" ? "Ready when you are" : "Let's explore something"}
            </div>
            <div
              className="mt-2 w-12 h-1 rounded-full"
              style={{ backgroundColor: childName === "Ila" ? "#EF9F27" : "#85B7EB", opacity: 0.5 }}
            />
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
            {(canvas.content || canvas.label) && (
              <p className="text-center text-xl font-medium text-gray-900">
                {canvas.content ?? canvas.label}
              </p>
            )}
            {canvas.phonemeBoxes && canvas.phonemeBoxes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {canvas.phonemeBoxes.map((box, i) => (
                  <div
                    key={i}
                    className={`px-4 py-2 rounded-lg border-2 text-lg font-mono ${
                      box.highlighted
                        ? "border-blue-500 bg-blue-50 text-blue-900"
                        : "border-gray-200 bg-gray-50 text-gray-700"
                    }`}
                  >
                    {box.value}
                  </div>
                ))}
              </div>
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
