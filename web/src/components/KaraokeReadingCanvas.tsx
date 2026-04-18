import React, { useEffect, useMemo } from "react";

const DEFAULT_ACCENT = "#6D5EF5";
const DEFAULT_CARD_BG = "#FFF4E2";
const DEFAULT_FONT_SIZE = 40;
const DEFAULT_LINE_HEIGHT = 2.0;
const NUM_STARS = 10;
const SOLID_BG = "#0a1512";

function chunkWordsIntoLines(words: string[], wordsPerLine: number): string[][] {
  if (words.length === 0) return [];
  const lines: string[][] = [];
  const wpl = Math.max(4, Math.min(16, wordsPerLine));
  for (let i = 0; i < words.length; i += wpl) {
    lines.push(words.slice(i, i + wpl));
  }
  return lines;
}

function locateWordInLines(
  lines: string[][],
  globalIdx: number,
): { lineIdx: number; colIdx: number } {
  let g = 0;
  for (let li = 0; li < lines.length; li++) {
    const row = lines[li];
    for (let ci = 0; ci < row.length; ci++) {
      if (g === globalIdx) return { lineIdx: li, colIdx: ci };
      g++;
    }
  }
  const lastLi = Math.max(0, lines.length - 1);
  const lastRow = lines[lastLi] ?? [];
  return { lineIdx: lastLi, colIdx: lastRow.length };
}

function lineStartGlobalIndex(lines: string[][], lineIdx: number): number {
  let g = 0;
  for (let i = 0; i < lineIdx; i++) {
    g += lines[i]?.length ?? 0;
  }
  return g;
}

function accentPillBackground(accent: string): string {
  const t = accent.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return `${t}22`;
  return `${DEFAULT_ACCENT}22`;
}

export interface KaraokeReadingCanvasProps {
  words: string[];
  wordIndex: number;
  onSkipWord: (idx: number) => void;
  storyTitle?: string;
  backgroundImageUrl?: string;
  accentColor?: string;
  cardBackground?: string;
  fontSize?: number;
  lineHeight?: number;
  wordsPerLine?: number;
  /** Indices tapped to skip — optional underline / dim */
  skippedWordIndices?: readonly number[];
  companionMinimized: boolean;
  /** Reserve bottom-right; label only (VRM renders elsewhere) */
  listeningLabel?: string;
}

