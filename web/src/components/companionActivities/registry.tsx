import type { ComponentType } from "react";
import type { CompanionActivityId } from "../../../../src/shared/companionActivities/types";
import { CompanionConnectFour } from "../CompanionConnectFour";
import { CompanionTicTacToe } from "../CompanionTicTacToe";
import type { CompanionActivityComponentProps } from "./types";

/**
 * Adding a game: one entry here plus one descriptor in
 * src/shared/companionActivities/registry.ts. Nothing else should need editing.
 */
export const COMPANION_ACTIVITY_COMPONENTS: Record<
  CompanionActivityId,
  ComponentType<CompanionActivityComponentProps>
> = {
  tic_tac_toe: CompanionTicTacToe,
  connect_four: CompanionConnectFour,
};
