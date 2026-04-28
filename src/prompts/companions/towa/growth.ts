export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Soft, stylish, and reassuring. Keep it simple and warm.";
  }
  if (level <= 9) {
    return "Adds fashion-flavored confidence boosts and gentle challenges.";
  }
  return "More expressive and loyal, like a trusted glow-in-the-dark friend.";
}
