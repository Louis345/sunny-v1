import { useCallback, useMemo, useState } from "react";
import type { MapState, NodeConfig } from "../../../../src/shared/adventureTypes";
import type { CompanionConfig } from "../../../../src/shared/companionTypes";
import childrenCfg from "../../../../children.config.json";
import { buildNodeLaunchAction } from "../../../../src/shared/homeworkNodeRouting";
import { questBriefingWordsFromMap } from "./questWords";

type MapPreviewMode = false | "free" | "go-live";

function ensurePreviewQueryParam(url: string, mode: MapPreviewMode): string {
  if (!mode) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("preview", mode);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const hasPreview = /(?:^|[?&])preview=/.test(url);
    if (hasPreview) return url;
    return url.includes("?") ? `${url}&preview=${mode}` : `${url}?preview=${mode}`;
  }
}

function profileLaunchNames(
  profile: unknown,
  childId: string,
  fallbackCompanionId: string,
): { childName: string; companionName: string } {
  const p = profile as {
    ttsName?: unknown;
    companion?: { companionId?: unknown };
  } | null;
  const childName =
    typeof p?.ttsName === "string" && p.ttsName.trim().length > 0
      ? p.ttsName.trim()
      : childId.charAt(0).toUpperCase() + childId.slice(1);
  const companionId =
    typeof p?.companion?.companionId === "string" && p.companion.companionId.trim().length > 0
      ? p.companion.companionId.trim()
      : fallbackCompanionId;
  const companionName = companionId.charAt(0).toUpperCase() + companionId.slice(1);
  return { childName, companionName };
}

export function useQuestBriefing(args: {
  childId: string;
  mapState: MapState | null;
  reinforceWords: readonly string[];
  previewMode: MapPreviewMode;
  mapCompanion?: CompanionConfig | null;
  companionMutedForMap?: boolean;
  dyslexiaMode?: boolean;
  profileNames: { childName: string; companionName: string } | null;
  setProfileNames: (names: { childName: string; companionName: string }) => void;
  commitLaunchedNode: (node: NodeConfig) => void;
  triggerQuestLaunch: (iframeUrl: string, node: NodeConfig) => void;
}) {
  const {
    childId,
    mapState,
    reinforceWords,
    previewMode,
    mapCompanion,
    companionMutedForMap,
    dyslexiaMode,
    profileNames,
    setProfileNames,
    commitLaunchedNode,
    triggerQuestLaunch,
  } = args;
  const resolved = childId.trim();
  const [open, setOpen] = useState(false);
  const [selectedQuestNode, setSelectedQuestNode] = useState<NodeConfig | null>(
    null,
  );
  const companionId = mapCompanion?.companionId ?? childrenCfg.defaultCompanionId;
  const words = useMemo(
    () => questBriefingWordsFromMap(mapState?.nodes ?? [], reinforceWords),
    [mapState?.nodes, reinforceWords],
  );
  const show = useCallback((node?: NodeConfig) => {
    if (node?.type === "quest") {
      setSelectedQuestNode(node);
    }
    setOpen(true);
  }, []);
  const hide = useCallback(() => setOpen(false), []);

  const onStartQuest = useCallback(async () => {
    setOpen(false);
    const qn = selectedQuestNode ?? mapState?.nodes.find((n) => n.type === "quest");
    if (!qn) {
      console.error("  🔴 [quest] start failed — missing quest node");
      return;
    }
    const questNode: NodeConfig = {
      ...qn,
      type: "quest",
      isLocked: false,
      difficulty:
        qn?.difficulty === 1 || qn?.difficulty === 2 || qn?.difficulty === 3
          ? qn.difficulty
          : 2,
      words,
    };
    const muted = companionMutedForMap === true;
    let nextProfileNames = profileNames;
    if (!nextProfileNames) {
      try {
        const profileResp = await fetch(
          `/api/profile/${encodeURIComponent(resolved)}`,
        );
        const profileJson = profileResp.ok ? await profileResp.json() : null;
        nextProfileNames = profileLaunchNames(profileJson, resolved, companionId);
        setProfileNames(nextProfileNames);
      } catch {
        nextProfileNames = profileLaunchNames(null, resolved, companionId);
      }
    }
    const launchAction = buildNodeLaunchAction(questNode, {
      childId: resolved,
      childName: nextProfileNames?.childName,
      companion: muted ? "off" : companionId,
      companionName:
        nextProfileNames?.companionName ??
        (companionId.charAt(0).toUpperCase() + companionId.slice(1)),
      isDiagMode:
        previewMode === "free" ||
        previewMode === "go-live" ||
        resolved === "creator",
      iframePreviewParam:
        previewMode === "free"
          ? "free"
          : previewMode === "go-live"
            ? "go-live"
            : "false",
      vrmUrl: mapCompanion?.vrmUrl,
      companionMuted: muted,
      isQuest: true,
      dyslexiaMode: dyslexiaMode === true,
    });
    if (launchAction.kind !== "iframe") {
      console.error(
        `  🔴 [quest] start failed — launch action ${launchAction.kind}`,
      );
      return;
    }
    const iframeUrl =
      previewMode === "free" || previewMode === "go-live"
        ? ensurePreviewQueryParam(launchAction.url, previewMode)
        : launchAction.url;
    commitLaunchedNode(questNode);
    triggerQuestLaunch(iframeUrl, questNode);
  }, [
    commitLaunchedNode,
    companionId,
    companionMutedForMap,
    dyslexiaMode,
    mapCompanion?.vrmUrl,
    mapState?.nodes,
    previewMode,
    profileNames,
    resolved,
    selectedQuestNode,
    setProfileNames,
    triggerQuestLaunch,
    words,
  ]);

  return {
    open,
    show,
    hide,
    modalProps: {
      open,
      reinforceWords: words,
      childId: resolved,
      companionId,
      onDismiss: hide,
      onStartQuest,
    },
  };
}
