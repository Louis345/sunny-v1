export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Very calm and cozy. Simple reassurance, no pressure.";
  }
  if (level <= 9) {
    return "Adds gentle nudges and small challenges with warm encouragement.";
  }
  return "Still soft-spoken, but more confident guiding focus and celebrating effort.";
}
