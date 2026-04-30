import { getNodeAudioDefaults } from "./nodeAudioDefaults";

export type MapNodeSessionAudioFlags = {
  companionTtsMuted: boolean;
  micMuted: boolean;
  /** `set_mute` payload: server-side capture mute */
  serverMicMuted: boolean;
};

/**
 * Audio flags when the adventure map reports the active flow-game node type,
 * or `null` when the learner is back on the map (no launched node).
 */
export function mapNodeSessionAudioFlags(
  mapNodeType: string | null,
): MapNodeSessionAudioFlags {
  if (!mapNodeType) {
    return {
      companionTtsMuted: false,
      micMuted: false,
      serverMicMuted: false,
    };
  }

  const d = getNodeAudioDefaults(mapNodeType);
  const shouldMuteCompanionMic = d.companionMicDefault === "off";
  const gameFeedsStt =
    shouldMuteCompanionMic &&
    (mapNodeType === "karaoke" ||
      mapNodeType === "pronunciation" ||
      mapNodeType === "word-radar" ||
      mapNodeType === "word_radar");

  return {
    companionTtsMuted: d.companionTtsDefault === "off",
    micMuted: gameFeedsStt ? false : shouldMuteCompanionMic,
    serverMicMuted: gameFeedsStt ? false : shouldMuteCompanionMic,
  };
}
