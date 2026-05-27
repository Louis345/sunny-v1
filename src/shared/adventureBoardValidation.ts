import type { AdventureBoardJson } from "./adventureBoardJson";

export type AdventureBoardValidationCode =
  | "missing_edge_endpoint"
  | "choice_option_missing_node"
  | "choice_gate_missing_choice_set"
  | "choice_gate_missing_incoming_edge"
  | "choice_gate_missing_baseline_incoming_edge"
  | "choice_gate_missing_outgoing_edge"
  | "baseline_choice_route_missing"
  | "baseline_choice_route_too_few_options"
  | "baseline_choice_route_disconnected"
  | "baseline_choice_missing_node"
  | "choice_signal_missing"
  | "choice_signal_claims_mastery"
  | "unknown_board_activity_id"
  | "preference_claims_mastery"
  | "board_background_not_image"
  | "board_companion_missing"
  | "board_node_thumbnail_missing"
  | "board_node_slot_missing"
  | "board_node_layout_missing"
  | "board_label_too_long"
  | "board_choice_art_missing"
  | "board_route_layout_order_gap"
  | "board_baseline_layout_order_gap"
  | "board_palette_not_approved";

export type AdventureBoardValidationIssue = {
  code: AdventureBoardValidationCode;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
  choiceSetId?: string;
};

export function validateBoardGraph(board: AdventureBoardJson): AdventureBoardValidationIssue[] {
  const issues: AdventureBoardValidationIssue[] = [];
  const nodeIds = new Set(board.nodes.map((node) => node.id));
  for (const edge of board.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        code: "missing_edge_endpoint",
        severity: "error",
        edgeId: edge.id,
        message: `Edge ${edge.id} references missing endpoint ${!nodeIds.has(edge.from) ? edge.from : edge.to}.`,
      });
    }
  }
  return issues;
}

