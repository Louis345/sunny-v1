import { useCallback, useState } from "react";
import type { MapState, SessionTheme } from "../../../src/shared/adventureTypes";

/** TASK-011 red stub — missing onNodeClick etc. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useMapSession(_childId: string): {
  mapState: MapState | null;
  theme: SessionTheme | null;
  connectionStatus: "idle" | "connecting" | "open" | "error";
} {
  return {
    mapState: null,
    theme: null,
    connectionStatus: "idle",
  };
}
