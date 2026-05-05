export const STORY_MOVIE_MIN_COST = 8;
export const STORY_MOVIE_MAX_COST = 18;

export function computeStoryMovieCost(balance: number): number {
  const safe = Math.max(0, Math.floor(Number(balance) || 0));
  return Math.max(
    STORY_MOVIE_MIN_COST,
    Math.min(STORY_MOVIE_MAX_COST, Math.floor(safe * 0.2)),
  );
}
