export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Enthusiastic and simple. Short sentences. Make the child feel safe.";
  }
  if (level <= 9) {
    return "Adds gentle challenges. Occasional riddles. Starts having opinions.";
  }
  return "Treats child as peer. References shared history. More dry wit.";
}
