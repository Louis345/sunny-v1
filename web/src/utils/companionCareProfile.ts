import type { CompanionCareView } from "../../../src/shared/companionCareTypes";

export interface CompanionCareProfileLike {
  companionCare?: CompanionCareView | null;
  care_plan?: {
    companion_care?: CompanionCareView | null;
  } | null;
}

export function getCompanionCareFromProfile(
  profile: CompanionCareProfileLike | null | undefined,
): CompanionCareView | null {
  return profile?.care_plan?.companion_care ?? profile?.companionCare ?? null;
}
