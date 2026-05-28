import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type {
  AdaptiveArtifactValidationReport,
  NodeConfig,
} from "../../../src/shared/adventureTypes";
import type {
  AdventureBoardNode,
  AdventureChoiceOption,
  AdventureChoiceSet,
} from "../../../src/shared/adventureBoardJson";

type GeneratedChoiceKind = "quest" | "boss";

export type AdventureBoardGeneratedChoiceRequest = {
  childId: string;
  date: string;
  nodeId: string;
  kind: GeneratedChoiceKind;
  briefId?: string;
  feedback: string;
};

export type HomeworkRegenerateSuccess = {
  ok: true;
  newFile: string;
  contentId?: string;
  validationReport?: AdaptiveArtifactValidationReport;
};

function kindForChoiceSet(choiceSet: AdventureChoiceSet): GeneratedChoiceKind | null {
  if (choiceSet.kind === "quest-wrapper") return "quest";
  if (choiceSet.kind === "boss-wrapper") return "boss";
  return null;
}

function ownerNodeForChoiceSet(
  packet: ChildExperiencePacket,
  choiceSet: AdventureChoiceSet,
  kind: GeneratedChoiceKind,
): AdventureBoardNode | null {
  const board = packet.activeSessionPlan?.adventureBoard;
  if (!board) return null;
  return board.nodes.find((node) => node.choiceSetId === choiceSet.id && node.kind === kind) ??
    board.nodes.find((node) => node.kind === kind) ??
    null;
}

function generatedChoiceDate(packet: ChildExperiencePacket): string {
  const createdAt = packet.activeSessionPlan?.createdAt;
  if (createdAt && /^\d{4}-\d{2}-\d{2}/.test(createdAt)) return createdAt.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function matchingBriefId(
  packet: ChildExperiencePacket,
  option: AdventureChoiceOption,
  kind: GeneratedChoiceKind,
): string | undefined {
  const brief = packet.activeSessionPlan?.generatedExperienceBriefs?.find(
    (candidate) => candidate.briefId === option.id && candidate.kind === kind,
  );
  return brief?.briefId;
}

function feedbackForGeneratedChoice(
  choiceSet: AdventureChoiceSet,
  option: AdventureChoiceOption,
  kind: GeneratedChoiceKind,
): string {
  return [
    `Child selected ${kind} wrapper "${option.label}" from "${choiceSet.title}".`,
    option.description ? `Card description: ${option.description}` : "",
    option.tags?.length ? `Wrapper traits: ${option.tags.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}

export function buildAdventureBoardGeneratedChoiceRequest(
  packet: ChildExperiencePacket,
  choiceSet: AdventureChoiceSet,
  option: AdventureChoiceOption,
): AdventureBoardGeneratedChoiceRequest | null {
  if (option.state === "locked") return null;
  const kind = kindForChoiceSet(choiceSet);
  if (!kind) return null;
  const ownerNode = ownerNodeForChoiceSet(packet, choiceSet, kind);
  if (!ownerNode) return null;
  return {
    childId: packet.childChart.childId,
    date: generatedChoiceDate(packet),
    nodeId: ownerNode.id,
    kind,
    ...(matchingBriefId(packet, option, kind)
      ? { briefId: option.id }
      : {}),
    feedback: feedbackForGeneratedChoice(choiceSet, option, kind),
  };
}

function wordsForNode(packet: ChildExperiencePacket, nodeId: string): string[] {
  const planNode = packet.activeSessionPlan?.nodePlan.find((node) => node.id === nodeId);
  if (!planNode) return [];
  return [...new Set(planNode.targets.map((word) => word.trim()).filter(Boolean))];
}

export function buildAdventureBoardGeneratedChoiceLaunchNode(
  packet: ChildExperiencePacket,
  request: AdventureBoardGeneratedChoiceRequest,
  response: HomeworkRegenerateSuccess,
): NodeConfig | null {
  if (!response.newFile) return null;
  const planNode = packet.activeSessionPlan?.nodePlan.find((node) => node.id === request.nodeId);
  return {
    id: request.nodeId,
    planId: packet.activeSessionPlan?.planId,
    type: request.kind,
    words: wordsForNode(packet, request.nodeId),
    difficulty: planNode?.difficulty ?? (request.kind === "boss" ? 3 : 2),
    gameFile: response.newFile,
    date: request.date,
    contentId: response.contentId,
    adaptiveArtifact: {
      artifactId: response.contentId ?? response.newFile,
      contentId: response.contentId ?? response.newFile,
      homeworkId: packet.activeSessionPlan?.activeHomeworkId ?? packet.activeSessionPlan?.planId ?? "active-homework",
      theoryId: packet.activeSessionPlan?.planTheory?.hypothesis ?? "generated-choice",
      generationStage: request.kind,
      targetGroupIds: [],
      homeworkWordIds: [],
      baselineEvidenceIds: packet.activeSessionPlan?.evidenceUsed.map((item) => item.id) ?? [],
      generatedPath: response.newFile,
      validationStatus: response.validationReport?.passed === false ? "failed" : "passed",
      validationReport: response.validationReport,
    },
    isLocked: false,
    isCompleted: false,
    isGoal: request.kind === "boss",
  };
}
