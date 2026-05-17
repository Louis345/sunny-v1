import type { ReactNode } from "react";
import type {
  ActivityIntentSummary,
  NodeConfig,
  NodeResult,
  TargetSelectorDecisionSummary,
} from "../../../src/shared/adventureTypes";

export type SunnyActivityEventSender = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export type SunnyActivityHandle = {
  childId: string;
  node: NodeConfig;
  intent: ActivityIntentSummary | null;
  targetSelectorDecision: TargetSelectorDecisionSummary | null;
  targets: string[];
  snapshot: (snapshot: Record<string, unknown>) => void;
  attempt: (attempt: Record<string, unknown>) => void;
  complete: (result: Partial<NodeResult>) => void;
  helpRequest: (payload?: Record<string, unknown>) => void;
  productIssue: (payload?: Record<string, unknown>) => void;
};

export function SunnyActivityShell(props: {
  childId: string;
  node: NodeConfig;
  intent?: ActivityIntentSummary | null;
  targetSelectorDecision?: TargetSelectorDecisionSummary | null;
  targets?: string[];
  sendMessage: SunnyActivityEventSender;
  children: (activity: SunnyActivityHandle) => ReactNode;
}): ReactNode {
  const intent = props.intent ?? props.node.activityIntent ?? null;
  const targetSelectorDecision =
    props.targetSelectorDecision ?? props.node.targetSelectorDecision ?? null;
  const targets =
    props.targets ??
    intent?.selectedTargets.map((target) => target.target) ??
    props.node.words ??
    [];

  const withContract = (payload: Record<string, unknown>) => ({
    ...payload,
    childId: props.childId,
    nodeId: props.node.id,
    activityId: props.node.type,
    activityIntentId: intent?.intentId,
    targetSelectorId: targetSelectorDecision?.selectorId,
    intentPurpose: intent?.purpose,
    diagnosticQuestion: intent?.diagnosticQuestion,
  });

  const handle: SunnyActivityHandle = {
    childId: props.childId,
    node: props.node,
    intent,
    targetSelectorDecision,
    targets,
    snapshot: (snapshot) => {
      props.sendMessage("game_state_update", withContract(snapshot));
    },
    attempt: (attempt) => {
      props.sendMessage("attempt_event", withContract(attempt));
    },
    complete: (result) => {
      props.sendMessage(
        "node_complete",
        withContract({
          ...result,
          nodeId: result.nodeId ?? props.node.id,
          activityId: result.activityId ?? props.node.type,
          activityIntent: intent ?? undefined,
          targetSelectorDecision: targetSelectorDecision ?? undefined,
          evidenceTier: result.evidenceTier ?? intent?.evidenceTier,
          masteryEligible: result.masteryEligible ?? intent?.masteryEligible,
        }),
      );
    },
    helpRequest: (payload = {}) => {
      props.sendMessage("companion_event", withContract({ trigger: "help_request", ...payload }));
    },
    productIssue: (payload = {}) => {
      props.sendMessage("companion_event", withContract({ trigger: "product_issue", ...payload }));
    },
  };

  return props.children(handle);
}
