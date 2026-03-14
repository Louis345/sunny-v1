import { motion } from "framer-motion";

interface Props {
  childName: string;
  companionName: string;
  companionText: string;
  interimTranscript: string;
  correctStreak: number;
  accentColor: string;
  accentBg: string;
  onBargeIn: () => void;
  onEndSession: () => void;
}

export function CompanionStrip({
  childName,
  companionName,
  companionText,
  interimTranscript,
  correctStreak,
  accentColor,
  accentBg,
  onBargeIn,
  onEndSession,
}: Props) {
  return (
    <div className="w-[220px] h-full bg-gray-50 border-r border-gray-200 flex flex-col items-center p-5 gap-4 shrink-0">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
        style={{ backgroundColor: accentBg }}
      >
        {childName === "Ila" ? "🌟" : "📚"}
      </div>
      <div className="text-sm font-medium text-gray-900">{companionName}</div>

      <div className="w-full bg-white border border-gray-200 rounded-lg p-3 min-h-[80px]">
        <div className="text-xs text-gray-500 mb-1">{companionName} says:</div>
        <div className="text-sm text-gray-900 leading-relaxed">
          {companionText || "..."}
        </div>
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

      <div className="flex flex-col gap-2">
        <button
          onClick={onBargeIn}
          className="w-14 h-14 rounded-full bg-white border-2 border-blue-400 
                     flex items-center justify-center hover:bg-blue-50 
                     active:scale-95 transition-transform"
          aria-label="Microphone / Interrupt"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C10.34 2 9 3.34 9 5V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V5C15 3.34 13.66 2 12 2Z"
              fill="#378ADD"
            />
            <path
              d="M6 10V12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12V10"
              stroke="#378ADD"
              strokeWidth="1.5"
              fill="none"
            />
            <line
              x1="12"
              y1="18"
              x2="12"
              y2="22"
              stroke="#378ADD"
              strokeWidth="1.5"
            />
          </svg>
        </button>

        <button
          onClick={onEndSession}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          End session
        </button>
      </div>
    </div>
  );
}
