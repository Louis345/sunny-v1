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

export function buildNodeLaunchParams(
  node: Pick<RoutableNode, "id" | "words" | "difficulty">,
  ctx: RoutingContext,
): URLSearchParams {
  return new URLSearchParams({
    words: (node.words ?? []).join(","),
    childId: ctx.childId,
    difficulty: String(node.difficulty),
    nodeId: node.id,
    companion: ctx.companion,
    preview: ctx.isDiagMode ? "true" : "false",
  });
}

export function buildNodeLaunchAction(
  node: RoutableNode,
  ctx: RoutingContext,
): NodeLaunchAction {
  const params = buildNodeLaunchParams(node, ctx);
  switch (node.type) {
    case "pronunciation":
      return {
        kind: "canvas",
        payload: {
          type: "pronunciation",
          pronunciationWords: node.words ?? [],
        },
      };
    case "karaoke":
      return {
        kind: "canvas",
        payload: {
          type: "karaoke",
          storyText: node.storyText,
          words: node.words ?? [],
        },
      };
    case "word-builder":
      return {
        kind: "iframe",
        url: `/games/word-builder.html?${params.toString()}`,
      };
    case "quest":
    case "boss": {
      if (!node.date || !node.gameFile) {
        return { kind: "skip", reason: "missing-homework-file" };
      }
      return {
        kind: "iframe",
        url: `/homework/${ctx.childId}/${node.date}/${node.gameFile}?${params.toString()}`,
      };
    }
    case "dopamine":
      if (!node.gameFile) {
        return { kind: "skip", reason: "missing-game-file" };
      }
      return {
        kind: "iframe",
        url: `/games/${node.gameFile}?${params.toString()}`,
      };
    default:
      return { kind: "skip", reason: "unsupported-node-type" };
  }
}
