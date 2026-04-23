export interface NodeAudioConfig {
  companionMicDefault: "on" | "off";
  companionTtsDefault: "on" | "off";
}

const NODE_AUDIO_DEFAULTS: Record<string, NodeAudioConfig> = {
  karaoke: { companionMicDefault: "off", companionTtsDefault: "off" },
  pronunciation: { companionMicDefault: "off", companionTtsDefault: "off" },
  "spell-check": { companionMicDefault: "on", companionTtsDefault: "on" },
  "word-builder": { companionMicDefault: "on", companionTtsDefault: "on" },
  quest: { companionMicDefault: "on", companionTtsDefault: "on" },
  boss: { companionMicDefault: "on", companionTtsDefault: "on" },
};

export function getNodeAudioDefaults(nodeType: string): NodeAudioConfig {
  return (
    NODE_AUDIO_DEFAULTS[nodeType] ?? {
      companionMicDefault: "on",
      companionTtsDefault: "on",
    }
  );
}
