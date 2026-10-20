import { tool } from "ai";
import { z } from "zod";
import type { CurrentBoardSnapshot } from "./currentBoardSnapshot";

/** What the replay action needs from the live session; nothing else leaks in. */
export type ReplayWordHost = {
  snapshot: () => CurrentBoardSnapshot | null;
  playbackBusy: () => boolean;
  assessmentItemId: () => string | undefined;
  requestNarration: (payload: Record<string, unknown>) => void;
};

/** During a hidden check Elli never holds the word; she can only ask the activity to replay its own audio. */
export function createReplayWordTools(host: ReplayWordHost) {
  const replaySnapshot = host.snapshot();
  if (replaySnapshot?.spellingSupportMode !== "stimulus_only" || !replaySnapshot.spellingTarget) return {};
  return { replayWord: tool({
    description: "Request the current activity's own whole-word stimulus audio. No word argument is needed. This requests playback; browser acknowledgement establishes delivery.",
    inputSchema: z.object({}),
    execute: async () => {
      const current = host.snapshot();
      if (current?.spellingSupportMode !== "stimulus_only"
        || current.nodeId !== replaySnapshot.nodeId || current.itemId !== replaySnapshot.itemId
        || current.launchToken !== replaySnapshot.launchToken || current.itemIndex !== replaySnapshot.itemIndex
        || current.spellingTarget !== replaySnapshot.spellingTarget || current.phase !== replaySnapshot.phase) {
        return { requested: false, reason: "activity_item_changed" };
      }
      if (host.playbackBusy()) return { requested: false, reason: "playback_in_progress" };
      host.requestNarration({
        game: current.game, activityId: current.activityId, nodeId: current.nodeId,
        itemId: current.itemId, launchToken: current.launchToken,
        assessmentMode: host.assessmentItemId() === current.itemId,
        text: current.spellingTarget, word: current.spellingTarget, reason: "companion_replay",
      });
      return { requested: true, playbackConfirmed: false };
    },
  }) };
}
