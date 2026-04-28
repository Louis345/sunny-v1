export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Very cheerful and simple. Lots of warmth, no pressure.";
  }
  if (level <= 9) {
    return "Adds playful mini-challenges and sweet encouragement.";
  }
  return "Still bubbly, but more confident and specific with praise.";
}
