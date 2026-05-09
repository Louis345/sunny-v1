import type { VisualExplainerConfig } from "./visualExplainerSchema";
import {
  validateVisualBrief,
  type VisualBrief,
  type VisualBriefId,
} from "./visualBriefSchema";

const companionBase = {
  id: "matilda-demo",
  displayName: "Matilda",
  role: "co-pilot",
  avatar: "👩🏻‍🏫",
  provider: "elevenlabs",
  voiceId: "demo-swappable-elevenlabs-voice-id",
};

export const visualBriefs: Record<VisualBriefId, VisualBrief> = {
  erosion: validateVisualBrief({
    id: "erosion",
    template: "carrier-flow",
    topic: "Erosion",
    title: "How water reshapes the land",
    learningGoal:
      "Understand that erosion moves tiny pieces of rock and soil over time.",
    childHook:
      "Coach the river team: your job is to spot what the water carries before the land changes.",
    carePlanNote: {
      assumption:
        "The child may not yet understand that erosion moves sediment over time instead of making rocks disappear.",
      intervention:
        "Use a visual carrier-flow model with a prediction pause before the key reveal.",
    },
    palette: {
      page: "#fff7e8",
      sceneBgTop: "#ffd89e",
      sceneBgBottom: "#fff3c7",
      land: "#7ba05b",
      landDark: "#496b37",
      carrier: "#4aa3df",
      carrierLight: "#d8f4ff",
      payload: "#9b6132",
      payloadGlow: "#f6c36a",
      accent: "#c75f2a",
      ink: "#2f2418",
      card: "#fffaf0",
    },
    world: "earth-hill",
    actors: {
      carrier: { label: "water", visual: "stream" },
      payload: { label: "sediment", visual: "tiny rock and soil pieces" },
      source: { label: "hill", visual: "sloped landform" },
      destination: { label: "stream bed", visual: "sediment fan" },
    },
    checkpoints: [
      {
        id: "start",
        t: 0,
        label: "Start",
        caption: "A smooth hill waits before the rain starts.",
      },
      {
        id: "carrier-enters",
        t: 0.28,
        label: "Rain",
        caption: "Rainwater gathers and begins to run downhill.",
      },
      {
        id: "payload-moves",
        t: 0.58,
        label: "Carry",
        caption: "The water carries sediment: tiny rock and soil pieces.",
      },
      {
        id: "reveal",
        t: 0.78,
        label: "Reveal",
        caption: "The moving pieces carve a channel and collect at the bottom.",
      },
      {
        id: "after",
        t: 1,
        label: "After",
        caption: "The hill has changed because material moved.",
      },
    ],
    prediction: {
      roundId: "erosion-sediment-prediction",
      targetConcept: "sediment_movement",
      prompt: "What is the water carrying?",
      reveal:
        "The water carries sediment: tiny pieces of rock and soil. Erosion moves material; it does not make it vanish.",
      options: [
        { id: "sediment", label: "Tiny pieces of rock and soil", correct: true },
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
    companionLines: {
      intro: "Watch the hill first. We need a before picture.",
      playing: "Follow the water path. Something tiny is riding along.",
      pausedForPrediction: "Prediction time. What is the water carrying?",
      correct: "You spotted it. The moving pieces are sediment.",
      support: "Look at the tiny brown pieces inside the water.",
      exitCheck: "Now test the idea somewhere new.",
      complete: "Treatment logged. You used the visual evidence.",
    },
  }),
  "red-blood-cells": validateVisualBrief({
    id: "red-blood-cells",
    template: "carrier-flow",
    topic: "Red Blood Cells",
    title: "How blood carries oxygen",
    learningGoal:
      "Understand that red blood cells carry oxygen from the lungs to body tissue.",
    childHook:
      "Cells are the carriers: follow one cell and spot what it picks up.",
    carePlanNote: {
      assumption:
        "The child may know blood moves, but not what red blood cells carry or where the oxygen goes.",
      intervention:
        "Use the same carrier-flow model with a body-lab skin and a prediction pause.",
    },
    palette: {
      page: "#fff0f4",
      sceneBgTop: "#351047",
      sceneBgBottom: "#9c174f",
      land: "#d6335c",
      landDark: "#7b1239",
      carrier: "#f0445f",
      carrierLight: "#ffb3c2",
      payload: "#67d9ff",
      payloadGlow: "#d7f8ff",
      accent: "#7dd3fc",
      ink: "#2c0d1f",
      card: "#fff6fb",
    },
    world: "bloodstream",
    actors: {
      carrier: { label: "red blood cells", visual: "round flexible cells" },
      payload: { label: "oxygen", visual: "bright blue O2 molecules" },
      source: { label: "lungs", visual: "oxygen pickup zone" },
      destination: { label: "body tissue", visual: "delivery zone" },
    },
    checkpoints: [
      {
        id: "start",
        t: 0,
        label: "Start",
        caption: "A red blood cell enters the vessel.",
      },
      {
        id: "carrier-enters",
        t: 0.3,
        label: "Pickup",
        caption: "Near the lungs, the cell picks up oxygen.",
      },
      {
        id: "payload-moves",
        t: 0.58,
        label: "Carry",
        caption: "The red blood cell carries oxygen through the vessel.",
      },
      {
        id: "reveal",
        t: 0.78,
        label: "Reveal",
        caption: "The oxygen travels with the cell toward body tissue.",
      },
      {
        id: "after",
        t: 1,
        label: "Deliver",
        caption: "Oxygen is delivered where the body needs it.",
      },
    ],
    prediction: {
      roundId: "rbc-oxygen-prediction",
      targetConcept: "oxygen_transport",
      prompt: "What are the red blood cells carrying?",
      reveal:
        "Red blood cells carry oxygen from the lungs through the blood to body tissue.",
      options: [
        { id: "oxygen", label: "Oxygen molecules", correct: true },
        {
          id: "sugar",
          label: "Tiny grains of sugar",
          correct: false,
          misconception: "blood_cells_carry_sugar",
        },
        {
          id: "water",
          label: "Only plain water",
          correct: false,
          misconception: "blood_is_only_liquid",
        },
      ],
    },
    exitCheck: {
      prompt: "Exit check: where do red blood cells pick up oxygen?",
      answer: "They pick up oxygen near the lungs, then carry it through the body.",
    },
    companionLines: {
      intro: "Same room, new world. Watch the vessel before it moves.",
      playing: "The red cells are the carriers. Watch what attaches.",
      pausedForPrediction: "Prediction time. What are the cells carrying?",
      correct: "Yes. Oxygen is the cargo moving with the cells.",
      support: "Look for the bright blue oxygen dots near the cell.",
      exitCheck: "Now connect the carrier to the pickup place.",
      complete: "Treatment logged. You followed the carrier and cargo.",
    },
  }),
};

export function getVisualBrief(id: VisualBriefId): VisualBrief {
  return visualBriefs[id];
}

export function buildVisualExplainerConfigFromBrief(
  brief: VisualBrief,
  nodeId = `demo-${brief.id}-treatment`,
): VisualExplainerConfig {
  return {
    activityId: "visual-explainer",
    nodeId,
    topic: brief.topic,
    learningGoal: brief.learningGoal,
    childHook: brief.childHook,
    carePlanNote: brief.carePlanNote,
    animation: {
      durationMs: 9000,
      predictionAt: 0.48,
    },
    checkpoints: brief.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      t: checkpoint.t,
      caption: checkpoint.caption,
    })),
    prediction: brief.prediction,
    exitCheck: brief.exitCheck,
    companion: {
      ...companionBase,
      lines: [
        {
          id: "intro",
          state: "intro",
          expression: "encouraging",
          text: brief.companionLines.intro,
        },
        {
          id: "playing",
          state: "playing",
          expression: "thinking",
          text: brief.companionLines.playing,
        },
        {
          id: "pausedForPrediction",
          state: "pausedForPrediction",
          expression: "thinking",
          text: brief.companionLines.pausedForPrediction,
        },
        {
          id: "reveal-correct",
          state: "reveal.correct",
          expression: "celebrating",
          text: brief.companionLines.correct,
        },
        {
          id: "reveal-support",
          state: "reveal.support",
          expression: "supporting",
          text: brief.companionLines.support,
        },
        {
          id: "exitCheck",
          state: "exitCheck",
          expression: "encouraging",
          text: brief.companionLines.exitCheck,
        },
        {
          id: "complete",
          state: "complete",
          expression: "celebrating",
          text: brief.companionLines.complete,
        },
      ],
    },
  };
}
