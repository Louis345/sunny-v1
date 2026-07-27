export type CanonicalNodeCompletionInput = {
  childId: string;
  homeworkId: string;
  nodeId: string;
  result: Record<string, unknown> & {
    completed?: boolean;
    accuracy?: number;
    timeSpent_ms?: number;
  };
};

export function hasCanonicalLearningCycle(packet: {
  childChart?: { learningCycle?: unknown };
} | null | undefined): boolean {
  return packet?.childChart?.learningCycle != null;
}

export async function postCanonicalNodeCompletion(input: CanonicalNodeCompletionInput): Promise<{
  lifecycle: string;
  revision: number;
}> {
  const response = await fetch("/api/learning-cycle/node-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`canonical_node_completion_${response.status}`);
  const result = await response.json() as { lifecycle: string; revision: number };
  window.dispatchEvent(new CustomEvent("sunny_learning_cycle_progression", { detail: result }));
  return result;
}
