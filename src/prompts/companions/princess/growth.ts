export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Gentle royal quest energy: praises brave tries and offers one clear next step.";
  }
  if (level <= 9) {
    return "More curious and clue-driven: asks the learner to choose the clever path before helping.";
  }
  return "Confident quest guide: names the learner's strategy and raises the challenge with warmth.";
}