export function validateBoardChoices(board: AdventureBoardJson): AdventureBoardValidationIssue[] {
  const issues: AdventureBoardValidationIssue[] = [];
  const nodeIds = new Set(board.nodes.map((node) => node.id));
  const nodesById = new Map(board.nodes.map((node) => [node.id, node]));
  const choiceSets = new Map((board.choiceSets ?? []).map((choiceSet) => [choiceSet.id, choiceSet]));
  const baselineRouteChoiceSets = (board.choiceSets ?? []).filter(
    (choiceSet) => choiceSet.kind === "baseline-route",
  );
  if (board.layout?.preset === "horizontal-adventure-spine") {
    const hasBaselineRouteGate = board.nodes.some((node) => {
      if (node.kind !== "choice-gate" || !node.choiceSetId) return false;
      return choiceSets.get(node.choiceSetId)?.kind === "baseline-route";
    });
    if (!hasBaselineRouteGate || baselineRouteChoiceSets.length === 0) {
      issues.push({
        code: "baseline_choice_route_missing",
        severity: "error",
        message: "Horizontal adventure boards must include a Choose Path gate backed by a baseline-route choice set.",
      });
    }
  }
  for (const choiceSet of board.choiceSets ?? []) {
    if (choiceSet.kind === "baseline-route" && choiceSet.options.length < 2) {
      issues.push({
        code: "baseline_choice_route_too_few_options",
        severity: "error",
        choiceSetId: choiceSet.id,
        message: `Baseline route choice set ${choiceSet.id} must give the child at least two route options.`,
      });
    }
    for (const option of choiceSet.options) {
      if (["baseline-route", "mystery", "quest-wrapper", "boss-wrapper"].includes(choiceSet.kind)) {
        if (!option.choiceSignal) {
          issues.push({
            code: "choice_signal_missing",
            severity: "error",
            choiceSetId: choiceSet.id,
            message: `Choice option ${option.id} must declare choicePolicy preference evidence.`,
          });
        } else if (
          option.choiceSignal.algorithmFeed !== "choicePolicy" ||
          option.choiceSignal.preferenceNotMastery !== true
        ) {
          issues.push({
            code: "choice_signal_claims_mastery",
            severity: "error",
            choiceSetId: choiceSet.id,
            message: `Choice option ${option.id} must feed choicePolicy and explicitly stay preference-not-mastery.`,
          });
        }
      }
      if (choiceSet.kind === "baseline-route" && !option.nodeId) {
        issues.push({
          code: "baseline_choice_missing_node",
          severity: "error",
          choiceSetId: choiceSet.id,
          message: `Baseline route choice ${option.id} must identify the route node it opens.`,
        });
      }
      if (option.nodeId && !nodeIds.has(option.nodeId)) {
        issues.push({
          code: "choice_option_missing_node",
          severity: "error",
          choiceSetId: choiceSet.id,
          nodeId: option.nodeId,
          message: `Choice option ${option.id} points to missing node ${option.nodeId}.`,
        });
      }
      if (
        choiceSet.kind === "baseline-route" &&
        option.nodeId &&
        nodeIds.has(option.nodeId) &&
        !canReachAdventureDestination(board, option.nodeId)
      ) {
        issues.push({
          code: "baseline_choice_route_disconnected",
          severity: "error",
          choiceSetId: choiceSet.id,
          nodeId: option.nodeId,
          message: `Baseline route choice ${option.id} points to ${option.nodeId}, but that route does not reconnect to Mystery, Quest, or Boss.`,
        });
      }
    }
  }
  for (const node of board.nodes) {
    if (node.kind !== "choice-gate") continue;
    if (!node.choiceSetId || !choiceSets.has(node.choiceSetId)) {
      issues.push({
        code: "choice_gate_missing_choice_set",
        severity: "error",
        nodeId: node.id,
        choiceSetId: node.choiceSetId,
        message: `Choice gate ${node.id} must reference an existing choice set.`,
      });
    }
    if (!board.edges.some((edge) => edge.to === node.id)) {
      issues.push({
        code: "choice_gate_missing_incoming_edge",
        severity: "error",
        nodeId: node.id,
        message: `Choice gate ${node.id} has no incoming edge from the required path.`,
      });
    }
    if (
      board.layout?.preset === "horizontal-adventure-spine" &&
      !board.edges.some((edge) => {
        if (edge.to !== node.id) return false;
        const from = nodesById.get(edge.from);
        return from?.kind === "activity" && (from.evidenceRole === "baseline" || from.layout?.role === "baseline");
      })
    ) {
      issues.push({
        code: "choice_gate_missing_baseline_incoming_edge",
        severity: "error",
        nodeId: node.id,
        message: `Choice gate ${node.id} must come after a baseline evidence node in the horizontal spine.`,
      });
    }
    if (!board.edges.some((edge) => edge.from === node.id)) {
      issues.push({
        code: "choice_gate_missing_outgoing_edge",
        severity: "error",
        nodeId: node.id,
        message: `Choice gate ${node.id} has no outgoing route edges.`,
      });
    }
  }
  return issues;
}

function canReachAdventureDestination(
  board: AdventureBoardJson,
  startNodeId: string,
  visited = new Set<string>(),
): boolean {
  if (visited.has(startNodeId)) return false;
  visited.add(startNodeId);
  const node = board.nodes.find((candidate) => candidate.id === startNodeId);
  if (!node) return false;
  if (node.kind === "mystery" || node.kind === "quest" || node.kind === "boss") return true;
  return board.edges
    .filter((edge) => edge.from === startNodeId)
    .some((edge) => canReachAdventureDestination(board, edge.to, visited));
}

export function validateBoardActivityCatalogReferences(
  board: AdventureBoardJson,
  activityIds: Set<string>,
): AdventureBoardValidationIssue[] {
  const issues: AdventureBoardValidationIssue[] = [];
  for (const node of board.nodes) {
    if (node.kind === "activity" && (!node.activityId || !activityIds.has(node.activityId))) {
      issues.push({
        code: "unknown_board_activity_id",
        severity: "error",
        nodeId: node.id,
        message: `Academic board node ${node.id} references unknown activity ${node.activityId ?? "(missing)"}.`,
      });
    }
    if (
      (node.kind === "reward" || node.kind === "choice-gate" || node.kind === "mystery") &&
      node.evidenceRole === "mastery"
    ) {
      issues.push({
        code: "preference_claims_mastery",
        severity: "error",
        nodeId: node.id,
        message: `Preference node ${node.id} must not claim mastery evidence.`,
      });
    }
  }
  return issues;
}

