const ACTIVITY_THUMBNAILS: Record<string, string> = {
  asteroid: "/thumbnails/activities/asteroid.svg",
  karaoke: "/thumbnails/activities/karaoke.svg",
  "letter-rush": "/thumbnails/activities/letter-rush.svg",
  "monster-stampede": "/thumbnails/activities/monster-stampede.svg",
  pronunciation: "/thumbnails/activities/pronunciation.svg",
  "space-frogger": "/thumbnails/activities/space-frogger.svg",
  "space-invaders": "/thumbnails/activities/space-invaders.svg",
  "speed-catcher": "/thumbnails/activities/speed-catcher.svg",
  "spell-check": "/thumbnails/activities/spell-check.svg",
  "wheel-of-fortune": "/thumbnails/activities/wheel-of-fortune.svg",
  "word-radar": "/thumbnails/activities/word-radar.svg",
  mystery: "/thumbnails/mystery-fallback.svg",
  quest: "/generated/adventure-board-demo/quest.jpeg",
  boss: "/generated/adventure-board-demo/boss.jpeg",
};

/** Stable activity identity art; generated artwork may replace it only after verification. */
export function thumbnailUrlForActivity(activityId: string): string {
  const normalized = activityId.trim().toLowerCase();
  return ACTIVITY_THUMBNAILS[normalized]
    ?? `/thumbnails/activities/${normalized.replace(/[^a-z0-9_-]+/g, "-")}.svg`;
}

export function knownThumbnailUrlForActivity(activityId: string): string | undefined {
  return ACTIVITY_THUMBNAILS[activityId.trim().toLowerCase()];
}
