import { useEffect, useState } from "react";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";

export type ChildExperiencePacketState = {
  packet: ChildExperiencePacket | null;
  loading: boolean;
  error: string | null;
  questBossPreparation: QuestBossPreparationStatus | null;
};

export type QuestBossArtifactLifecycleStatus =
  | "brief_only"
  | "generating"
  | "validating"
  | "ready_for_review"
  | "approved_ready"
  | "failed_retryable"
  | "failed_final"
  | "retired"
  | "generated"
  | "validated"
  | "failed";

export type QuestBossPreparationStatus = {
  ok: true;
  childId: string;
  jobs: Array<{
    childId: string;
    homeworkId?: string;
    briefId: string;
    kind: "quest" | "boss";
    status: QuestBossArtifactLifecycleStatus;
  }>;
  running: string[];
  briefs: Array<{
    briefId: string;
    kind: "quest" | "boss";
    status: QuestBossArtifactLifecycleStatus;
  }>;
};

async function fetchPacket(childId: string): Promise<ChildExperiencePacket> {
  const res = await fetch(`/api/child-experience/${encodeURIComponent(childId)}`);
  if (!res.ok) throw new Error(`child_experience_${res.status}`);
  return res.json() as Promise<ChildExperiencePacket>;
}

async function postQuestBossPreparation(childId: string): Promise<QuestBossPreparationStatus> {
  const res = await fetch("/api/homework/quest-boss/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childId }),
  });
  if (!res.ok) throw new Error(`quest_boss_prepare_${res.status}`);
  return res.json() as Promise<QuestBossPreparationStatus>;
}

async function fetchQuestBossPreparationStatus(childId: string): Promise<QuestBossPreparationStatus> {
  const res = await fetch(`/api/homework/quest-boss/status?childId=${encodeURIComponent(childId)}`);
  if (!res.ok) throw new Error(`quest_boss_status_${res.status}`);
  return res.json() as Promise<QuestBossPreparationStatus>;
}

function shouldPoll(status: QuestBossPreparationStatus): boolean {
  if (status.running.length > 0 || status.jobs.length > 0) return true;
  return status.briefs.some((brief) =>
    brief.status === "brief_only" ||
    brief.status === "generating" ||
    brief.status === "validating" ||
    brief.status === "failed_retryable",
  );
}

function shouldReloadPacket(status: QuestBossPreparationStatus): boolean {
  return status.briefs.some((brief) =>
    brief.status === "ready_for_review" ||
    brief.status === "approved_ready" ||
    brief.status === "failed_final" ||
    brief.status === "retired",
  );
}

export function useChildExperiencePacket(
  childId: string | null,
  enabled: boolean,
): ChildExperiencePacketState {
  const [state, setState] = useState<ChildExperiencePacketState>({
    packet: null,
    loading: false,
    error: null,
    questBossPreparation: null,
  });

  useEffect(() => {
    const resolvedChildId = childId?.trim().toLowerCase() ?? "";
    if (!enabled || !resolvedChildId) {
      setState({ packet: null, loading: false, error: null, questBossPreparation: null });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;
    setState({ packet: null, loading: true, error: null, questBossPreparation: null });

    const loadPacket = () =>
      fetchPacket(resolvedChildId)
      .then((packet) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, packet, loading: false, error: null }));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setState((prev) => ({ ...prev, packet: null, loading: false, error: message }));
        }
      });

    const pollPreparation = () => {
      if (cancelled) return;
      pollCount += 1;
      if (pollCount > 120) {
        console.warn(" 🎮 [child-experience] [quest-boss-prep-poll-guard]", { childId: resolvedChildId });
        return;
      }
      void fetchQuestBossPreparationStatus(resolvedChildId)
        .then((status) => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, questBossPreparation: status }));
          if (shouldReloadPacket(status)) {
            void loadPacket();
          }
          if (shouldPoll(status)) {
            timer = setTimeout(pollPreparation, 5000);
          }
        })
        .catch((err: unknown) => {
          console.warn(" 🎮 [child-experience] [quest-boss-prep-status-failed]", {
            childId: resolvedChildId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    };

    void loadPacket();
    void postQuestBossPreparation(resolvedChildId)
      .then((status) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, questBossPreparation: status }));
        if (shouldPoll(status)) {
          timer = setTimeout(pollPreparation, 5000);
        }
      })
      .catch((err: unknown) => {
        console.warn(" 🎮 [child-experience] [quest-boss-prep-start-failed]", {
          childId: resolvedChildId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [childId, enabled]);

  return state;
}
