export const GAME_SFX = {
  pronunciation: {
    comboBreaker: "/sfx/pronunciation/combo_breaker.mp3",
  },
} as const;

export type GameSfxGame = keyof typeof GAME_SFX;
export type GameSfxId<G extends GameSfxGame = GameSfxGame> =
  keyof (typeof GAME_SFX)[G];

export function playGameSfx<G extends GameSfxGame>(
  game: G,
  id: GameSfxId<G>,
): void {
  const src = GAME_SFX[game][id] as string | undefined;
  if (!src || typeof Audio === "undefined") return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.85;
    void audio.play().catch((error: unknown) => {
      console.warn(" 🎮 [sfx] play failed", { game, id, error });
    });
  } catch (error) {
    console.warn(" 🎮 [sfx] create failed", { game, id, error });
  }
}
