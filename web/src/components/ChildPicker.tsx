import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
}

interface Props {
  onSelect: (childName: string) => void;
}

export function ChildPicker({ onSelect }: Props) {
  const [companions, setCompanions] = useState<CompanionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanions = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/companions")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load companions");
        return r.json();
      })
      .then(setCompanions)
      .catch((err) => setError(err?.message ?? "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchCompanions();
  }, [fetchCompanions]);

  const colors: Record<string, { bg: string; text: string; badge: string }> = {
    Ila: { bg: "#FAEEDA", text: "#854F0B", badge: "#EF9F27" },
    Reina: { bg: "#E6F1FB", text: "#0C447C", badge: "#85B7EB" },
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white">
        <div className="animate-pulse text-4xl">🌟</div>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-red-600 text-center">{error}</p>
        <button
          onClick={fetchCompanions}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Try again
        </button>
      </div>
    );
  }

  if (companions.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-gray-600 text-center">No companions available.</p>
        <button
          onClick={fetchCompanions}
          className="px-4 py-2 text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 bg-white relative">
      <div className="text-center">
        <h1 className="text-3xl font-medium text-gray-900">
          Who's learning today?
        </h1>
        <p className="text-sm text-gray-500 mt-1">Tap your name to start</p>
      </div>

      <div className="flex gap-10">
        {companions.map((c) => {
          const color = colors[c.childName] ?? colors.Ila;
          return (
            <motion.button
              key={c.childName}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(c.childName)}
              className="w-60 h-64 rounded-xl border-2 border-gray-200 bg-gray-50 
                         flex flex-col items-center justify-center gap-3
                         hover:border-blue-400 transition-colors"
            >
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
                style={{ backgroundColor: color.bg }}
              >
                {c.emoji ?? "🌟"}
              </div>

              <div className="text-center">
                <div className="text-2xl font-medium text-gray-900">
                  {c.childName}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  with {c.companionName}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="absolute bottom-3 text-xs text-gray-400">
        Project Sunny
      </div>
    </div>
  );
}
