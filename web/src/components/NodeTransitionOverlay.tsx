import type { ReactNode } from "react";

export type NodeTransitionOverlayProps = {
  children: ReactNode;
  active: boolean;
  color: string;
  duration?: number;
  onComplete?: () => void;
};

/** Red stub — replaced in green commit. */
export function NodeTransitionOverlay(_props: NodeTransitionOverlayProps): null {
  return null;
}
