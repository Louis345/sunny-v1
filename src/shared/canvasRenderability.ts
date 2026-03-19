export interface RenderableCanvasLike {
  content?: string;
  label?: string;
  phonemeBoxes?: Array<unknown>;
  placeValueData?: unknown;
  spellingWord?: string;
  svg?: string;
  lottieData?: Record<string, unknown>;
  mode: "idle" | "teaching" | "reward" | "riddle" | "championship" | "place_value" | "spelling";
}

export function canvasHasRenderableContent(canvas: RenderableCanvasLike): boolean {
  return Boolean(
    canvas.content ||
      canvas.label ||
      (canvas.phonemeBoxes && canvas.phonemeBoxes.length > 0) ||
      canvas.placeValueData ||
      canvas.spellingWord ||
      ((canvas.svg || canvas.lottieData) &&
        (canvas.mode === "reward" || canvas.mode === "championship"))
  );
}
