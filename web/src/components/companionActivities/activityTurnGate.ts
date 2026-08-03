/**
 * The reveal gate shared by every companion activity.
 *
 * The companion's move is decided instantly, but it is not shown until the
 * companion's authored line + gesture packet is ready — so the move, the
 * gesture, and the voice land together instead of the board racing ahead.
 * A minimum reveal floor keeps a fast packet from feeling like a reflex.
 */

/** Wall-clock floor for the thinking beat, measured from the child's move. */
export const COMPANION_ACTIVITY_MIN_REVEAL_MS = 1100;

export type CompanionActivityTurnRunner<TPlan> = {
  /**
   * The companion's decision. Accepts a promise so a future engine that needs
   * to think asynchronously (e.g. a WASM chess engine) fits without changing
   * this signature.
   */
  plan: TPlan | Promise<TPlan>;
  /** Resolves when the companion's packet is ready. Absent → floor only. */
  gate?: (plan: TPlan) => Promise<void>;
  minRevealMs?: number;
  /** True if the round was reset/unmounted while the turn was in flight. */
  isStale: () => boolean;
  onReveal: (plan: TPlan) => void;
  onError?: (error: unknown) => void;
};

export async function runCompanionActivityTurn<TPlan>(
  input: CompanionActivityTurnRunner<TPlan>,
): Promise<void> {
  const minRevealMs = input.minRevealMs ?? COMPANION_ACTIVITY_MIN_REVEAL_MS;
  // Started before awaiting the plan so the floor is wall-clock from the
  // child's move, keeping the thinking beat consistent across games.
  const minReveal = new Promise<void>((resolve) => {
    setTimeout(resolve, minRevealMs);
  });

  let plan: TPlan;
  try {
    plan = await input.plan;
  } catch (error: unknown) {
    input.onError?.(error);
    return;
  }

  // Fail open: a packet failure must never leave the board frozen.
  const gate = input.gate
    ? input.gate(plan).catch((error: unknown) => {
        input.onError?.(error);
      })
    : Promise.resolve();

  await Promise.all([gate, minReveal]);
  if (input.isStale()) return;
  input.onReveal(plan);
}
