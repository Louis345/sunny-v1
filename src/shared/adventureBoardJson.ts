export type AdventureBoardDomain =
  | "spelling"
  | "reading"
  | "math"
  | "science"
  | "generic";

export type AdventureBoardNodeKind =
  | "start"
  | "activity"
  | "choice-gate"
  | "mystery"
  | "quest"
  | "boss"
  | "reward";

export type AdventureBoardNodeState =
  | "current"
  | "available"
  | "completed"
  | "locked"
  | "preview"
  | "hidden";

export type AdventureBoardEvidenceRole =
  | "baseline"
  | "preference"
  | "support"
  | "transfer"
  | "mastery";

export type AdventureBoardActionType =
  | "launch-activity"
  | "open-choice-set"
  | "show-locked-reason";

export type AdventureBoardEdgeState =
  | "completed"
  | "available"
  | "locked"
  | "preview";

export type AdventureBoardChoiceSetKind =
  | "baseline-route"
  | "mystery"
  | "quest-wrapper"
  | "boss-wrapper";

export interface AdventureBoardJson {
  schemaVersion: 1;
  boardId: string;
  planId: string;
  childId: string;
  domain: AdventureBoardDomain;
  title?: string;
  theme: AdventureBoardTheme;
  nodes: AdventureBoardNode[];
  edges: AdventureBoardEdge[];
  choiceSets?: AdventureChoiceSet[];
  companion?: AdventureBoardCompanion;
  progress?: AdventureBoardProgress;
}

export interface AdventureBoardTheme {
  background:
    | { type: "image"; value: string }
    | { type: "gradient"; value: string }
    | { type: "solid"; value: string };
  palette: {
    path: string;
    completed: string;
    available: string;
    locked: string;
    current: string;
    preview: string;
    text: string;
    panel: string;
  };
}

export interface AdventureBoardProgress {
  currentNodeId?: string;
  completedNodeIds: string[];
  activeChoiceSetId?: string;
}

export interface AdventureBoardCompanion {
  id: string;
  name: string;
}

export interface AdventureBoardNode {
  id: string;
  kind: AdventureBoardNodeKind;
  activityId?: string;
  label: string;
  shortLabel?: string;
  icon?: string;
  position: {
    x: number;
    y: number;
  };
  state: AdventureBoardNodeState;
  evidenceRole?: AdventureBoardEvidenceRole;
  target?: {
    laneId: string;
    skill: string;
    words?: string[];
  };
  lock?: {
    reason: string;
    label: string;
    progressLabel?: string;
  };
  choiceSetId?: string;
  action?: {
    type: AdventureBoardActionType;
    payloadId: string;
  };
}

export interface AdventureBoardEdge {
  id: string;
  from: string;
  to: string;
  state: AdventureBoardEdgeState;
  style?: "solid" | "dashed" | "glow";
}

export interface AdventureChoiceSet {
  id: string;
  kind: AdventureBoardChoiceSetKind;
  title: string;
  options: AdventureChoiceOption[];
}

export interface AdventureChoiceOption {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  state: "available" | "locked" | "completed";
  nodeId?: string;
  tags?: string[];
  lock?: {
    reason: string;
    label: string;
  };
}
