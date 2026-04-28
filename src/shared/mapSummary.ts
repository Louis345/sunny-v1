import { NODE_DISPLAY_LABELS } from "./nodeRegistry";

export const MAP_SUMMARY_NATURAL_USE_INSTRUCTION = `Use the map summary to inform what you say naturally.
Never recite node names literally. React with genuine curiosity.
Reference what is coming up in a way that feels exciting, not clinical.`;

export type MapSummaryNode = Readonly<{
  type: string;
  isGoal?: boolean;
}>;

/** Plain-text map overview for the companion prompt (no child-specific logic). */
export function buildMapSummaryFromPendingNodes(nodes: ReadonlyArray<MapSummaryNode>): string {
  if (!nodes.length) return "";
  const first = nodes[0];
  const lines = [
    `The session map has ${nodes.length} nodes:`,
    ...nodes.map((n, i) => {
      const label = NODE_DISPLAY_LABELS[n.type as keyof typeof NODE_DISPLAY_LABELS] ?? n.type;
      const start = i === 0 ? " ← START HERE" : "";
      const boss = i === nodes.length - 1 ? " ← BOSS" : "";
      return `  ${i + 1}. ${n.type} (${label})${start}${boss}`;
    }),
    "",
    `The child should start with node 1: ${first?.type ?? "unknown"}.`,
    first?.type === "word-radar"
      ? "This is a spelling evaluation. Encourage the child to tap it first."
      : "",
  ].filter((line) => line.length > 0);
  return lines.join("\n");
}
