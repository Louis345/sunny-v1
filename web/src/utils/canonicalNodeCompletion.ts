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

export async function flushDiscoveryAttemptWrites(
  writes: ReadonlyArray<Promise<unknown>>,
): Promise<void> {
  const results = await Promise.allSettled(writes);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error(`discovery_attempt_writes_failed:${failures.length}`);
  }
}

/**
 * Discovery attempts are academic facts and must settle before completion.
 * Engagement is deliberately absent: it is a separate optional evidence stream
 * and cannot gate this academic handoff.
 */
export async function runDiscoveryAcademicCompletion<T>(input: {
  attemptWrites: ReadonlyArray<Promise<unknown>>;
  completeAcademic: () => Promise<T>;
}): Promise<T> {
  await flushDiscoveryAttemptWrites(input.attemptWrites);
  return input.completeAcademic();
}

type DiscoveryAttemptWrite = {
  send: () => Promise<unknown>;
  promise: Promise<unknown>;
  status: "pending" | "succeeded" | "failed";
};

/**
 * Owns the Discovery evidence barrier for one iframe run. Attempts are sent
 * immediately, failed writes receive one bounded retry per completion request,
 * and evaluation completion seals the run against out-of-order late facts.
 */
export class DiscoveryAcademicCompletionCoordinator {
  private attempts: DiscoveryAttemptWrite[] = [];
  private completionPromise: Promise<unknown> | null = null;
  private sealed = false;

  recordAttempt(send: () => Promise<unknown>): Promise<unknown> {
    if (this.sealed) {
      return Promise.reject(new Error("discovery_attempt_after_completion"));
    }
    const entry = {
      send,
      promise: Promise.resolve(),
      status: "pending" as const,
    };
    this.attempts.push(entry);
    return this.startWrite(entry);
  }

  complete<T>(completeAcademic: () => Promise<T>): Promise<T> {
    if (this.completionPromise) return this.completionPromise as Promise<T>;
    this.sealed = true;
    const completion = this.flushWithBoundedRetry()
      .then(completeAcademic)
      .then((result) => {
        this.attempts = [];
        return result;
      });
    this.completionPromise = completion;
    void completion.catch(() => {
      if (this.completionPromise === completion) this.completionPromise = null;
    });
    return completion;
  }

  private startWrite(entry: DiscoveryAttemptWrite): Promise<unknown> {
    entry.status = "pending";
    entry.promise = Promise.resolve()
      .then(entry.send)
      .then(
        (result) => {
          entry.status = "succeeded";
          return result;
        },
        (error: unknown) => {
          entry.status = "failed";
          throw error;
        },
      );
    return entry.promise;
  }

  private async flushWithBoundedRetry(): Promise<void> {
    await Promise.allSettled(this.attempts.map((entry) => entry.promise));
    const failed = this.attempts.filter((entry) => entry.status === "failed");
    if (failed.length > 0) {
      await Promise.allSettled(failed.map((entry) => this.startWrite(entry)));
    }
    const remainingFailures = this.attempts.filter((entry) => entry.status === "failed");
    if (remainingFailures.length > 0) {
      throw new Error(`discovery_attempt_writes_failed:${remainingFailures.length}`);
    }
  }
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
