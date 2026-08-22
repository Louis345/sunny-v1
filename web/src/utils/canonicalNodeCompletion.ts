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

async function postDiscovery(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`discovery_evidence_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export function postDiscoveryAttempt(input: { childId: string; homeworkId: string; attempt: Record<string, unknown> }): Promise<Record<string, unknown>> {
  return postDiscovery(`/api/learning/${encodeURIComponent(input.childId)}/assignments/${encodeURIComponent(input.homeworkId)}/discovery/attempt`, input.attempt);
}

export function postDiscoveryComplete(input: { childId: string; homeworkId: string }): Promise<Record<string, unknown>> {
  return postDiscovery(`/api/learning/${encodeURIComponent(input.childId)}/assignments/${encodeURIComponent(input.homeworkId)}/discovery/complete`, {});
}

export async function postCanonicalNodeCompletion(input: CanonicalNodeCompletionInput): Promise<{
  lifecycle: string;
  revision: number;
  coinAward?: { amount: number; balance: number };
  videoCallTicket?: { homeworkId: string; earnedAt: string; bonusUrl?: string };
}> {
  const response = await fetch("/api/learning-cycle/node-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`canonical_node_completion_${response.status}`);
  const result = await response.json() as {
    lifecycle: string;
    revision: number;
    coinAward?: { amount: number; balance: number };
    videoCallTicket?: { homeworkId: string; earnedAt: string; bonusUrl?: string };
  };
  window.dispatchEvent(new CustomEvent("sunny_learning_cycle_progression", { detail: result }));
  return result;
}
