export type LevelRewardKind =
  | "companion_cosmetic"
  | "world_unlock"
  | "bonus_activity"
  | "celebration";

export type LevelRewardCatalogEntry = {
  level: number;
  rewardId: string;
  name: string;
  description: string;
  icon: string;
  kind: LevelRewardKind;
  placeholder: true;
};

/**
 * Read-only foundation for guaranteed level unlocks.
 * Product names and assets are intentionally placeholders until the economy is approved.
 * Mystery-drop contents do not belong in this visible catalog.
 */
export const LEVEL_REWARD_QUEUE: readonly LevelRewardCatalogEntry[] = [
  { level: 1, rewardId: "level-placeholder-01", name: "Reward placeholder 1", description: "Lorem ipsum reward for beginning the adventure.", icon: "✨", kind: "celebration", placeholder: true },
  { level: 2, rewardId: "level-placeholder-02", name: "Reward placeholder 2", description: "Lorem ipsum companion reward.", icon: "🎒", kind: "companion_cosmetic", placeholder: true },
  { level: 3, rewardId: "level-placeholder-03", name: "Reward placeholder 3", description: "Lorem ipsum world reward.", icon: "🌌", kind: "world_unlock", placeholder: true },
  { level: 4, rewardId: "level-placeholder-04", name: "Reward placeholder 4", description: "Lorem ipsum activity reward.", icon: "🎮", kind: "bonus_activity", placeholder: true },
  { level: 5, rewardId: "level-placeholder-05", name: "Milestone placeholder 5", description: "Lorem ipsum major milestone reward.", icon: "🏰", kind: "world_unlock", placeholder: true },
  { level: 6, rewardId: "level-placeholder-06", name: "Reward placeholder 6", description: "Lorem ipsum companion reward.", icon: "🌟", kind: "companion_cosmetic", placeholder: true },
  { level: 7, rewardId: "level-placeholder-07", name: "Reward placeholder 7", description: "Lorem ipsum world reward.", icon: "🗺️", kind: "world_unlock", placeholder: true },
  { level: 8, rewardId: "level-placeholder-08", name: "Reward placeholder 8", description: "Lorem ipsum activity reward.", icon: "🚀", kind: "bonus_activity", placeholder: true },
  { level: 9, rewardId: "level-placeholder-09", name: "Reward placeholder 9", description: "Lorem ipsum companion reward.", icon: "👑", kind: "companion_cosmetic", placeholder: true },
  { level: 10, rewardId: "level-placeholder-10", name: "Milestone placeholder 10", description: "Lorem ipsum major milestone reward.", icon: "🌍", kind: "world_unlock", placeholder: true },
] as const;