export function KaraokeReadingCanvas({
  words,
  wordIndex,
  onSkipWord,
  storyTitle,
  backgroundImageUrl,
  accentColor = DEFAULT_ACCENT,
  cardBackground = DEFAULT_CARD_BG,
  fontSize = DEFAULT_FONT_SIZE,
  lineHeight = DEFAULT_LINE_HEIGHT,
  wordsPerLine = 8,
  skippedWordIndices = [],
  companionMinimized,
  listeningLabel = "Companion is listening",
}: KaraokeReadingCanvasProps): React.ReactElement {
  const accent = accentColor || DEFAULT_ACCENT;
  const skipped = useMemo(
    () => new Set(skippedWordIndices.map((n) => n)),
    [skippedWordIndices],
  );

  useEffect(() => {
    if (!companionMinimized) return;
    document.body.classList.add("karaoke-active");
    return () => {
      document.body.classList.remove("karaoke-active");
    };
  }, [companionMinimized]);

  const lines = useMemo(
    () => chunkWordsIntoLines(words, wordsPerLine),
    [words, wordsPerLine],
  );

  const safeWordIndex = Math.min(Math.max(0, wordIndex), Math.max(0, words.length));
  const done = words.length > 0 && safeWordIndex >= words.length;
  const { lineIdx } =
    words.length === 0
      ? { lineIdx: 0 }
      : done
        ? locateWordInLines(lines, words.length)
        : locateWordInLines(lines, safeWordIndex);

  const curLine = lines[lineIdx] ?? [];
  const nextLine = lineIdx < lines.length - 1 ? lines[lineIdx + 1] : null;
  const lineStart = lineStartGlobalIndex(lines, lineIdx);

  const filledStars =
    words.length === 0
      ? 0
      : Math.min(NUM_STARS, Math.ceil((safeWordIndex / words.length) * NUM_STARS));

  const progressRatio = words.length === 0 ? 0 : safeWordIndex / words.length;

  const countDisplay =
    words.length === 0
      ? "0 / 0"
      : done
        ? `${words.length} / ${words.length}`
        : `${Math.min(safeWordIndex + 1, words.length)} / ${words.length}`;

  const bgLayer = backgroundImageUrl?.trim()
    ? {
        backgroundImage: `url("${backgroundImageUrl.replace(/"/g, '\\"')}")`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      }
    : { background: SOLID_BG };

  return (
    <div
      data-testid="karaoke-reading-root"
      style={{
        position: "absolute",
        inset: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        ...bgLayer,
        fontFamily: "'Lexend', system-ui, sans-serif",
      }}
    >
      {backgroundImageUrl?.trim() ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* Ambient particles */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.35,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          width: "100%",
          padding: "20px 24px 120px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Top row: progress pill + optional story badge */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              flex: "1 1 280px",
              minWidth: 0,
              borderRadius: 999,
              padding: "10px 16px",
              background: "rgba(15,23,42,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {Array.from({ length: NUM_STARS }, (_, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 14,
                    lineHeight: 1,
                    color: i < filledStars ? "#fbbf24" : "rgba(148,163,184,0.45)",
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressRatio * 100)}
              data-testid="karaoke-progress-track"
              style={{
                flex: 1,
                minWidth: 60,
                height: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                overflow: "hidden",
              }}
            >
              <div
                data-testid="karaoke-progress-fill"
                style={{
                  height: "100%",
                  width: `${progressRatio * 100}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${accent}, #fbbf24)`,
                  transition: "width 0.35s ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(248,250,252,0.92)",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              {countDisplay}
            </div>
          </div>

          {storyTitle?.trim() ? (
            <div
              style={{
                borderRadius: 999,
                padding: "8px 14px",
                background: "rgba(15,23,42,0.88)",
                border: "1px solid rgba(255,255,255,0.1)",
                maxWidth: 320,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "rgba(148,163,184,0.95)",
                  marginBottom: 4,
                }}
              >
                HOMEWORK STORY
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#f8fafc",
                  lineHeight: 1.35,
                }}
              >
                {storyTitle.trim()}
              </div>
            </div>
          ) : null}
        </div>

        {/* Reading card */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              borderRadius: 28,
              padding: "36px 40px 44px",
              background: cardBackground,
              boxShadow:
                "0 24px 48px rgba(0,0,0,0.35), 0 2px 0 rgba(255,255,255,0.35) inset",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {words.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "rgba(15,23,42,0.45)",
                  fontSize: 18,
                }}
              >
                No words yet.
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize,
                    lineHeight,
                    letterSpacing: "0.06em",
                    textAlign: "center",
                    color: "#0f172a",
                    marginBottom: nextLine ? 18 : 0,
                  }}
                >
                  {curLine.map((word, ci) => {
                    const globalIdx = lineStart + ci;
                    const isCurrent =
                      !done && globalIdx === safeWordIndex && globalIdx < words.length;
                    const before = !done && globalIdx < safeWordIndex;
                    const wasSkipped = skipped.has(globalIdx);
                    return (
                      <span
                        key={`${lineIdx}-${ci}-${globalIdx}`}
                        style={{
                          display: "inline",
                          marginRight: "0.38em",
                          position: "relative",
                          verticalAlign: "baseline",
                        }}
                      >
                        {isCurrent ? (
                          <span
                            style={{
                              position: "absolute",
                              bottom: "100%",
                              left: "50%",
                              transform: "translateX(-50%)",
                              marginBottom: 6,
                              pointerEvents: "none",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                background: "#ea580c",
                                color: "#fffaf0",
                                boxShadow: "0 4px 12px rgba(234,88,12,0.45)",
                              }}
                            >
                              SKIP
                            </span>
                          </span>
                        ) : null}
                        <span
                          role={isCurrent ? "button" : undefined}
                          tabIndex={isCurrent ? 0 : undefined}
                          data-highlighted={isCurrent ? "true" : undefined}
                          onClick={
                            isCurrent
                              ? () => {
                                  onSkipWord(safeWordIndex);
                                }
                              : undefined
                          }
                          onKeyDown={
                            isCurrent
                              ? (ev) => {
                                  if (ev.key === "Enter" || ev.key === " ") {
                                    ev.preventDefault();
                                    onSkipWord(safeWordIndex);
                                  }
                                }
                              : undefined
                          }
                          style={{
                            cursor: isCurrent ? "pointer" : "default",
                            fontWeight: isCurrent ? 600 : before ? 500 : 500,
                            color: isCurrent ? accent : before ? "rgba(15,23,42,0.55)" : "#0f172a",
                            opacity: before ? 0.5 : 1,
                            textDecoration: wasSkipped ? "underline" : undefined,
                            backgroundColor: isCurrent ? accentPillBackground(accent) : "transparent",
                            borderRadius: isCurrent ? 10 : 0,
                            padding: isCurrent ? "4px 10px" : "2px 0",
                            transition: "color 0.2s, background-color 0.2s",
                          }}
                        >
                          {word}
                        </span>
                      </span>
                    );
                  })}
                </div>

                {nextLine ? (
                  <div
                    style={{
                      fontSize: Math.max(22, Math.round(fontSize * 0.72)),
                      lineHeight,
                      letterSpacing: "0.06em",
                      textAlign: "center",
                      color: "#0f172a",
                      opacity: 0.35,
                    }}
                  >
                    {nextLine.join(" ")}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Placeholder listening slot (VRM is separate layer) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: 28,
          bottom: 28,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          width: 112,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "linear-gradient(145deg, rgba(255,255,255,0.2), rgba(15,23,42,0.5))",
            border: "2px solid rgba(255,255,255,0.25)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
          }}
        />
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.14em",
            color: "rgba(248,250,252,0.85)",
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          {listeningLabel.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
