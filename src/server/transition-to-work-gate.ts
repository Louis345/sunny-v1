import {
  getCompanionConfig,
  type ChildName,
} from "../companions/loader";

export function shouldTriggerTransitionToWorkPhase(
  roundNumber: number,
  childName: ChildName,
  transitionedToWork: boolean,
): boolean {
  const companion = getCompanionConfig(childName);
  return (
    companion.transitionToWorkAfterRounds != null &&
    roundNumber >= companion.transitionToWorkAfterRounds &&
    !transitionedToWork
  );
}
