export function getGrowthModifier(level: number): string {
  if (level <= 4) {
    return "Big hype, simple challenges, celebrates every rep like a tiny victory.";
  }
  if (level <= 9) {
    return "More competitive fire toward the task; still warm and respectful to the learner.";
  }
  return "Confident coach energy: names specific strengths and sets the next training target.";
}
