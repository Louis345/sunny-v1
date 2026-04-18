import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NodeTransitionOverlay } from "../components/NodeTransitionOverlay";

export type TransitionOptions = {
  color: string;
  onComplete: () => void;
  duration?: number;
};

type TransitionContextValue = {
  triggerTransition: (opts: TransitionOptions) => void;
};

const TransitionContext = createContext<TransitionContextValue | null>(null);

export function TransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [color, setColor] = useState("#6D5EF5");
  const [duration, setDuration] = useState(700);
  const pendingRef = useRef<TransitionOptions | null>(null);

  const handleOverlayComplete = useCallback(() => {
    const opts = pendingRef.current;
    pendingRef.current = null;
    try {
      opts?.onComplete();
    } finally {
      setActive(false);
    }
  }, []);

  const triggerTransition = useCallback((opts: TransitionOptions) => {
    pendingRef.current = opts;
    setColor(opts.color);
    setDuration(opts.duration ?? 700);
    setActive(true);
  }, []);

  const value = useMemo(
    () => ({ triggerTransition }),
    [triggerTransition],
  );

  return (
    <TransitionContext.Provider value={value}>
      {children}
      {createPortal(
        <NodeTransitionOverlay
          active={active}
          color={color}
          duration={duration}
          onComplete={handleOverlayComplete}
        >
          {null}
        </NodeTransitionOverlay>,
        document.body,
      )}
    </TransitionContext.Provider>
  );
}

export function useTransition(): TransitionContextValue {
  const ctx = useContext(TransitionContext);
  if (!ctx) {
    throw new Error("useTransition must be used within TransitionProvider");
  }
  return ctx;
}
