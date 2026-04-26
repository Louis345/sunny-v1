import type { ReactNode } from "react";

export interface FlowGameOverlayProps {
  children: ReactNode;
  onBack: () => void;
  backLabel?: string;
  zIndexClassName?: string;
}

export function FlowGameOverlay({
  children,
  onBack,
  backLabel = "Back to diag",
  zIndexClassName = "z-[100]",
}: FlowGameOverlayProps) {
  return (
    <div
      className={`fixed inset-0 ${zIndexClassName}`}
      style={{ pointerEvents: "auto" }}
    >
      {children}
      <button
        type="button"
        data-testid="flow-game-back"
        className="absolute top-3 right-3 z-[110] rounded-full bg-black/70 px-4 py-2 text-sm text-white"
        onClick={onBack}
      >
        {backLabel}
      </button>
    </div>
  );
}
