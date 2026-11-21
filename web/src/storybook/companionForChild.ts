import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { COMPANION_MANIFEST } from "../companion/companions.generated";

/** The child's default companion from the manifest, for Storybook encounters. */
export function companionForChild(childId: string): { companion: CompanionConfig; companionName: string } {
  const entry =
    COMPANION_MANIFEST.find((candidate) => {
      const defaults = candidate.defaultFor;
      return Array.isArray(defaults) ? defaults.includes(childId) : defaults === childId;
    }) ?? COMPANION_MANIFEST.find((candidate) => candidate.id === "elli") ?? COMPANION_MANIFEST[0];

  if (!entry) {
    throw new Error("spark_orb_learning_shell_missing_companion_manifest");
  }
  return {
    companion: entry.companionConfig,
    companionName: entry.name,
  };
}
