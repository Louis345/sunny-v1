import { getReward, getTool, REWARD_GAMES, TEACHING_TOOLS } from "./registry";

export interface ResolvedLaunchGameRequest {
  ok: boolean;
  requestedName: string;
  canonicalName?: string;
  type: "tool" | "reward";
  reason?: string;
  availableGames: string[];
}

function normalizeRequestedName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\s+/g, "-");
}

function candidateNames(name: string): string[] {
  const normalized = normalizeRequestedName(name);
  const withoutSuffix = normalized
    .replace(/-game$/i, "")
    .replace(/-tool$/i, "")
    .replace(/-activity$/i, "");

  const candidates = [normalized, withoutSuffix];

  if (withoutSuffix === "bd-reversal") {
    candidates.push("bd-reversal");
  }
  if (withoutSuffix === "coin-counter") {
    candidates.push("coin-counter");
  }
  if (withoutSuffix === "space-invaders") {
    candidates.push("space-invaders");
  }
  if (withoutSuffix === "asteroids") {
    candidates.push("asteroid");
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function listAvailableGames(type: "tool" | "reward"): string[] {
  return Object.keys(type === "tool" ? TEACHING_TOOLS : REWARD_GAMES).sort();
}

export function resolveLaunchGameRequest(
  args: { name: string; type: "tool" | "reward" },
): ResolvedLaunchGameRequest {
  const requestedName = String(args.name ?? "").trim();
  const availableGames = listAvailableGames(args.type);

  for (const candidate of candidateNames(requestedName)) {
    const entry = args.type === "tool" ? getTool(candidate) : getReward(candidate);
    if (entry) {
      return {
        ok: true,
        requestedName,
        canonicalName: candidate,
        type: args.type,
        availableGames,
      };
    }
  }

  return {
    ok: false,
    requestedName,
    type: args.type,
    reason: `Unknown ${args.type} game`,
    availableGames,
  };
}
