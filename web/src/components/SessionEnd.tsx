import { useEffect } from "react";
import { motion } from "framer-motion";

interface Props {
  onReturn: () => void;
  childName?: string | null;
  companionName?: string | null;
  autoReturnMs?: number;
}

export function SessionEnd({
  onReturn,
  childName,
  companionName,
  autoReturnMs = 5000,
}: Props) {
  useEffect(() => {
    const t = setTimeout(onReturn, autoReturnMs);
    return () => clearTimeout(t);
  }, [onReturn, autoReturnMs]);

  const greeting = childName
    ? `Great job today, ${childName}!`
    : "Great job today.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gray-50"
    >
      <div className="text-center">
        <h1 className="text-3xl font-medium text-gray-900">Session complete!</h1>
        <p className="text-gray-600 mt-2">
          {greeting}
          {companionName && (
            <span className="block text-sm mt-1">
              {companionName} is proud of you.
            </span>
          )}
        </p>
      </div>

      <button
        onClick={onReturn}
        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Start new session
      </button>

      <p className="text-xs text-gray-400">
        Returning to picker in {autoReturnMs / 1000} seconds...
      </p>
    </motion.div>
  );
}
