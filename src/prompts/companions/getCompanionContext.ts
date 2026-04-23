import { buildProfile } from "../../profiles/buildProfile";
import { CompanionRegistry } from "./registry";

export async function getCompanionContext(
  childId: string,
  companionOverride?: string,
): Promise<string> {
  const profile = await buildProfile(childId);
  const companionId =
    companionOverride ??
    profile?.companion?.companionId ??
    (childId === "reina" ? "matilda" : "elli");
  const companion = CompanionRegistry.getById(companionId);
  const level = profile?.level ?? 1;
  return [
    `## Companion: ${companion.name}`,
    companion.personalityMarkdown,
    `## Growth context (level ${level})`,
    companion.getGrowthModifier(level),
  ].join("\n\n");
}
