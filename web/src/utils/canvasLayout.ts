/** Rem-based font size limits for teaching canvas text. */
export const CANVAS_FONT_BOUNDS = { min: 1.25, max: 6 } as const;

const TEACHING_FONT_BREAKPOINTS: { maxLen: number; size: number }[] = [
  { maxLen: 5, size: 6 },
  { maxLen: 8, size: 4.5 },
  { maxLen: 12, size: 3.5 },
  { maxLen: 18, size: 2.75 },
  { maxLen: 25, size: 2.25 },
  { maxLen: 35, size: 1.75 },
];

const FALLBACK_SIZE = 1.25;

function clampToCanvasBounds(size: number): number {
  return Math.min(
    CANVAS_FONT_BOUNDS.max,
    Math.max(CANVAS_FONT_BOUNDS.min, size)
  );
}

/**
 * Maps homework / teaching string length to a font size (rem), longest = smallest.
 */
export function computeTeachingFontSize(charCount: number): number {
  const raw = Number(charCount);
  const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;

  for (const row of TEACHING_FONT_BREAKPOINTS) {
    if (n <= row.maxLen) {
      return clampToCanvasBounds(row.size);
    }
  }
  return clampToCanvasBounds(FALLBACK_SIZE);
}

export function remToCss(rem: number): string {
  return `${rem}rem`;
}

/** Whether TeachingContent should mount for this canvas slice (display logic only). */
export function shouldRenderTeachingContent(canvas: {
  mode: string;
  svg?: string;
  content?: string;
  phonemeBoxes?: unknown[];
}): boolean {
  if (canvas.mode !== "teaching") return false;
  return !!(
    (canvas.phonemeBoxes && canvas.phonemeBoxes.length > 0) ||
    (canvas.content && canvas.content.length > 0) ||
    (canvas.svg && canvas.svg.length > 0)
  );
}
