export const visualLearnerCoopRecallFixtureStates = [
  "child-turn",
  "companion-turn",
  "wrong-answer",
  "teach-back",
  "complete",
] as const;

export type VisualLearnerCoopRecallFixtureState =
  (typeof visualLearnerCoopRecallFixtureStates)[number];

const SOLID_FACES_CONFIG =
  "/generated/openai-visual-probe/2d-faces-of-3d-solids-cube-square-prism-rectangle-cylinder-cone-circle-b-1778718658762/artifact.config.json";

export function makeVisualLearnerCoopRecallStorybookUrl(
  state: VisualLearnerCoopRecallFixtureState,
): string {
  const params = new URLSearchParams({
    fixtureState: state,
    childId: "qa",
    childName: "QA",
    companion: "matilda",
    companionName: "Matilda",
    nodeId: `storybook-visual-learner-coop-recall-${state}`,
    companionCurrency: "318",
  });
  const configQuery = `config=${encodeURIComponent(SOLID_FACES_CONFIG)}`;
  const previewQuery = "preview=storybook";
  return `/games/visual-learner-coop-recall.html?${configQuery}&${previewQuery}&${params.toString()}`;
}
