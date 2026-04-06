import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
}

interface Props {
  /** `diagKiosk` uses child=creator + Charlotte on the server (diagnostic prompt). */
  onSelect: (childName: string, options?: { diagKiosk?: boolean }) => void;
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
    creator: { bg: "#1e1b2e", text: "#f5e9c9", badge: "#fbbf24" },
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

      <div className="flex flex-wrap justify-center items-start gap-8 max-w-5xl px-4">
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
              <img
                src={`/characters/${c.childName.toLowerCase()}.png`}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = "/characters/star.png";
                }}
                className="w-24 h-24 rounded-full object-cover"
                style={{
                  border: `3px solid ${color.badge}`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                }}
              />

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

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect("creator", { diagKiosk: true })}
          className="relative w-52 h-56 rounded-xl border-2 border-amber-400/90
                     bg-gradient-to-b from-[#1a1528] via-[#231d35] to-[#2e2645]
                     flex flex-col items-center justify-center gap-2 px-3
                     shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_24px_rgba(0,0,0,0.35)]
                     hover:border-amber-300 transition-colors"
        >
          <span
            className="absolute top-2 right-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 border border-amber-400/50"
            aria-hidden
          >
            ⚡ Dev
          </span>
          <img
            src="/characters/star.png"
            alt=""
            className="w-20 h-20 rounded-full object-cover opacity-95"
            style={{
              border: "3px solid rgba(251, 191, 36, 0.85)",
              boxShadow: "0 0 16px rgba(251, 191, 36, 0.25)",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="text-center mt-1">
            <div
              className="text-xl font-semibold text-amber-50"
              style={{ fontFamily: "'Lexend', sans-serif" }}
            >
              Creator
            </div>
            <div
              className="text-sm text-amber-200/85 mt-0.5"
              style={{ fontFamily: "'Lexend', sans-serif" }}
            >
              Diagnostic mode
            </div>
          </div>
        </motion.button>
      </div>

      <div className="absolute bottom-3 text-xs text-gray-400">
        Project Sunny
      </div>
    </div>
  );
}
