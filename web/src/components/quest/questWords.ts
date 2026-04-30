import type { NodeConfig } from "../../../../src/shared/adventureTypes";

export function questBriefingWordsFromMap(
  nodes: readonly NodeConfig[],
  reinforceWords: readonly string[],
): string[] {
  const fresh = reinforceWords.map((w) => String(w).trim()).filter(Boolean);
  if (fresh.length > 0) return fresh;
  const questNode = nodes.find((n) => n.type === "quest");
  return (questNode?.words ?? []).map((w) => String(w).trim()).filter(Boolean);
}

