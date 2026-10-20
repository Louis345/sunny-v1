import type { ReactNode } from "react";

export interface FlowGameOverlayProps {
  children: ReactNode;
  onBack: () => void;
  backLabel?: string;
  completionNavigation?: { completed: boolean; ownsBack: boolean };
  zIndexClassName?: string;
}

export function FlowGameOverlay({
  children,
  onBack,
  backLabel = "Back to diag",
  completionNavigation,
  zIndexClassName = "z-[100]",
}: FlowGameOverlayProps) {
  return (
    <div
      className={`fixed inset-0 ${zIndexClassName}`}
      style={{ pointerEvents: "auto" }}
    >
      {children}
      {(!completionNavigation || (!completionNavigation.completed && !completionNavigation.ownsBack)) && <button
        type="button"
        data-testid="flow-game-back"
        className="absolute top-16 right-3 z-[110] rounded-full bg-black/70 px-4 py-2 text-sm text-white"
        onClick={onBack}
      >
        {backLabel}
      </button>}
    </div>
  );
}
