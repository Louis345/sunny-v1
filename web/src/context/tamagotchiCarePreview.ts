export type TamagotchiPreviewCareState = "steady" | "hungry" | "restored";

export type TamagotchiPreviewCareEvent = {
  type: "companion_care_completed";
  careAction: "feed";
  item: "apple_bite";
  beforeState: "hungry";
  afterState: "restored";
};

export type TamagotchiPreviewState = {
  careState: TamagotchiPreviewCareState;
  hunger: number;
  assignmentProgress: number;
  inventory: {
    apple_bite: number;
  };
  feedingEventId: string | null;
  feedingActive: boolean;
  feedingRun: number;
  lastEvent: TamagotchiPreviewCareEvent | null;
};

export type TamagotchiPreviewAction =
  | { type: "advance-time" }
  | { type: "complete-assignment" }
  | { type: "give-apple" }
  | { type: "replay-feeding" }
  | { type: "finish-feeding" }
  | { type: "reset" };

export function createTamagotchiPreviewState(): TamagotchiPreviewState {
  return {
    careState: "steady",
    hunger: 72,
    assignmentProgress: 0,
    inventory: { apple_bite: 0 },
    feedingEventId: null,
    feedingActive: false,
    feedingRun: 0,
    lastEvent: null,
  };
}

export function applyTamagotchiPreviewAction(
  state: TamagotchiPreviewState,
  action: TamagotchiPreviewAction,
): TamagotchiPreviewState {
  switch (action.type) {
    case "advance-time":
      return {
        ...state,
        careState: "hungry",
        hunger: 18,
        feedingActive: false,
        feedingEventId: null,
      };
    case "complete-assignment":
      if (state.assignmentProgress === 100) return state;
      return {
        ...state,
        assignmentProgress: 100,
        inventory: { apple_bite: 1 },
      };
    case "give-apple": {
      if (state.inventory.apple_bite < 1 || state.careState !== "hungry") {
        return state;
      }
      const feedingRun = state.feedingRun + 1;
      return {
        ...state,
        careState: "restored",
        hunger: 100,
        inventory: { apple_bite: state.inventory.apple_bite - 1 },
        feedingEventId: `storybook-care-feed-${feedingRun}`,
        feedingActive: true,
        feedingRun,
        lastEvent: {
          type: "companion_care_completed",
          careAction: "feed",
          item: "apple_bite",
          beforeState: "hungry",
          afterState: "restored",
        },
      };
    }
    case "replay-feeding": {
      if (state.careState !== "restored") return state;
      const feedingRun = state.feedingRun + 1;
      return {
        ...state,
        feedingEventId: `storybook-care-feed-${feedingRun}`,
        feedingActive: true,
        feedingRun,
      };
    }
    case "finish-feeding":
      if (!state.feedingActive) return state;
      return { ...state, feedingActive: false };
    case "reset":
      return createTamagotchiPreviewState();
  }
}
