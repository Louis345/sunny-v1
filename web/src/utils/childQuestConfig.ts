type ChildProfileRow = { questUnlocked?: boolean };

/**
 * Manual gate from `children.config.json` per child (Friday ship path).
 * // TODO: replace questUnlocked with computeQuestThreshold(childId)
 */
export function isChildQuestUnlocked(
  childId: string,
  profiles: Record<string, ChildProfileRow | undefined> | undefined,
): boolean {
  const id = childId.trim().toLowerCase();
  return profiles?.[id]?.questUnlocked === true;
}
