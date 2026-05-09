import { assign, setup } from "xstate";
import type { VisualExplainerOption } from "./visualExplainerSchema";

export type ActivityTargetResultEvent = {
  type: "activity_target_result";
  activityId: string;
  nodeId: string;
  target: {
    roundId: string;
    optionId: string;
    mechanic: "predict-then-reveal";
  };
  correct: boolean;
  attemptedValue: string;
  responseTime_ms: number;
  scaffoldLevel: 0 | 1 | 2;
  concept: string;
  misconception: string | null;
};

export type ActivityCompleteEvent = {
  type: "activity_complete";
  activityId: string;
  nodeId: string;
  completed: true;
  accuracy: number;
  durationMs: number;
  mechanic: "visual-explainer";
  targetResults: ActivityTargetResultEvent[];
};

export type VisualExplainerEvidenceEvent =
  | ActivityTargetResultEvent
  | ActivityCompleteEvent;

export type VisualExplainerMachineContext = {
  startedAt: number;
  predictionShownAt: number | null;
  completedAt: number | null;
  selectedOption: VisualExplainerOption | null;
  targetResults: ActivityTargetResultEvent[];
  completion: ActivityCompleteEvent | null;
};

type MachineInput = {
  now: number;
};

type MachineEvent =
  | { type: "START"; now: number }
  | { type: "REACH_PREDICTION"; now: number }
  | {
      type: "ANSWER";
      now: number;
      option: VisualExplainerOption;
      activityId: string;
      nodeId: string;
      roundId: string;
      targetConcept: string;
    }
  | { type: "CONTINUE" }
  | { type: "REPLAY" }
  | { type: "EXIT_READY" }
  | { type: "COMPLETE"; now: number; activityId: string; nodeId: string };

export const visualExplainerMachine = setup({
  types: {
    context: {} as VisualExplainerMachineContext,
    events: {} as MachineEvent,
    input: {} as MachineInput,
  },
  actions: {
    startSession: assign(({ event }) => ({
      startedAt: event.type === "START" ? event.now : Date.now(),
      predictionShownAt: null,
      completedAt: null,
      selectedOption: null,
      targetResults: [],
      completion: null,
    })),
    markPredictionShown: assign(({ event }) => ({
      predictionShownAt: event.type === "REACH_PREDICTION" ? event.now : Date.now(),
    })),
    recordAnswer: assign(({ context, event }) => {
      if (event.type !== "ANSWER") return {};
      const responseTime_ms = Math.max(
        0,
        event.now - (context.predictionShownAt ?? event.now),
      );
      const targetResult: ActivityTargetResultEvent = {
        type: "activity_target_result",
        activityId: event.activityId,
        nodeId: event.nodeId,
        target: {
          roundId: event.roundId,
          optionId: event.option.id,
          mechanic: "predict-then-reveal",
        },
        correct: event.option.correct,
        attemptedValue: event.option.label,
        responseTime_ms,
        scaffoldLevel: 0,
        concept: event.targetConcept,
        misconception: event.option.correct ? null : event.option.misconception ?? null,
      };
      return {
        selectedOption: event.option,
        targetResults: [...context.targetResults, targetResult],
      };
    }),
    recordCompletion: assign(({ context, event }) => {
      if (event.type !== "COMPLETE") return {};
      const completedAt = event.now;
      const correct = context.targetResults.filter((result) => result.correct).length;
      const accuracy =
        context.targetResults.length === 0 ? 0 : correct / context.targetResults.length;
      return {
        completedAt,
        completion: {
          type: "activity_complete",
          activityId: event.activityId,
          nodeId: event.nodeId,
          completed: true,
          accuracy,
          durationMs: Math.max(0, completedAt - context.startedAt),
          mechanic: "visual-explainer",
          targetResults: context.targetResults,
        },
      };
    }),
  },
}).createMachine({
  id: "visualExplainer",
  initial: "intro",
  context: ({ input }) => ({
    startedAt: input.now,
    predictionShownAt: null,
    completedAt: null,
    selectedOption: null,
    targetResults: [],
    completion: null,
  }),
  states: {
    intro: {
      on: {
        START: {
          target: "playing",
          actions: "startSession",
        },
      },
    },
    playing: {
      on: {
        REACH_PREDICTION: {
          target: "pausedForPrediction",
          actions: "markPredictionShown",
        },
      },
    },
    pausedForPrediction: {
      on: {
        ANSWER: {
          target: "reveal",
          actions: "recordAnswer",
        },
      },
    },
    reveal: {
      on: {
        CONTINUE: "replayOrContinue",
      },
    },
    replayOrContinue: {
      on: {
        REPLAY: "playing",
        EXIT_READY: "exitCheck",
      },
    },
    exitCheck: {
      on: {
        COMPLETE: {
          target: "complete",
          actions: "recordCompletion",
        },
      },
    },
    complete: {
      type: "final",
    },
  },
});
