import { useEffect, useState } from "react";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";

export type ChildExperiencePacketState = {
  packet: ChildExperiencePacket | null;
  loading: boolean;
  error: string | null;
};

export function useChildExperiencePacket(
  childId: string | null,
  enabled: boolean,
): ChildExperiencePacketState {
  const [state, setState] = useState<ChildExperiencePacketState>({
    packet: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    const resolvedChildId = childId?.trim().toLowerCase() ?? "";
    if (!enabled || !resolvedChildId) {
      setState({ packet: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ packet: null, loading: true, error: null });
    fetch(`/api/child-experience/${encodeURIComponent(resolvedChildId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`child_experience_${res.status}`);
        return res.json() as Promise<ChildExperiencePacket>;
      })
      .then((packet) => {
        if (!cancelled) {
          setState({ packet, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setState({ packet: null, loading: false, error: message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [childId, enabled]);

  return state;
}
