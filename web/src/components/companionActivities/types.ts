import type { AnimationName } from "../../../../src/shared/companions/companionContract";
import type {
  CompanionActivityBoardView,
  CompanionActivityId,
  CompanionActivityMomentSalience,
  CompanionActivityMomentType,
  CompanionActivityResult,
  CompanionActivityStatus,
  CompanionActivityTurn,
} from "../../../../src/shared/companionActivities/types";

export type {
  CompanionActivityBoardView,
  CompanionActivityId,
  CompanionActivityResult,
  CompanionActivityStatus,
  CompanionActivityTurn,
};

export type CompanionActivityGameEventType =
  | "companion_activity_started"
  | "companion_activity_child_move"
  | "companion_activity_companion_move"
  | "companion_activity_round_complete"
  | "companion_activity_reset";

/**
 * What the game tells the companion layer about a moment worth reacting to.
 * Sets emotional tone only — companions do not coach strategy during play.
 */
export type CompanionActivityMoment = {
  momentType: CompanionActivityMomentType;
  salience: CompanionActivityMomentSalience;
  desiredTone: string;
  suggestedGesture: AnimationName;
};

/**
 * Generic event envelope. The game authors everything the companion layer
 * needs, so the showroom carries no game knowledge of its own.
 */
export type CompanionActivityGameEvent = {
  type: CompanionActivityGameEventType;
  activityId: CompanionActivityId;
  surface: "video_call_overlay";
  companionName: string;
  timestamp: number;
  boardView: CompanionActivityBoardView;
  labels: { child: string; companion: string };
  status: CompanionActivityStatus;
  turn: CompanionActivityTurn;
  /** Past-tense verb phrase, e.g. "placed X on square 5". */
  moveDescription?: string;
  moveBy?: "child" | "companion";
  summary: string;
  moment?: CompanionActivityMoment;
  result?: CompanionActivityResult;
  decisionStartedAt?: number;
  plannedDecisionDelayMs?: number;
  decisionLatencyMs?: number;
};

/**
 * Handed to the reveal gate. `plannedMove` is a present-tense verb phrase,
 * e.g. "place your O on square 5" / "drop your yellow disc into column 4".
 */
export type CompanionActivityTurnPlan = {
  boardView: CompanionActivityBoardView;
  plannedMove: string;
};

export type CompanionActivityComponentProps = {
  companionId?: string;
  companionName: string;
  onClose: () => void;
  onGameEvent?: (event: CompanionActivityGameEvent) => void;
  onBanter?: (banter: CompanionActivityBanter) => void;
  onCompanionTurn?: () => void;
  onRoundComplete?: (result: CompanionActivityResult) => void;
  /**
   * Reveal gate: resolves when the companion's line/gesture packet is ready,
   * so move + gesture + voice land together. Absent → local staged delay.
   */
  resolveCompanionTurn?: (plan: CompanionActivityTurnPlan) => Promise<void>;
};

export type CompanionActivityBanter = {
  phase: "child_move" | "companion_thinking" | "companion_move" | "round_complete";
  activityId: CompanionActivityId;
  result?: CompanionActivityResult;
};
