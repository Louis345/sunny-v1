export interface CompanionThemeConfig {
  childName: string;
  companionName: string;
  emoji: string;
  accentColor: string;
  accentBg: string;
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
