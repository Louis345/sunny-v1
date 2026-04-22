import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import type { CompanionTrigger } from "../../../src/shared/companionTypes";
import { TRIGGER_EXPRESSION_MAP } from "../utils/companionExpressions";
import { isDopamineGameUrl } from "../../../src/shared/companionIframeGuards";
import { CompanionFace } from "./CompanionFace";

export type GameIframeOverlayState = {
  active: boolean;
  iframe: HTMLIFrameElement | null;
  url: string | null;
};

type CompanionEventMsg = {
  type: "companion_event";
  payload?: {
    trigger?: CompanionTrigger;
    timestamp?: number;
    childId?: string;
  };
};

function mapTriggerToBlendShape(
  companion: CompanionConfig,
  trigger: CompanionTrigger | undefined,
): string {
  if (!trigger) {
    return companion.expressions.idle ?? "happy";
  }
  const sem = TRIGGER_EXPRESSION_MAP[trigger];
  if (sem === "thinking") {
    return companion.expressions.thinking ?? companion.expressions.idle ?? "happy";
  }
  const key = String(sem);
  return (
    companion.expressions[key] ??
    companion.expressions.happy ??
    companion.expressions.idle ??
    "happy"
  );
}

export interface CompanionBridgeProps {
  overlay: GameIframeOverlayState;
  companion: CompanionConfig | null;
  /** Mic / companion reactions muted — face badge only. */
  companionMuted: boolean;
  /** True while TTS audio is playing — passed to CompanionFace for mouth animation. */
  isSpeaking?: boolean;
}

/**
 * Injects face-only VRM into iframe `#sunny-companion` via React portal.
 * Skips dopamine games entirely. Parent window listens for `companion_event` postMessages.
 */
export function CompanionBridge({
  overlay,
  companion,
  companionMuted,
  isSpeaking = false,
}: CompanionBridgeProps) {
  const [blendShape, setBlendShape] = useState(() =>
    companion?.expressions.idle ? companion.expressions.idle : "happy",
  );
  const [iframeDocTick, setIframeDocTick] = useState(0);
  /** Bumps whenever the root is recreated — gates the light render effect. */
  const [rootVersion, setRootVersion] = useState(0);
  const rootRef = useRef<Root | null>(null);

  useEffect(() => {
    if (companion?.expressions.idle) {
      setBlendShape(companion.expressions.idle);
    }
  }, [companion]);

  const onMessage = useCallback(
    (e: MessageEvent) => {
      const d = e.data as CompanionEventMsg | undefined;
      if (!d || d.type !== "companion_event") return;
      if (!companion) return;
      const blend = mapTriggerToBlendShape(companion, d.payload?.trigger);
      setBlendShape(blend);
    },
    [companion],
  );

  useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onMessage]);

  useEffect(() => {
    const el = overlay.iframe;
    if (!el) return;
    const bump = () => setIframeDocTick((n) => n + 1);
    if (el.contentDocument?.readyState === "complete") {
      bump();
    } else {
      el.addEventListener("load", bump);
      return () => el.removeEventListener("load", bump);
    }
  }, [overlay.iframe]);

  // Heavy effect: manages root lifetime only. Never re-runs for prop changes.
  useEffect(() => {
    const iframe = overlay.iframe;
    const active = overlay.active;

    console.log('[CompanionBridge] effect deps changed:', {
      active,
      url: overlay.url,
      hasIframe: !!iframe,
      iframeDocTick,
    });

    if (!active || !iframe || !companion) {
      rootRef.current?.unmount();
      rootRef.current = null;
      return;
    }

    if (isDopamineGameUrl(overlay.url, companion.dopamineGames)) {
      rootRef.current?.unmount();
      rootRef.current = null;
      return;
    }

    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch (err) {
      console.warn("[CompanionBridge] could not access iframe document (likely cross-origin):", err);
      return;
    }

    if (!doc || doc.readyState !== "complete") {
      const el = iframe;
      if (el) {
        const retry = () => setIframeDocTick((n) => n + 1);
        el.addEventListener("load", retry, { once: true });
        return () => el.removeEventListener("load", retry);
      }
      return;
    }

    const anchor = doc.getElementById("sunny-companion");
    console.log("[CompanionBridge] anchor found:", Boolean(anchor));
    if (!anchor) return;

    console.log("[CompanionBridge] injecting CompanionFace");
    const root = createRoot(anchor);
    rootRef.current = root;
    setRootVersion((v) => v + 1);

    return () => {
      root.unmount();
      rootRef.current = null;
    };
  }, [overlay.active, overlay.iframe, overlay.url, companion, iframeDocTick]);

  // Light effect: re-renders into the existing root when animatable props change.
  // rootVersion ensures this runs after the root is recreated above.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !companion) return;
    root.render(
      <CompanionFace
        vrmUrl={companion.vrmUrl}
        expression={blendShape}
        size={96}
        muted={companionMuted}
        faceCamera={companion.faceCamera}
        isSpeaking={isSpeaking}
      />,
    );
  }, [blendShape, companionMuted, isSpeaking, companion, rootVersion]);

  return null;
}

