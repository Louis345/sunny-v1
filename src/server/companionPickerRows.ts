export function companionPickerIdentity(input: {
  legacyName: string;
  chartCompanionId?: string | null;
  chartDisplayName?: string | null;
}): { companionId: string; companionName: string } {
  const legacyName = input.legacyName.trim() || "Companion";
  const companionId = input.chartCompanionId?.trim().toLowerCase()
    || legacyName.toLowerCase();
  const companionName = input.chartDisplayName?.trim()
    || companionId.charAt(0).toUpperCase() + companionId.slice(1);
  return { companionId, companionName };
}
