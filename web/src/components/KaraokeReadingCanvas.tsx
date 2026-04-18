import React, { useEffect, useMemo } from "react";
import { useKaraokeReading } from "../hooks/useKaraokeReading";

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
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  backgroundImageUrl?: string;
  accentColor?: string;
  cardBackground?: string;
  fontSize?: number;
  lineHeight?: number;
  wordsPerLine?: number;
  storyTitle?: string;
  onComplete?: () => void;
}

export function KaraokeReadingCanvas({
  words,
  interimTranscript,
  sendMessage,
  backgroundImageUrl,
  accentColor = DEFAULT_ACCENT,
  cardBackground = DEFAULT_CARD_BG,
  fontSize = DEFAULT_FONT_SIZE,
  lineHeight = DEFAULT_LINE_HEIGHT,
  wordsPerLine = 8,
  storyTitle,
  onComplete,
}: KaraokeReadingCanvasProps): React.ReactElement {
  const { wordIndex, skippedIndices, handleSkipWord } = useKaraokeReading({
    words,
    interimTranscript,
    sendMessage,
    onComplete,
  });

  // Always add the karaoke-active class so CompanionLayer knows to minimize.
  useEffect(() => {
    document.body.classList.add("karaoke-active");
    return () => {
      document.body.classList.remove("karaoke-active");
    };
  }, []);

  const accent = accentColor || DEFAULT_ACCENT;
  const skipped = useMemo(
    () => new Set(skippedIndices),
    [skippedIndices],
  );

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
      {/* Dark overlay for image backgrounds */}
      {backgroundImageUrl?.trim() ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* Atmospheric SVG: moon, foliage, fireflies */}
      <svg
        aria-hidden
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {/* Moon */}
        <circle cx="1050" cy="120" r="70" fill="#fff7d6" opacity="0.9" />
        <circle cx="1050" cy="120" r="110" fill="#fff7d6" opacity="0.12" />

        {/* Foliage — dark organic corner anchors */}
        <g fill="#0f2720">
          <ellipse cx="80" cy="100" rx="220" ry="75" transform="rotate(-15 80 100)" />
          <ellipse cx="1120" cy="130" rx="240" ry="85" transform="rotate(20 1120 130)" />
          <ellipse cx="60" cy="700" rx="260" ry="90" transform="rotate(-10 60 700)" />
          <ellipse cx="1140" cy="710" rx="250" ry="100" transform="rotate(15 1140 710)" />
        </g>

        {/* Fireflies */}
        <circle cx="200" cy="350" r="2" fill="#fbbf24" opacity="0.3" />
        <circle cx="980" cy="420" r="1.5" fill="#fbbf24" opacity="0.25" />
        <circle cx="140" cy="500" r="1.5" fill="#fbbf24" opacity="0.2" />
        <circle cx="1060" cy="580" r="2" fill="#fbbf24" opacity="0.3" />
      </svg>

      {/* Content layer */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
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
              style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
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
                style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc", lineHeight: 1.35 }}
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
              maxWidth: 820,
              borderRadius: 28,
              padding: "36px 40px 44px",
              background: cardBackground,
              boxShadow:
                "0 24px 48px rgba(0,0,0,0.35), 0 2px 0 rgba(255,255,255,0.35) inset",
              border: "1.5px solid #e7cfa2",
            }}
          >
            {words.length === 0 ? (
              <div
                style={{ textAlign: "center", color: "rgba(15,23,42,0.45)", fontSize: 18 }}
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
                              ? () => { handleSkipWord(safeWordIndex); }
                              : undefined
                          }
                          onKeyDown={
                            isCurrent
                              ? (ev) => {
                                  if (ev.key === "Enter" || ev.key === " ") {
                                    ev.preventDefault();
                                    handleSkipWord(safeWordIndex);
                                  }
                                }
                              : undefined
                          }
                          style={{
                            cursor: isCurrent ? "pointer" : "default",
                            fontWeight: isCurrent ? 600 : 500,
                            color: isCurrent
                              ? accent
                              : before
                                ? "rgba(15,23,42,0.55)"
                                : "#0f172a",
                            opacity: before ? 0.5 : 1,
                            textDecoration: wasSkipped ? "underline" : undefined,
                            backgroundColor: isCurrent
                              ? accentPillBackground(accent)
                              : "transparent",
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

      {/* Companion placeholder — reserves space; VRM renders on top via CompanionLayer */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: 28,
          bottom: 28,
          zIndex: 3,
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
            position: "relative",
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: DEFAULT_CARD_BG,
            border: "2px solid #e7cfa2",
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          }}
        >
          {/* Left eye */}
          <div
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#2a1d10",
              top: "38%",
              left: "30%",
            }}
          />
          {/* Right eye */}
          <div
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#2a1d10",
              top: "38%",
              right: "30%",
            }}
          />
        </div>
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
          LUMA IS LISTENING
        </div>
      </div>
    </div>
  );
}
