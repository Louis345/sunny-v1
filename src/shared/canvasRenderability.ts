import { TEACHING_TOOLS, REWARD_GAMES } from "../server/games/registry";

export type GameMode = keyof typeof TEACHING_TOOLS | keyof typeof REWARD_GAMES;

const GAME_MODES = new Set<string>([
  ...Object.keys(TEACHING_TOOLS),
  ...Object.keys(REWARD_GAMES),
]) as ReadonlySet<string>;

/** Modes where barge-in must not send canvas_draw:idle — stable activity surface, not ephemeral assistant art. */
const BARGE_IN_PRESERVE_CANVAS_MODES = new Set<string>([
  "worksheet_pdf",
  "word-builder",
  "spell-check",
  ...Object.keys(TEACHING_TOOLS),
  ...Object.keys(REWARD_GAMES),
]);

/** True when the server should keep the current canvas after barge-in (skip idle reset). */
export function canvasStatePersistsThroughBargeIn(
  state: Record<string, unknown> | null | undefined,
): boolean {
  if (!state) return false;
  const mode = state.mode;
  return typeof mode === "string" && BARGE_IN_PRESERVE_CANVAS_MODES.has(mode);
}

export type RenderableCanvasMode =
  | "idle"
  | "teaching"
  | "worksheet_pdf"
  | "reward"
  | "riddle"
  | "championship"
  | "place_value"
  | "spelling"
  | GameMode;

export interface RenderableCanvasLike {
  content?: string;
  label?: string;
  phonemeBoxes?: Array<unknown>;
  placeValueData?: unknown;
  spellingWord?: string;
  svg?: string;
  lottieData?: Record<string, unknown>;
  mode: RenderableCanvasMode;
  gameUrl?: string;
  pdfAssetUrl?: string;
}

export function canvasHasRenderableContent(canvas: RenderableCanvasLike): boolean {
  return Boolean(
    (GAME_MODES.has(canvas.mode) && canvas.gameUrl) ||
      (canvas.mode === "worksheet_pdf" && canvas.pdfAssetUrl) ||
      canvas.content ||
      canvas.label ||
      (canvas.phonemeBoxes && canvas.phonemeBoxes.length > 0) ||
      canvas.placeValueData ||
      canvas.spellingWord ||
      ((canvas.svg || canvas.lottieData) &&
        (canvas.mode === "reward" ||
          canvas.mode === "championship" ||
          canvas.mode === "teaching"))
  );
}
