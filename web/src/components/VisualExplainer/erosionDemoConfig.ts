import type { VisualExplainerConfig } from "./visualExplainerSchema";

export const erosionVisualExplainerConfig: VisualExplainerConfig = {
  activityId: "visual-explainer",
  nodeId: "demo-erosion-treatment",
  topic: "Erosion",
  learningGoal: "Understand that erosion moves tiny pieces of rock and soil over time.",
  childHook:
    "Coach the river team: your job is to spot what the water moves before the land changes.",
  carePlanNote: {
    assumption:
      "The child may not yet understand that erosion moves sediment over time instead of making rocks disappear.",
    intervention:
      "Use a visual time-scrubber with a prediction pause before the key reveal.",
  },
  animation: {
    durationMs: 9000,
    predictionAt: 0.48,
  },
  checkpoints: [
    {
      id: "smooth-hill",
      t: 0,
      caption: "A smooth hill waits before the rain starts.",
    },
    {
      id: "rain-starts",
      t: 0.32,
      caption: "Rainwater begins to run downhill.",
    },
    {
      id: "sediment-moves",
      t: 0.62,
      caption: "Water carries tiny pieces of rock and soil.",
    },
    {
      id: "channel-forms",
      t: 1,
      caption: "Over time, the moving sediment leaves a channel.",
    },
  ],
  prediction: {
    roundId: "erosion-sediment-prediction",
    targetConcept: "sediment_movement",
    prompt: "What is the water carrying?",
    reveal:
      "The water carries sediment: tiny pieces of rock and soil. Erosion moves material; it does not make it vanish.",
    options: [
      {
        id: "sediment",
        label: "Tiny pieces of rock and soil",
        correct: true,
      },
      {
        id: "whole-rocks",
        label: "Whole rocks disappearing",
        correct: false,
        misconception: "rocks_disappear",
      },
      {
        id: "nothing",
        label: "Nothing; only the water moves",
        correct: false,
        misconception: "water_does_nothing",
      },
    ],
  },
  exitCheck: {
    prompt: "Exit check: could wind also move tiny pieces of rock and soil?",
    answer: "Yes. Wind can also move sediment and slowly change landforms.",
  },
  companion: {
    id: "matilda-demo",
    displayName: "Matilda",
    role: "co-pilot",
    avatar: "👩🏻‍🏫",
    provider: "elevenlabs",
    voiceId: "demo-swappable-elevenlabs-voice-id",
    lines: [
      {
        id: "intro",
        state: "intro",
        expression: "encouraging",
        text: "I am your co-pilot. We will watch the land like scientists before we answer.",
      },
      {
        id: "playing",
        state: "playing",
        expression: "thinking",
        text: "Look near the water path. Something tiny starts to move before the land changes.",
      },
      {
        id: "pausedForPrediction",
        state: "pausedForPrediction",
        expression: "thinking",
        text: "Prediction time. What do you think the water is carrying?",
      },
      {
        id: "reveal-correct",
        state: "reveal.correct",
        expression: "celebrating",
        text: "Yes. You spotted sediment. That is the clue erosion needs.",
      },
      {
        id: "reveal-support",
        state: "reveal.support",
        expression: "supporting",
        text: "Good thinking. Replay it and watch the tiny pieces riding with the water.",
      },
      {
        id: "exitCheck",
        state: "exitCheck",
        expression: "encouraging",
        text: "Now we test transfer. If water can move sediment, think about what wind can do.",
      },
      {
        id: "complete",
        state: "complete",
        expression: "celebrating",
        text: "Treatment complete. We wrote down what happened, just like evidence in the chart.",
      },
    ],
  },
};
