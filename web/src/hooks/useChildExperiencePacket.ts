import { useCallback, useEffect, useRef, useState } from "react";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";

export type ChildExperiencePacketState = {
  packet: ChildExperiencePacket | null;
  loading: boolean;
  error: string | null;
  refreshPacket: () => Promise<ChildExperiencePacket | null>;
};

type ChildExperiencePacketSnapshot = Omit<ChildExperiencePacketState, "refreshPacket"> & {scope:string|null};

async function fetchPacket(childId: string): Promise<ChildExperiencePacket> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`/api/child-experience/${encodeURIComponent(childId)}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`child_experience_${res.status}`);
    return await res.json() as ChildExperiencePacket;
  } finally {
    clearTimeout(deadline);
  }
}

export function useChildExperiencePacket(
  childId: string | null,
  enabled: boolean,
): ChildExperiencePacketState {
  const scope = enabled ? childId?.trim().toLowerCase() || null : null;
  const [state, setState] = useState<ChildExperiencePacketSnapshot>({
    scope:null,
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
    if (!scope) {
      setState({ scope, packet: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ scope, packet: null, loading: true, error: null });

    const loadPacket = () =>
      fetchPacket(scope)
      .then((packet) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, packet, loading: false, error: null }));
        }
        return packet;
      })
      .catch((err: unknown) => {
        console.warn(" 🎮 [child-experience] [refresh] [unavailable]", err);
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setState((prev) => ({ ...prev, loading: false, error: message }));
        }
        return null;
      });
    reloadRef.current = loadPacket;

    void loadPacket();

    return () => {
      cancelled = true;
      if (reloadRef.current === loadPacket) reloadRef.current = null;
    };
  }, [scope]);

  return scope === state.scope
    ? {packet:state.packet,loading:state.loading,error:state.error,refreshPacket}
    : {packet:null,loading:Boolean(scope),error:null,refreshPacket};
}
