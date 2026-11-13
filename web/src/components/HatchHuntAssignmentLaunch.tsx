import { useMemo, useRef, type ReactElement } from "react";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import type { FlowGameSendMessage } from "../utils/flowGameEvents";
import { createFlowGameEvents } from "../utils/flowGameEvents";
import { buildHatchHuntRuntimeQuestions } from "./HatchHuntAssignmentAdapter";
import { MossyHatchHuntEncounter } from "./HatchHuntEncounter";
import type { HatchChaseEvent } from "./HatchChaseEngine";
import type { HatchHuntEvent } from "./HatchHuntEngine";
import type { OrbCaptureCompletedEvent } from "./capturedMonsterReward";

type TargetResult = {
  target: string;
  correct: boolean;
  attemptedValue?: string;
  responseTime_ms: number;
  scaffoldLevel: number;
  sourceEvidenceIds: string[];
  exposure: string;
  assistance: string;
};

export function HatchHuntAssignmentLaunch({
  node,
  childId,
  childName,
  sendMessage,
  onComplete,
}: {
  node: NodeConfig;
  childId: string;
  childName?: string;
  sendMessage: FlowGameSendMessage;
  onComplete: (result: { accuracy: number; targetResults: TargetResult[] }) => void;
}): ReactElement {
  const config = node.hatchHuntConfig;
  if (!config) throw new Error(`hatch_hunt_config_missing:${node.id}`);
  if (config.childId !== childId) throw new Error(`hatch_hunt_child_mismatch:${node.id}`);

  return (
    <ReadyHatchHuntAssignmentLaunch
      node={node}
      childId={childId}
      childName={childName ?? childId}
      sendMessage={sendMessage}
      onComplete={onComplete}
      config={config}
    />
  );
}

function ReadyHatchHuntAssignmentLaunch({
  node,
  childId,
  childName,
  sendMessage,
  onComplete,
  config,
}: {
  node: NodeConfig;
  childId: string;
  childName: string;
  sendMessage: FlowGameSendMessage;
  onComplete: (result: { accuracy: number; targetResults: TargetResult[] }) => void;
  config: NonNullable<NodeConfig["hatchHuntConfig"]>;
}): ReactElement {

  const questions = useMemo(() => buildHatchHuntRuntimeQuestions(config), [config]);
  const flowEvents = useMemo(() => createFlowGameEvents({
    game: "hatch-hunt",
    childId,
    sendMessage,
  }), [childId, sendMessage]);
  const observations = useRef(new Map<string, TargetResult>());
  const emittedEventKeys = useRef(new Set<string>());

  function itemFor(questionId: string | undefined) {
    if (!questionId) return undefined;
    const allItems = [...config.baselineItems, ...config.verificationItems];
    const direct = allItems.find((item) => item.id === questionId);
    if (direct) return direct;
    const recoveryTarget = Object.entries(config.recoveryByTarget).find(([, recoveries]) =>
      recoveries.some((recovery) => recovery.id === questionId),
    )?.[0];
    return recoveryTarget
      ? allItems.find((item) => item.targetId === recoveryTarget)
      : undefined;
  }

  function reportObservation(event: HatchHuntEvent | HatchChaseEvent): void {
    if (!event.questionId || event.correct == null) return;
    const item = itemFor(event.questionId);
    if (!item) throw new Error(`hatch_hunt_unknown_question:${event.questionId}`);
    const assistance = event.assistance ?? "none";
    const eventKey = `${event.type}:${event.questionId}:${assistance}:${event.latencyMs ?? 0}`;
    if (emittedEventKeys.current.has(eventKey)) return;
    emittedEventKeys.current.add(eventKey);
    const scaffoldLevel = assistance === "none"
      ? 0
      : assistance === "scaffold"
        ? 1
        : 2;
    const targetResult: TargetResult = {
      target: item.targetId,
      correct: event.correct,
      ...(event.response ? { attemptedValue: event.response } : {}),
      responseTime_ms: event.latencyMs ?? 0,
      scaffoldLevel,
      sourceEvidenceIds: [...item.sourceEvidenceIds],
      exposure: item.exposure,
      assistance,
    };
    if (assistance === "none" && !observations.current.has(item.id)) {
      observations.current.set(item.id, targetResult);
    }
    flowEvents.reportState("Hatch Hunt target observed.", {
      currentTarget: item.targetId,
      itemIndex: [...config.baselineItems, ...config.verificationItems].findIndex((candidate) => candidate.id === item.id),
      answerVisibility: assistance === "none" ? "hidden_until_response" : "support_visible",
      boardState: "active",
      evidenceTier: "practice",
    });
    flowEvents.reportAttempt({
      activityId: "hatch-hunt",
      nodeId: node.id,
      planId: node.planId,
      encounterId: config.encounterId,
      homeworkId: config.homeworkId,
      sourceFingerprint: config.source.fingerprint,
      sourceDocumentIds: [...config.source.documentIds],
      questionId: item.id,
      domain: config.domain,
      target: item.targetId,
      targetId: item.targetId,
      sourceEvidenceIds: [...item.sourceEvidenceIds],
      exposure: item.exposure,
      attemptedValue: event.response ?? undefined,
      correct: event.correct,
      quality: event.correct ? (scaffoldLevel === 0 ? 4 : 2) : 1,
      responseTimeMs: event.latencyMs ?? 0,
      scaffoldLevel,
      assistance,
      confounds: event.confounds ?? [],
      evidenceTier: "practice",
      maximumClaim: "practice_only",
      masteryClaimAllowed: false,
      targetResults: [targetResult],
    });
  }

  function completeCapture(event: OrbCaptureCompletedEvent): void {
    sendMessage("game_event", {
      event: {
        type: "hatch_hunt_capture",
        version: "1.0",
        payload: {
          nodeId: node.id,
          encounterId: config.encounterId,
          creatureId: event.reward.creatureId,
          evidenceClass: "engagement_only",
          masteryClaimAllowed: false,
        },
      },
    });
    const targetResults = [...observations.current.values()];
    const accuracy = targetResults.length
      ? targetResults.filter((result) => result.correct).length / targetResults.length
      : 0;
    flowEvents.complete({
      nodeId: node.id,
      planId: node.planId,
      encounterId: config.encounterId,
      homeworkId: config.homeworkId,
      completed: true,
      accuracy,
      targetResults,
      evidenceTier: "practice",
      maximumClaim: "practice_only",
      captureIsAcademicEvidence: false,
    });
    console.info(" 🎮 [hatch-hunt-assignment] [complete] [recorded]", {
      nodeId: node.id,
      encounterId: config.encounterId,
      targets: targetResults.length,
      accuracy,
    });
    onComplete({ accuracy, targetResults });
  }

  return (
    <MossyHatchHuntEncounter
      encounterId={config.encounterId}
      childId={childId}
      childName={childName}
      domain={config.domain}
      hatchQuestions={questions.hatch}
      chaseQuestions={questions.chase}
      onHatchEvent={reportObservation}
      onChaseEvent={reportObservation}
      onCaptured={completeCapture}
    />
  );
}
