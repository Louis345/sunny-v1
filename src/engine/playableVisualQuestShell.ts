import { renderQuestBossFreeVisionShell } from "./questBossExperienceShell";
import type {
  QuestBossAssignmentContext,
  QuestBossCandidate,
  QuestBossKind,
} from "./questBossTeamPipeline";

export type PlayableVisualQuestShellInput = {
  kind: QuestBossKind;
  childId: string;
  candidateId: string;
  title: string;
  imagePath: string;
  targetWords: string[];
  assignment: {
    domain: string;
    title: string;
    concepts: string[];
  };
};

export function renderPlayableVisualQuestShell(input: PlayableVisualQuestShellInput): string {
  const assignment: QuestBossAssignmentContext = {
    domain: input.assignment.domain,
    title: input.assignment.title,
    concepts: input.assignment.concepts,
    targetWords: [],
  };
  const candidate: QuestBossCandidate = {
    candidateId: input.candidateId,
    kind: input.kind,
    status: "validated_available",
    title: input.title,
    purpose: "Visual-first hidden recall Quest.",
    description: "A generated visual world becomes the activity while Sunny owns the evidence loop.",
    wrapperTraits: ["mystery", "visual progress", "recall"],
    targetWords: [],
    evidenceRole: input.kind === "boss" ? "mastery_gate" : "intervention",
    imagePath: input.imagePath,
    validationSummary: "playable_visual_shell",
    experienceSkin: {
      theme: input.title,
      visualIntensity: "high",
      worldImagePath: input.imagePath,
      cardImagePath: input.imagePath,
      palette: {
        background: "#02040a",
        surface: "#091423",
        accent: "#65f0ff",
        glow: "#ffe86b",
        text: "#fff7e1",
      },
      focalObject: "generated quest world",
      mechanicMetaphor: "Use memory to unlock the world.",
      companionLines: ["The world is waiting for what you remember."],
      rewardMoment: "A rare charge is ready.",
      wrapperTraits: ["mystery", "visual progress", "recall"],
    },
  };
  return renderQuestBossFreeVisionShell({ candidate, assignment });
}
