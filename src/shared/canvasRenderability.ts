import { TEACHING_TOOLS, REWARD_GAMES } from "../server/games/registry";

export type GameMode = keyof typeof TEACHING_TOOLS | keyof typeof REWARD_GAMES;

const GAME_MODES = new Set<string>([
  ...Object.keys(TEACHING_TOOLS),
  ...Object.keys(REWARD_GAMES),
]) as ReadonlySet<string>;

export type RenderableCanvasMode =
  | "idle"
  | "teaching"
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
}

export function canvasHasRenderableContent(canvas: RenderableCanvasLike): boolean {
  return Boolean(
    (GAME_MODES.has(canvas.mode) && canvas.gameUrl) ||
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
