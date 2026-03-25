import { motion } from "framer-motion";

interface Props {
  childName: string;
  companionName: string;
  companionText: string;
  interimTranscript: string;
  correctStreak: number;
  sessionState: string;
  accentColor: string;
  accentBg: string;
  micMuted: boolean;
  onToggleMicMute: () => void;
  onBargeIn: () => void;
  onEndSession: () => void;
}

export function CompanionStrip({
  childName,
  companionName,
  companionText,
  interimTranscript,
  correctStreak,
  sessionState,
  accentColor,
  accentBg,
  micMuted,
  onToggleMicMute,
  onBargeIn,
  onEndSession,
}: Props) {
  const isSpeaking = sessionState === "SPEAKING";
  const isThinking = sessionState === "LOADING" || sessionState === "PROCESSING" || sessionState === "CANVAS_PENDING";
  return (
    <div className="w-[220px] h-full bg-gray-50 border-r border-gray-200 flex flex-col items-center p-5 gap-4 shrink-0">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
        style={{ backgroundColor: accentBg }}
      >
        {childName === "Ila" ? "🌟" : "📚"}
      </div>
      <div className="text-sm font-medium text-gray-900">{companionName}</div>

      <div className="w-full bg-white border border-gray-200 rounded-lg p-3 min-h-[80px] max-h-[420px] overflow-y-auto flex flex-col justify-center">
        {isSpeaking ? (
          // Speaking: show animated waveform — text will appear after audio finishes
          <div className="flex items-center justify-center gap-1 py-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full"
                style={{ backgroundColor: accentColor }}
                animate={{ height: ["6px", "20px", "6px"] }}
                transition={{
                  duration: 0.7,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        ) : isThinking ? (
          // Thinking: subtle pulsing dots
          <div className="flex items-center justify-center gap-1.5 py-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-gray-300"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        ) : (
          // Idle: show last completed response — text only appears after audio is done
          <>
            <div className="text-xs text-gray-500 mb-1">{companionName} says:</div>
            <div className="text-sm text-gray-900 leading-relaxed break-words">
              {companionText || "..."}
            </div>
          </>
        )}
      </div>

      {interimTranscript && (
        <div className="w-full text-xs text-gray-400 italic text-center">
          &quot;{interimTranscript}&quot;
        </div>
      )}

      <div className="flex-1" />

      {correctStreak > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md"
          style={{ backgroundColor: accentBg }}
        >
          <span className="text-sm">⭐</span>
          <span className="text-sm font-medium" style={{ color: accentColor }}>
            {correctStreak} correct
          </span>
        </motion.div>
      )}

      <div className="flex flex-col gap-2 items-center">
        <button
          type="button"
          onClick={onToggleMicMute}
          className={`w-14 h-14 rounded-full bg-white border-2 flex items-center justify-center
                     active:scale-95 transition-transform ${
                       micMuted
                         ? "border-red-500 hover:bg-red-50"
                         : "border-green-500 hover:bg-green-50"
                     }`}
          aria-label={micMuted ? "Microphone muted — tap to unmute" : "Microphone on — tap to mute"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C10.34 2 9 3.34 9 5V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V5C15 3.34 13.66 2 12 2Z"
              fill={micMuted ? "#ef4444" : "#22c55e"}
            />
            <path
              d="M6 10V12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12V10"
              stroke={micMuted ? "#ef4444" : "#22c55e"}
              strokeWidth="1.5"
              fill="none"
            />
            <line
              x1="12"
              y1="18"
              x2="12"
              y2="22"
              stroke={micMuted ? "#ef4444" : "#22c55e"}
              strokeWidth="1.5"
            />
            {micMuted && (
              <line
                x1="4"
                y1="4"
                x2="20"
                y2="20"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>

        <button
          type="button"
          onClick={onBargeIn}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Interrupt
        </button>

        <button
          type="button"
          onClick={onEndSession}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          End session
        </button>
      </div>
    </div>
  );
}
