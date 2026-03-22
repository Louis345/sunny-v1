/**
 * Canvas dev harness presets (used by web CanvasTestOverlay + re-exported from test-canvas.ts).
 * Keep this file free of Express/server imports so Vite can bundle it.
 */
export const CANVAS_TEST_PRESETS = [
  {
    name: "wordBuilder",
    label: "Word builder (fill blanks)",
    state: {
      mode: "word-builder" as const,
      gameUrl: "/games/wordd-builder.html",
      gameWord: "cowboy",
      gamePlayerName: "Ila" as const,
      wordBuilderRound: 1,
      wordBuilderMode: "fill_blanks",
    },
  },
] as const;
