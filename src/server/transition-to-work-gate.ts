import type { CompanionConfig } from "../companions/loader";

export function shouldTriggerTransitionToWorkPhase(
  roundNumber: number,
  companion: Pick<CompanionConfig, "transitionToWorkAfterRounds">,
  transitionedToWork: boolean,
): boolean {
  return (
    companion.transitionToWorkAfterRounds != null &&
    roundNumber >= companion.transitionToWorkAfterRounds &&
    !transitionedToWork
  );
}
