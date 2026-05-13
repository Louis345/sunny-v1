import {
  validateVisualStudioBrief,
  type VisualStudioBrief,
  type VisualStudioBriefId,
} from "./studioBriefSchema";
import { visualBriefs } from "./visualBriefs";

const erosionVisual = visualBriefs.erosion;
const rbcVisual = visualBriefs["red-blood-cells"];

export const visualStudioBriefs: Record<VisualStudioBriefId, VisualStudioBrief> = {
  erosion: validateVisualStudioBrief({
    id: "erosion",
    concept: {
      id: "erosion-sediment-movement",
      target: "Erosion moves sediment over time.",
      learnerProblem:
        "The child may see the land change but miss the invisible causal move: water is carrying tiny rock and soil pieces.",
      mentalModel: "carrier-flow",
      evidenceTargets: [erosionVisual.prediction.targetConcept, "erosion_transfer"],
      misconceptions: ["rocks_disappear", "water_does_nothing"],
    },
    intervention: {
      id: "erosion-visual-explainer",
      type: "visual-explainer",
      briefId: "erosion",
      template: erosionVisual.template,
      goal: erosionVisual.learningGoal,
      predictionTarget: erosionVisual.prediction.targetConcept,
      renderer: {
        current: "carrier-flow-svg",
        targetQuality: "mock-port-studio",
      },
    },
    recall: {
      id: "erosion-coop-recall",
      type: "co-op-quiz",
      template: "sunny-coop-jeopardy",
      sourceInterventionId: "erosion-visual-explainer",
      stakes: "sun-coins",
      turnMode: "child-and-companion",
      categories: ["Vocabulary", "What moved?", "Cause and effect", "Transfer"],
      questions: [
        {
          id: "erosion-recall-sediment",
          targetConcept: erosionVisual.prediction.targetConcept,
          prompt: "What did the water carry down the hill?",
          answer: "Tiny pieces of rock and soil.",
          options: [
            "Tiny pieces of rock and soil",
            "Whole rocks disappearing",
            "Nothing; only water moved",
          ],
          stake: 10,
          misconception: "rocks_disappear",
          companion: {
            choice: "Whole rocks disappearing",
            correct: false,
            reaction: "confused-face",
          },
        },
        {
          id: "erosion-transfer-wind",
          targetConcept: "erosion_transfer",
          prompt: "Could wind also move tiny pieces of rock and soil?",
          answer: "Yes. Wind can move sediment too.",
          options: ["Yes, wind can move sediment", "No, only water can", "No, land never changes"],
          stake: 20,
          companion: {
            choice: "Yes, wind can move sediment",
            correct: true,
            reaction: "proud-smile",
          },
        },
      ],
    },
    evidence: {
      writes: ["activity_target_result", "activity_complete", "recall_result"],
      recordTo: "child-chart",
      successClaim:
        "The child can identify the carrier, the cargo, and transfer the sediment idea to a new force.",
      falsifyClaim:
        "If recall misses sediment or transfer, the care plan should route to another carrier-flow explainer before quest unlock.",
    },
  }),
  "red-blood-cells": validateVisualStudioBrief({
    id: "red-blood-cells",
    concept: {
      id: "red-blood-cells-oxygen-transport",
      target: "Red blood cells carry oxygen from the lungs to body tissue.",
      learnerProblem:
        "The child may know blood moves but not what the red blood cells pick up, carry, and deliver.",
      mentalModel: "carrier-flow",
      evidenceTargets: [rbcVisual.prediction.targetConcept, "oxygen_pickup_location"],
      misconceptions: ["blood_cells_carry_sugar", "blood_is_only_liquid"],
    },
    intervention: {
      id: "rbc-visual-explainer",
      type: "visual-explainer",
      briefId: "red-blood-cells",
      template: rbcVisual.template,
      goal: rbcVisual.learningGoal,
      predictionTarget: rbcVisual.prediction.targetConcept,
      renderer: {
        current: "carrier-flow-svg",
        targetQuality: "mock-port-studio",
      },
    },
    recall: {
      id: "rbc-coop-recall",
      type: "co-op-quiz",
      template: "sunny-coop-jeopardy",
      sourceInterventionId: "rbc-visual-explainer",
      stakes: "sun-coins",
      turnMode: "child-and-companion",
      categories: ["Vocabulary", "What is carried?", "Pickup and deliver", "Transfer"],
      questions: [
        {
          id: "rbc-recall-oxygen",
          targetConcept: rbcVisual.prediction.targetConcept,
          prompt: "What are the red blood cells carrying?",
          answer: "Oxygen molecules.",
          options: ["Oxygen molecules", "Tiny grains of sugar", "Only plain water"],
          stake: 10,
          misconception: "blood_cells_carry_sugar",
          companion: {
            choice: "Tiny grains of sugar",
            correct: false,
            reaction: "surprised-face",
          },
        },
        {
          id: "rbc-recall-lungs",
          targetConcept: "oxygen_pickup_location",
          prompt: "Where do red blood cells pick up oxygen?",
          answer: "Near the lungs.",
          options: ["Near the lungs", "In the fingertips", "Inside the bones"],
          stake: 20,
          companion: {
            choice: "Near the lungs",
            correct: true,
            reaction: "proud-smile",
          },
        },
      ],
    },
    evidence: {
      writes: ["activity_target_result", "activity_complete", "recall_result"],
      recordTo: "child-chart",
      successClaim:
        "The child can name oxygen as the cargo and locate where red blood cells pick it up.",
      falsifyClaim:
        "If recall misses oxygen or the lungs, the care plan should replay the carrier-flow model with stronger labels before quest unlock.",
    },
  }),
};

export function getVisualStudioBrief(id: VisualStudioBriefId): VisualStudioBrief {
  return visualStudioBriefs[id];
}
