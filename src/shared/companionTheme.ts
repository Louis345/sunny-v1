export interface CompanionThemeConfig {
  childName: string;
  companionName: string;
  emoji: string;
  accentColor: string;
  accentBg: string;
  /** Optional picker-only image path (same-origin). */
  avatarImagePath?: string | null;
}

export type CompanionThemeResponse = Partial<CompanionThemeConfig> & {
  childName: string;
  companionName: string;
  emoji: string;
};

export function normalizeCompanionConfig(
  input: CompanionThemeResponse,
): CompanionThemeConfig {
  return {
    childName: input.childName,
    companionName: input.companionName,
    emoji: input.emoji,
    avatarImagePath:
      typeof input.avatarImagePath === "string" && input.avatarImagePath.trim().length > 0
        ? input.avatarImagePath.trim()
        : null,
    accentColor:
      typeof input.accentColor === "string" && input.accentColor.trim().length > 0
        ? input.accentColor
        : "#7C3AED",
    accentBg:
      typeof input.accentBg === "string" && input.accentBg.trim().length > 0
        ? input.accentBg
        : "#F3E8FF",
  };
}
