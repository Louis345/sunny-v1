import {
  NODE_REGISTRY,
  type NodeContext,
  type RoutableNodeConfig,
  buildNodeUrlSearchParams,
} from "./nodeRegistry";

type RoutableNode = {
  id: string;
  type: string;
  words?: string[];
  difficulty: number;
  gameFile?: string;
  date?: string;
  storyText?: string;
};

type RoutingContext = {
  childId: string;
  companion: string;
  isDiagMode: boolean;
  /** Overrides default `free` when `isDiagMode` (e.g. parent go-live walkthrough). */
  iframePreviewParam?: string;
  vrmUrl?: string;
  companionMuted?: boolean;
};

type CanvasLaunchAction = {
  kind: "canvas";
  payload: Record<string, unknown>;
};

type IframeLaunchAction = {
  kind: "iframe";
  url: string;
};

type SkipLaunchAction = {
  kind: "skip";
  reason: string;
};

export type NodeLaunchAction = CanvasLaunchAction | IframeLaunchAction | SkipLaunchAction;

function iframePreviewQuery(ctx: RoutingContext): string {
  if (ctx.iframePreviewParam) return ctx.iframePreviewParam;
  return ctx.isDiagMode ? "free" : "false";
}

export function buildNodeLaunchParams(
  node: Pick<RoutableNode, "id" | "words" | "difficulty">,
  ctx: RoutingContext,
): URLSearchParams {
  const nctx: NodeContext = {
    childId: ctx.childId,
    companion: ctx.companion,
    previewParam: iframePreviewQuery(ctx),
    vrmUrl: ctx.vrmUrl,
    companionMuted: ctx.companionMuted,
  };
  return buildNodeUrlSearchParams(node, nctx);
}

export function buildNodeLaunchAction(
  node: RoutableNode,
  ctx: RoutingContext,
): NodeLaunchAction {
  const handler = NODE_REGISTRY[node.type];
  if (!handler) {
    return { kind: "skip", reason: "unsupported-node-type" };
  }
  const nctx: NodeContext = {
    childId: ctx.childId,
    companion: ctx.companion,
    previewParam: iframePreviewQuery(ctx),
    vrmUrl: ctx.vrmUrl,
    companionMuted: ctx.companionMuted,
  };
  const rc = node as RoutableNodeConfig;
  if (handler.canvasMessage) {
    return { kind: "canvas", payload: handler.canvasMessage(rc) };
  }
  if (handler.getUrl) {
    const url = handler.getUrl(rc, nctx);
    if (!url) {
      return { kind: "skip", reason: "missing-homework-file" };
    }
    return { kind: "iframe", url };
  }
  return { kind: "skip", reason: "unsupported-node-type" };
}
