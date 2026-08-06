import { useCallback, useEffect, useRef, useState } from "react";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";

export type ChildExperiencePacketState = {
  packet: ChildExperiencePacket | null;
  loading: boolean;
  error: string | null;
  refreshPacket: () => Promise<ChildExperiencePacket | null>;
};

type ChildExperiencePacketSnapshot = Omit<ChildExperiencePacketState, "refreshPacket">;

async function fetchPacket(childId: string): Promise<ChildExperiencePacket> {
  const res = await fetch(`/api/child-experience/${encodeURIComponent(childId)}`);
  if (!res.ok) throw new Error(`child_experience_${res.status}`);
  return res.json() as Promise<ChildExperiencePacket>;
}

export function useChildExperiencePacket(
  childId: string | null,
  enabled: boolean,
): ChildExperiencePacketState {
  const [state, setState] = useState<ChildExperiencePacketSnapshot>({
    packet: null,
    loading: false,
    error: null,
  });
  const reloadRef = useRef<(() => Promise<ChildExperiencePacket | null>) | null>(null);
  const refreshPacket = useCallback(
    () => reloadRef.current?.() ?? Promise.resolve(null),
    [],
  );

  useEffect(() => {
    const resolvedChildId = childId?.trim().toLowerCase() ?? "";
    if (!enabled || !resolvedChildId) {
      setState({ packet: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ packet: null, loading: true, error: null });

    const loadPacket = () =>
      fetchPacket(resolvedChildId)
      .then((packet) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, packet, loading: false, error: null }));
        }
        return packet;
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setState((prev) => ({ ...prev, packet: null, loading: false, error: message }));
        }
        return null;
      });
    reloadRef.current = loadPacket;

    void loadPacket();

    return () => {
      cancelled = true;
      if (reloadRef.current === loadPacket) reloadRef.current = null;
    };
  }, [childId, enabled]);

  return { ...state, refreshPacket };
}
