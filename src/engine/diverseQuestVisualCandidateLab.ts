import type { QuestVisualPromptLabFixture } from "./questVisualPromptLab";

export type DiverseQuestVisualFamily = "mystery_vault" | "strategy_machine" | "cozy_collection";
export type DiverseQuestVisualStatus = "validated_available" | "selected" | "not_selected";

export type DiverseQuestVisualDirection = {
  id: string;
  family: DiverseQuestVisualFamily;
  status: DiverseQuestVisualStatus;
  title: string;
  description: string;
  wrapperTraits: string[];
  prompt: string;
};

export type DiverseQuestVisualChoiceEvent = {
  type: "quest_visual_candidate_choice";
  selectedOptionId: string;
  skippedOptionIds: string[];
  selectedFamily: DiverseQuestVisualFamily;
  skippedFamilies: DiverseQuestVisualFamily[];
  masteryEvidence: false;
};

export type DiverseQuestVisualSelection = {
  selected: DiverseQuestVisualDirection;
  lifecycle: DiverseQuestVisualDirection[];
  choiceEvent: DiverseQuestVisualChoiceEvent;
};

const COMMON_SHELL_CONSTRAINTS =
  "Sunny shell constraints: full-bleed interactive game art; the image is the experience, not a thumbnail; central challenge zone; space for a small hidden input/action strip; progress 1 of 3; reward meter; one clear action area; no companion character inside the iframe; no visible answers, target words, worksheet paper, or generic flat cards; no fake readable UI text; no scoreboards with readable copy. UI text should be minimal and non-answer-related; abstract icons and invented unreadable glyphs are preferred over readable copy.";

const COMMON_STYLE =
  "Style: high-end stylized 3D game concept art, premium reusable learning game quality, colorful but not babyish, cinematic VFX, warm dramatic lighting, polished playful game UI, crisp readable composition, no watermarks.";

export function buildDiverseQuestVisualCandidateDirections(
  fixture: QuestVisualPromptLabFixture,
): DiverseQuestVisualDirection[] {
  const learningTruth = learningTruthForFixture(fixture);
  const preferenceTheory = preferenceTheoryForFixture(fixture);
  const commonIntro =
    `Create a premium 16:9 game screen concept for Sunny, an adaptive learning Quest for ${fixture.child.name}, age ${fixture.child.age}.`;
  const common = [
    commonIntro,
    "",
    `Learning truth: ${learningTruth}`,
    "",
    `Child preference theory: ${preferenceTheory}`,
    "",
    COMMON_SHELL_CONSTRAINTS,
    "",
    COMMON_STYLE,
  ].join("\n");

  return [
    {
      id: "mystery-vault",
      family: "mystery_vault",
      status: "validated_available",
      title: "Secret Spelling Vault",
      description: "A rare unlock world where remembered answers charge sealed vault chambers.",
      wrapperTraits: ["mystery", "rare reward", "visual progress", "surprise"],
      prompt: [
        common,
        "",
        "Concept direction: Mystery vault. Create a luminous fantasy vault in a magical lab/forest hybrid with glowing glyphs, crystal locks, sealed memory chambers, collectible badge energy, and reward anticipation. The child should feel like a rare door is waiting for their remembered signal.",
      ].join("\n"),
    },
    {
      id: "strategy-machine",
      family: "strategy_machine",
      status: "validated_available",
      title: "Memory Engine Workshop",
      description: "A build-and-power world where recalled answers repair a beautiful machine.",
      wrapperTraits: ["strategy", "control", "building", "visual progress"],
      prompt: [
        common,
        "",
        "Concept direction: Strategy machine. Create a premium workshop/control-room game screen with a beautiful central memory engine, empty energy sockets, modular parts, switches, glowing circuits, and repair/build anticipation. The child should feel like their remembered answer powers a real machine, not like they are filling in a worksheet.",
      ].join("\n"),
    },
    {
      id: "cozy-collection",
      family: "cozy_collection",
      status: "validated_available",
      title: "Moonlit Collector Grove",
      description: "A calmer exploration world where recall reveals tiny collectibles and path lights.",
      wrapperTraits: ["cozy", "collection", "exploration", "calm control"],
      prompt: [
        common,
        "",
        "Concept direction: Cozy collection. Create a magical moonlit grove/explorer nook with tiny collectible light charms, soft path markers, a central discovery object, gentle reward anticipation, and calm high-polish game UI. The child should feel curious and in control, like discovering something small and rare through memory.",
      ].join("\n"),
    },
  ];
}

export function selectQuestVisualCandidateDirection(
  directions: DiverseQuestVisualDirection[],
  selectedId: string,
): DiverseQuestVisualSelection {
  const selected = directions.find((direction) => direction.id === selectedId);
  if (!selected) {
    throw new Error(`Unknown Quest visual candidate direction: ${selectedId}`);
  }
  const lifecycle = directions.map((direction) => ({
    ...direction,
    status: direction.id === selectedId ? "selected" as const : "not_selected" as const,
  }));
  const skipped = lifecycle.filter((direction) => direction.id !== selectedId);
  return {
    selected: lifecycle.find((direction) => direction.id === selectedId)!,
    lifecycle,
    choiceEvent: {
      type: "quest_visual_candidate_choice",
      selectedOptionId: selectedId,
      skippedOptionIds: skipped.map((direction) => direction.id),
      selectedFamily: selected.family,
      skippedFamilies: skipped.map((direction) => direction.family),
      masteryEvidence: false,
    },
  };
}

function learningTruthForFixture(fixture: QuestVisualPromptLabFixture): string {
  const topic = fixture.assignment.masteryTopic;
  if (fixture.assignment.domain === "math") {
    return `this is a math mastery quest for ${topic}. The child must prove reasoning by solving a challenge; reasoning should power the world, but no worked answer should be visible in the image.`;
  }
  if (fixture.assignment.domain === "reading") {
    return `this is a reading mastery quest for ${topic}. The child must prove comprehension by using remembered evidence to reveal the route, but no passage answer should be visible in the image.`;
  }
  if (fixture.assignment.domain === "science") {
    return `this is a science mastery quest for ${topic}. The child must prove cause/effect understanding by stabilizing or testing the system, but no answer key should be visible in the image.`;
  }
  return `this is a spelling mastery quest for ${topic}. The child must prove hidden recall by ${fixture.assignment.proofMode}, but the actual spelling target words must NOT be visible in the image.`;
}

function preferenceTheoryForFixture(fixture: QuestVisualPromptLabFixture): string {
  const traits = [...new Set(
    fixture.recentSignals
      .filter((signal) => signal.outcome === "completed" && signal.postActivityAction !== "abandon")
      .flatMap((signal) => signal.wrapperTraits),
  )].slice(0, 8);
  const hooks = traits.length ? traits.join(", ") : "mystery, progress, choice, and playful rewards";
  return `${fixture.child.name} has recent positive signals around ${hooks}. The three candidate worlds should be meaningfully different so the choice teaches Sunny what kind of wrapper is motivating, while all three remain academically valid.`;
}
