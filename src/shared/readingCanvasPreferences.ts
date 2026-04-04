/**
 * Resolved karaoke / reading canvas UI — merged from learning_profile.readingProfile + defaults.
 * Shared by server (context injection, session_context) and web (KaraokeReadingCanvas).
 */
export interface ReadingCanvasPreferences {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  /** CSS font-family stack */
  fontFamilyCss: string;
  background: string;
  wordsPerLine: number;
  highlightColor: string;
  highlightBackground: string;
  dyslexiaMode: boolean;
}

export const DEFAULT_READING_CANVAS_PREFERENCES: ReadingCanvasPreferences = {
  fontSize: 36,
  lineHeight: 2.0,
  fontFamily: "Lexend",
  fontFamilyCss: "'Lexend', Arial, sans-serif",
  background: "#FFF8F0",
  wordsPerLine: 8,
  highlightColor: "#1a56db",
  highlightBackground: "#dbeafe",
  dyslexiaMode: true,
};

function resolveFontStack(fontFamily: string): string {
  if (fontFamily === "Lexend") return "'Lexend', Arial, sans-serif";
  if (fontFamily.includes(",")) return fontFamily;
  return `${fontFamily}, system-ui, sans-serif`;
}

/** Merge optional fields from persisted profile.readingProfile into full preferences. */
export function getReadingCanvasPreferences(
  readingProfile: {
    fontSize?: number;
    lineHeight?: number;
    fontFamily?: string;
    background?: string;
    wordsPerLine?: number;
    highlightColor?: string;
    highlightBackground?: string;
    dyslexiaMode?: boolean;
  } | null | undefined,
): ReadingCanvasPreferences {
  const rp = readingProfile ?? {};
  const fontFamily = rp.fontFamily ?? DEFAULT_READING_CANVAS_PREFERENCES.fontFamily;
  const dyslexia =
    rp.dyslexiaMode ?? DEFAULT_READING_CANVAS_PREFERENCES.dyslexiaMode;
  return {
    fontSize: rp.fontSize ?? DEFAULT_READING_CANVAS_PREFERENCES.fontSize,
    lineHeight: rp.lineHeight ?? DEFAULT_READING_CANVAS_PREFERENCES.lineHeight,
    fontFamily,
    fontFamilyCss: resolveFontStack(fontFamily),
    background: rp.background ?? DEFAULT_READING_CANVAS_PREFERENCES.background,
    wordsPerLine: Math.max(
      4,
      Math.min(
        16,
        rp.wordsPerLine ?? DEFAULT_READING_CANVAS_PREFERENCES.wordsPerLine,
      ),
    ),
    highlightColor:
      rp.highlightColor ?? DEFAULT_READING_CANVAS_PREFERENCES.highlightColor,
    highlightBackground:
      rp.highlightBackground ??
      (dyslexia
        ? DEFAULT_READING_CANVAS_PREFERENCES.highlightBackground
        : "#e0f2fe"),
    dyslexiaMode: dyslexia,
  };
}
