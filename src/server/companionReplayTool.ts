import { tool } from "ai";
import { z } from "zod";
import type { CurrentBoardSnapshot } from "./currentBoardSnapshot";

/** What the replay action needs from the live session; nothing else leaks in. */
export type ReplayWordHost = {
  snapshot: () => CurrentBoardSnapshot | null;
  playbackBusy: () => boolean;
  speechRate?: () => number;
  assessmentItemId: () => string | undefined;
  requestNarration: (payload: Record<string, unknown>) => void;
  /** Records the item on screen as helped and opens teaching (contract 54); returns whether it was granted. */
  grantHelp?: () => boolean;
};

/** During a hidden check Elli never holds the word; she can only ask the activity to replay its own audio. */
export function createReplayWordTools(host: ReplayWordHost) {
  const replaySnapshot = host.snapshot();
  if (replaySnapshot?.spellingSupportMode !== "stimulus_only" || !replaySnapshot.spellingTarget) return {};
  // One spelling-help tool (owner, 2026-11-25: companions keep 5 tools or fewer); replay and teach were two.
  const teach = async () => {
    const current = host.snapshot();
    if (!current?.spellingTarget || current.itemId !== replaySnapshot.itemId || current.launchToken !== replaySnapshot.launchToken) return { granted: false, reason: "activity_item_changed" };
    if (!host.grantHelp?.()) return { granted: false, reason: "no_word_on_screen" };
    console.log(` 🎮 [companion] [teach-word] [granted] item=${current.itemId} recorded=help`);
    return { granted: true, word: current.spellingTarget, recordedAs: "help" };
  };
  const replay = async () => {
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
    return { requested: true, configuredSpeechRate: host.speechRate?.() ?? null, playbackConfirmed: false };
  };
  const actions = host.grantHelp ? (["replay", "teach"] as const) : (["replay"] as const);
  return { spellingHelp: tool({
    description: host.grantHelp
      ? "Help with the word on screen. replay: the activity plays its own whole-word audio again (no word given to you; playback is requested, the browser confirms it). teach: you get the word and teach it your own way; her answer on it is recorded as help."
      : "replay: the activity plays its own whole-word audio again (no word given to you; playback is requested, the browser confirms it).",
    inputSchema: z.object({ action: z.enum(actions as unknown as [string, ...string[]]) }),
    execute: async ({ action }) => (action === "teach" ? teach() : replay()),
  }) };
}
