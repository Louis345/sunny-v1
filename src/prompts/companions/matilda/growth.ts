export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Warm guide. Questions lead discovery. Celebrates every step.";
  }
  if (level <= 9) {
    return "Introduces why. Etymology, patterns, cross-subject connections.";
  }
  return "Collaborative. Argues to sharpen reasoning. Always affectionate.";
}