export function validateBoardVisualContract(board: AdventureBoardJson): AdventureBoardValidationIssue[] {
  const issues: AdventureBoardValidationIssue[] = [];
  if (board.layout?.preset !== "horizontal-adventure-spine") return issues;

  if (board.theme.background.type !== "image") {
    issues.push({
      code: "board_background_not_image",
      severity: "error",
      message: "Horizontal adventure spine must use an image background from board JSON.",
    });
  }

  if (
    normalizeHexColor(board.theme.palette.path) !== "#ffffff" ||
    normalizeHexColor(board.theme.palette.text) !== "#ffffff"
  ) {
    issues.push({
      code: "board_palette_not_approved",
      severity: "error",
      message: "Horizontal adventure spine must use the approved high-contrast path/text palette from board JSON.",
    });
  }

  if (!board.companion?.id || !board.companion.name) {
    issues.push({
      code: "board_companion_missing",
      severity: "error",
      message: "Horizontal adventure spine must include the selected companion in board.companion.",
    });
  }

  for (const node of board.nodes) {
    if (node.state === "hidden") continue;
    if (!node.thumbnailUrl) {
      issues.push({
        code: "board_node_thumbnail_missing",
        severity: "error",
        nodeId: node.id,
        message: `Visible board node ${node.id} must include thumbnailUrl or approved fallback art.`,
      });
    }
    if (!node.slot) {
      issues.push({
        code: "board_node_slot_missing",
        severity: "error",
        nodeId: node.id,
        message: `Visible board node ${node.id} must use a semantic horizontal slot instead of planner-owned coordinates.`,
      });
    }
    if (!node.layout?.role) {
      issues.push({
        code: "board_node_layout_missing",
        severity: "error",
        nodeId: node.id,
        message: `Visible board node ${node.id} must include layout.role for the horizontal spine.`,
      });
    }
    const displayLabel = node.shortLabel ?? node.label;
    if (displayLabel.length > 18) {
      issues.push({
        code: "board_label_too_long",
        severity: "error",
        nodeId: node.id,
        message: `Visible board node ${node.id} label "${displayLabel}" is too long for the horizontal spine.`,
      });
    }
  }

  for (const choiceSet of board.choiceSets ?? []) {
    if (choiceSet.kind !== "baseline-route" && choiceSet.kind !== "mystery") continue;
    for (const option of choiceSet.options) {
      if (!option.thumbnailUrl && !option.icon) {
        issues.push({
          code: "board_choice_art_missing",
          severity: "error",
          choiceSetId: choiceSet.id,
          message: `Choice option ${option.id} must include icon or thumbnailUrl for the horizontal spine modal.`,
        });
      }
    }
  }

  const routeOrdersByLane = new Map<string, number[]>();
  for (const node of board.nodes) {
    if (node.state === "hidden" || node.layout?.role !== "evidence-route") continue;
    const lane = node.layout.lane ?? "main";
    const order = node.layout.order ?? 0;
    routeOrdersByLane.set(lane, [...(routeOrdersByLane.get(lane) ?? []), order]);
  }
  for (const [lane, orders] of routeOrdersByLane) {
    const sorted = [...new Set(orders)].sort((a, b) => a - b);
    const hasGap = sorted.some((order, index) => order !== index + 1);
    if (hasGap) {
      issues.push({
        code: "board_route_layout_order_gap",
        severity: "error",
        message: `Evidence-route lane ${lane} must use contiguous layout.order values starting at 1.`,
      });
    }
  }

  const baselineOrdersByLane = new Map<string, number[]>();
  for (const node of board.nodes) {
    if (node.state === "hidden" || node.layout?.role !== "baseline") continue;
    const lane = node.layout.lane ?? "main";
    const order = node.layout.order ?? 0;
    baselineOrdersByLane.set(lane, [...(baselineOrdersByLane.get(lane) ?? []), order]);
  }
  for (const [lane, orders] of baselineOrdersByLane) {
    const sorted = [...new Set(orders)].sort((a, b) => a - b);
    const hasGap = sorted.some((order, index) => order !== index + 1);
    if (hasGap) {
      issues.push({
        code: "board_baseline_layout_order_gap",
        severity: "error",
        message: `Baseline lane ${lane} must use contiguous layout.order values starting at 1.`,
      });
    }
  }

  return issues;
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

export function validateAdventureBoardJson(
  board: AdventureBoardJson,
  activityIds: Set<string>,
): AdventureBoardValidationIssue[] {
  return [
    ...validateBoardGraph(board),
    ...validateBoardChoices(board),
    ...validateBoardActivityCatalogReferences(board, activityIds),
    ...validateBoardVisualContract(board),
  ];
}
