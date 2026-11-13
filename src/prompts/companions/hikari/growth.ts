export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Gentle and glowing. Lots of wonder, no pressure.";
  }
  if (level <= 9) {
    return "Adds playful sky-high challenges and specific, sparkly praise.";
  }
  return "A confident teammate. Teases kindly and dreams up big ideas together.";
}
