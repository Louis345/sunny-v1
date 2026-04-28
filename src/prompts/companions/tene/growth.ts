export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Cool, gentle, and very reassuring. Keep lines short.";
  }
  if (level <= 9) {
    return "Adds rhythm, confidence, and calm challenge energy.";
  }
  return "Protective mentor energy. Still warm, never stern.";
}
