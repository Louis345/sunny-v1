import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createRef,
} from "react";
import { useForm } from "react-hook-form";
import { Document, Page, pdfjs } from "react-pdf";
import type {
  OverlayField,
  WorksheetInteractionMode,
} from "../../../src/server/assignment-player";

/** Stable module-level ref so useSession can post messages without a DOM scan */
export const gameIframeRef = createRef<HTMLIFrameElement>();
import { useStaggeredReveal } from "../hooks/useStaggeredReveal";
import { motion } from "framer-motion";
import gsap from "gsap";
import LottieRaw from "lottie-react";
import {
  canvasHasRenderableContent,
  type GameMode as RegistryGameMode,
} from "../../../src/shared/canvasRenderability";
import {
  computeTeachingFontSize,
  remToCss,
  shouldRenderTeachingContent,
} from "../utils/canvasLayout";
import {
  TEACHING_TOOLS,
  REWARD_GAMES,
} from "../../../src/server/games/registry";
import type { BlackboardState } from "../hooks/useSession";
import { BlackboardContent } from "./BlackboardContent";
const Lottie =
  (LottieRaw as unknown as { default: typeof LottieRaw }).default ?? LottieRaw;
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function unescapeSvg(svg: string | undefined): string {
  if (!svg) return "";
  return svg
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

interface PlaceValueData {
  operandA: number;
  operandB: number;
  operation?: "addition" | "subtraction";
  layout?: "expanded" | "column";
  activeColumn?: "hundreds" | "tens" | "ones";
  scaffoldLevel?: "full" | "partial" | "minimal" | "hint";
  revealedColumns?: Array<"hundreds" | "tens" | "ones">;
}

type CanvasCoreMode =
  | "idle"
  | "teaching"
  | "worksheet_pdf"
  | "reward"
  | "riddle"
  | "championship"
  | "place_value"
  | "spelling"
  | "karaoke"
  | "sound_box"
  | "clock"
  | "score_meter";

const GAME_MODES = new Set<string>([
  ...Object.keys(TEACHING_TOOLS),
  ...Object.keys(REWARD_GAMES),
]) as ReadonlySet<string>;

/** Per-game iframe chrome; new registry games fall back to default until styled. */
const GAME_IFRAME_BACKGROUNDS: Partial<Record<RegistryGameMode, string>> = {
  "word-builder": "#121213",
  "spell-check": "#12002e",
  "space-invaders": "#0a0a12",
  "space-frogger": "#0a0a12",
  asteroid: "#000000",
  "bd-reversal": "#12002e",
};

export interface CanvasState {
  mode: CanvasCoreMode | RegistryGameMode;
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  pendingAnswer?: string;
  animationKey?: number;
  placeValueData?: PlaceValueData;
  spellingWord?: string;
  spellingRevealed?: string[];
  showWord?: "hidden" | "hint" | "always";
  compoundBreak?: number;
  streakCount?: number;
  personalBest?: number;
  gameUrl?: string;
  gameWord?: string;
  gamePlayerName?: string;
  wordBuilderRound?: number;
  wordBuilderMode?: string;
  /** Reward iframe (e.g. Space Invaders) — forwarded as GameBridge { config } */
  rewardGameConfig?: Record<string, unknown>;
  pdfAssetUrl?: string;
  pdfPage?: number;
  pdfPageWidth?: number;
  pdfPageHeight?: number;
  activeProblemId?: string;
  activeFieldId?: string;
  overlayFields?: OverlayField[];
  interactionMode?: WorksheetInteractionMode;
}

function runGameIframeOnLoad(
  iframe: HTMLIFrameElement,
  canvas: Pick<
    CanvasState,
    "mode" | "gameWord" | "gamePlayerName" | "wordBuilderMode"
  >,
  onCanvasDone: () => void,
): void {
  onCanvasDone();
  const w = iframe.contentWindow;
  if (!w) return;
  if (canvas.mode === "word-builder") {
    w.postMessage(
      {
        type: "start",
        word: canvas.gameWord ?? "",
        mode: canvas.wordBuilderMode ?? "fill_blanks",
        round: 1,
        playerName: canvas.gamePlayerName ?? "Ila",
        score: 0,
      },
      "*",
    );
  } else if (canvas.mode === "spell-check") {
    w.postMessage(
      {
        type: "start",
        word: canvas.gameWord ?? "",
        playerName: canvas.gamePlayerName ?? "Ila",
      },
      "*",
    );
  }
}

interface RewardEvent {
  rewardStyle: "flash" | "takeover" | "none";
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  displayDuration_ms: number;
}

interface Props {
  canvas: CanvasState;
  blackboard: BlackboardState;
  reward: RewardEvent | null;
  sessionPhase: string;
  sessionState: string;
  accentColor?: string;
  onCanvasDone: () => void;
  onWorksheetAnswer: (payload: {
    problemId: string;
    fieldId: string;
    value: string;
  }) => void;
  onOverlayFieldChange?: (payload: {
    problemId: string;
    field: OverlayField;
    fields: OverlayField[];
    pageWidth: number;
    pageHeight: number;
  }) => void;
}

/** Worksheet asset URL points at a raster image (not a PDF) — use <img>, not react-pdf. */
function isWorksheetRasterImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  const pathOnly = (url.split("?")[0] ?? "").toLowerCase();
  return /\.(png|jpe?g|gif|webp)$/i.test(pathOnly);
}

function normalizeOverlayDraft(
  field: OverlayField,
  pageWidth: number,
  pageHeight: number,
): OverlayField {
  const minSize = 24;
  const width = Math.max(minSize, Math.min(pageWidth, Math.round(field.width)));
  const height = Math.max(
    minSize,
    Math.min(pageHeight, Math.round(field.height)),
  );
  return {
    ...field,
    x: Math.max(0, Math.min(pageWidth - width, Math.round(field.x))),
    y: Math.max(0, Math.min(pageHeight - height, Math.round(field.y))),
    width,
    height,
  };
}

function WorksheetPdfContent({
  canvas,
  onReady,
  onWorksheetAnswer,
  onOverlayFieldChange,
}: {
  canvas: CanvasState;
  onReady: () => void;
  onWorksheetAnswer: Props["onWorksheetAnswer"];
  onOverlayFieldChange?: Props["onOverlayFieldChange"];
}) {
  const { register, handleSubmit, reset } = useForm<Record<string, string>>();
  const displayWidth = 720;
  const pageWidth = canvas.pdfPageWidth ?? 1000;
  const pageHeight = canvas.pdfPageHeight ?? 1400;
  const displayHeight = displayWidth * (pageHeight / pageWidth);
  const isReviewMode = canvas.interactionMode === "review";
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftFields, setDraftFields] = useState<OverlayField[]>(
    () => canvas.overlayFields ?? [],
  );
  const draftFieldsRef = useRef<OverlayField[]>(canvas.overlayFields ?? []);
  const [showOverlayDebug, setShowOverlayDebug] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.location.search.includes("overlayDebug=1");
  });
  const [activeEdit, setActiveEdit] = useState<{
    fieldId: string;
    mode: "drag" | "resize";
    startClientX: number;
    startClientY: number;
    originField: OverlayField;
  } | null>(null);

  useEffect(() => {
    reset({});
    const next = canvas.overlayFields ?? [];
    setDraftFields(next);
    draftFieldsRef.current = next;
  }, [canvas.activeProblemId, canvas.overlayFields, reset]);

  const updateDraftField = useCallback(
    (fieldId: string, transform: (field: OverlayField) => OverlayField) => {
      setDraftFields((prev) => {
        const next = prev.map((field) =>
          field.fieldId === fieldId
            ? normalizeOverlayDraft(transform(field), pageWidth, pageHeight)
            : field,
        );
        draftFieldsRef.current = next;
        return next;
      });
    },
    [pageHeight, pageWidth],
  );

  const emitOverlayFieldChange = useCallback(
    (fieldId: string) => {
      if (!canvas.activeProblemId || !onOverlayFieldChange) return;
      const next = draftFieldsRef.current;
      const field = next.find((entry) => entry.fieldId === fieldId);
      if (!field) return;
      onOverlayFieldChange({
        problemId: canvas.activeProblemId,
        field,
        fields: next,
        pageWidth,
        pageHeight,
      });
    },
    [canvas.activeProblemId, onOverlayFieldChange, pageHeight, pageWidth],
  );

  useEffect(() => {
    if (!activeEdit) return;
    const handlePointerMove = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const dx =
        ((event.clientX - activeEdit.startClientX) / rect.width) * pageWidth;
      const dy =
        ((event.clientY - activeEdit.startClientY) / rect.height) * pageHeight;
      updateDraftField(activeEdit.fieldId, (field) => {
        if (activeEdit.mode === "drag") {
          return {
            ...field,
            x: activeEdit.originField.x + dx,
            y: activeEdit.originField.y + dy,
          };
        }
        return {
          ...field,
          width: activeEdit.originField.width + dx,
          height: activeEdit.originField.height + dy,
        };
      });
    };

    const handlePointerUp = () => {
      emitOverlayFieldChange(activeEdit.fieldId);
      setActiveEdit(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    activeEdit,
    emitOverlayFieldChange,
    pageHeight,
    pageWidth,
    updateDraftField,
  ]);

  const copyOverlayDebugJson = useCallback(async () => {
    const payload = JSON.stringify(draftFieldsRef.current, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
    }
    console.log("[worksheet overlay debug]", payload);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3 self-stretch justify-center">
        {isReviewMode ? (
          <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
            Review mode
          </div>
        ) : null}
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm font-semibold shadow ${
            showOverlayDebug
              ? "bg-amber-500 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
          onClick={() => setShowOverlayDebug((value) => !value)}
        >
          {showOverlayDebug ? "Hide Overlay Debug" : "Show Overlay Debug"}
        </button>
        {showOverlayDebug ? (
          <button
            type="button"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow"
            onClick={() => void copyOverlayDebugJson()}
          >
            Copy Overlay JSON
          </button>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-gray-200 bg-slate-50 shadow"
        style={{ width: displayWidth, height: displayHeight }}
      >
        {canvas.pdfAssetUrl ? (
          isWorksheetRasterImageUrl(canvas.pdfAssetUrl) ? (
            <img
              src={canvas.pdfAssetUrl}
              alt="Worksheet"
              className="absolute inset-0 m-auto h-full w-full object-contain object-center"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
              decoding="async"
              onLoad={() => onReady()}
              onError={() => {
                console.error(
                  "[WorksheetImage] failed to load:",
                  canvas.pdfAssetUrl,
                );
                onReady();
              }}
            />
          ) : (
            <Document
              file={canvas.pdfAssetUrl}
              loading={
                <div className="flex h-full items-center justify-center p-6 text-sm text-gray-500">
                  Loading worksheet...
                </div>
              }
              error={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="text-4xl">📄</div>
                  <p className="text-base font-semibold text-gray-700">
                    Worksheet couldn't load
                  </p>
                  <p className="text-sm text-gray-500">
                    Ask a grown-up to check the connection, then refresh the
                    page.
                  </p>
                </div>
              }
              onLoadError={(err) => {
                console.error(
                  "[WorksheetPdf] failed to load PDF:",
                  canvas.pdfAssetUrl,
                  err,
                );
                onReady();
              }}
            >
              <Page
                pageNumber={canvas.pdfPage ?? 1}
                width={displayWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onRenderSuccess={onReady}
                onRenderError={(err) => {
                  console.error("[WorksheetPdf] failed to render page:", err);
                  onReady();
                }}
              />
            </Document>
          )
        ) : null}
        {(!isReviewMode || showOverlayDebug ? draftFields : []).map((field) => (
          <form
            key={field.fieldId}
            onSubmit={handleSubmit((values) => {
              onWorksheetAnswer({
                problemId: canvas.activeProblemId ?? "",
                fieldId: field.fieldId,
                value: values[field.fieldId] ?? "",
              });
            })}
            className="absolute"
            style={{
              left: `${(field.x / pageWidth) * 100}%`,
              top: `${(field.y / pageHeight) * 100}%`,
              width: `${(field.width / pageWidth) * 100}%`,
              height: `${(field.height / pageHeight) * 100}%`,
            }}
          >
            {showOverlayDebug ? (
              <>
                <button
                  type="button"
                  className="absolute -top-8 left-0 rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setActiveEdit({
                      fieldId: field.fieldId,
                      mode: "drag",
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      originField: field,
                    });
                  }}
                >
                  overlay debug: {field.fieldId}
                </button>
                <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-amber-500 bg-amber-200/20" />
              </>
            ) : null}
            <input
              {...register(field.fieldId)}
              aria-label={field.fieldId}
              placeholder={field.placeholder ?? ""}
              className={`h-full w-full rounded-lg bg-white/90 px-3 text-lg font-bold text-slate-900 shadow ${
                showOverlayDebug
                  ? "border-2 border-amber-500"
                  : "border-2 border-blue-500"
              }`}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit((values) => {
                    onWorksheetAnswer({
                      problemId: canvas.activeProblemId ?? "",
                      fieldId: field.fieldId,
                      value: values[field.fieldId] ?? "",
                    });
                  })();
                }
              }}
            />
            {showOverlayDebug ? (
              <button
                type="button"
                aria-label={`resize-${field.fieldId}`}
                className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-white bg-slate-900 shadow"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setActiveEdit({
                    fieldId: field.fieldId,
                    mode: "resize",
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    originField: field,
                  });
                }}
              />
            ) : null}
          </form>
        ))}
      </div>
      {showOverlayDebug ? (
        <div className="w-full max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-slate-700 shadow-sm">
          <div className="mb-2 font-bold text-amber-900">Overlay debug</div>
          <div className="space-y-2">
            {draftFields.map((field) => (
              <div
                key={field.fieldId}
                className="rounded-md bg-white px-3 py-2 font-mono text-xs shadow-sm"
              >
                {field.fieldId} x={field.x} y={field.y} w={field.width} h=
                {field.height}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {canvas.content ? (
        <div className="max-w-3xl text-center text-lg font-semibold text-slate-700">
          {canvas.content}
        </div>
      ) : null}
    </div>
  );
}

function RewardTakeover({
  reward,
}: {
  reward: RewardEvent & {
    svg?: string;
    lottieData?: Record<string, unknown>;
    label?: string;
  };
}) {
  const showContent = reward?.lottieData || reward?.svg;
  if (!showContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-white flex flex-col items-center justify-center z-10 p-8"
    >
      {reward?.lottieData ? (
        <Lottie
          animationData={reward.lottieData}
          loop={false}
          autoplay={true}
          style={{ width: 320, height: 320 }}
        />
      ) : reward?.svg ? (
        <div
          className="max-w-full max-h-full"
          dangerouslySetInnerHTML={{ __html: unescapeSvg(reward.svg) }}
        />
      ) : null}
      {reward?.label && (
        <div className="absolute bottom-8 text-lg font-medium text-gray-700">
          {reward.label}
        </div>
      )}
    </motion.div>
  );
}

function isMath(content: string): boolean {
  if (!/[\d+\-×÷=]/.test(content)) return false;
  if (content.includes("\n")) return true;
  return content.length < 12;
}

const MATH_MONO: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  fontWeight: 900,
};

function buildTeachingMathParts(
  line: string,
  options: { isLastLine: boolean; normalizedPendingAnswer?: string },
): { type: "num" | "op" | "q"; text: string }[] {
  const tokens = line.split(/\s+/).filter(Boolean);
  const parts: { type: "num" | "op" | "q"; text: string }[] = [];
  for (const t of tokens) {
    if (/^[\d]+$/.test(t)) parts.push({ type: "num", text: t });
    else if (/^[+\-×÷=]$/.test(t)) parts.push({ type: "op", text: t });
  }
  const { isLastLine, normalizedPendingAnswer } = options;
  if (
    isLastLine &&
    parts.length > 0 &&
    parts[parts.length - 1]?.type !== "op"
  ) {
    parts.push({ type: "op", text: "=" });
  }
  if (isLastLine) {
    parts.push({ type: "q", text: normalizedPendingAnswer || "?" });
  }
  return parts;
}

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function spokenToNumber(text: string): number | null {
  const t = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim();
  // Already a numeral
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const words = t.split(/\s+/);
  let result: number | null = null;
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (TENS[w] !== undefined) {
      const next = words[i + 1];
      if (next && ONES[next] !== undefined) {
        result = TENS[w] + ONES[next];
        i += 2;
      } else {
        result = TENS[w];
        i++;
      }
    } else if (ONES[w] !== undefined) {
      result = ONES[w];
      i++;
    } else {
      i++;
    }
  }
  return result;
}

function decompose(n: number) {
  const h = Math.floor(n / 100) * 100;
  const t = Math.floor((n % 100) / 10) * 10;
  const o = n % 10;
  return { h, t, o };
}

const PLACE_VALUE_REVEAL_ORDER = ["hundreds", "tens", "ones"] as const;

function PlaceValueContent({ data }: { data: PlaceValueData }) {
  const nunito = { fontFamily: "'Nunito', sans-serif", fontWeight: 900 };
  const layout = data.layout ?? "column";
  const op = data.operation ?? "addition";
  const scaffold = data.scaffoldLevel ?? "full";
  const active = data.activeColumn;

  const problemKey = `${data.operandA}|${data.operandB}|${op}|${layout}`;
  const targetRevealed = data.revealedColumns ?? [];
  const orderedTarget = PLACE_VALUE_REVEAL_ORDER.filter((k) =>
    targetRevealed.includes(k),
  );
  const revealed = useStaggeredReveal(problemKey, orderedTarget, 125);

  const showLabels = scaffold === "full" || scaffold === "hint";
  const showDividers = scaffold !== "minimal";

  const aD = decompose(data.operandA);
  const bD = decompose(data.operandB);
  const sumH = aD.h + bD.h * (op === "subtraction" ? -1 : 1);
  const sumT = aD.t + bD.t * (op === "subtraction" ? -1 : 1);
  const sumO = aD.o + bD.o * (op === "subtraction" ? -1 : 1);

  const COLS: Array<{ key: "hundreds" | "tens" | "ones"; label: string }> = [
    { key: "hundreds", label: "Hundreds" },
    { key: "tens", label: "Tens" },
    { key: "ones", label: "Ones" },
  ];

  const isActive = (col: "hundreds" | "tens" | "ones") => col === active;
  const isRevealed = (col: "hundreds" | "tens" | "ones") =>
    revealed.includes(col);

  const cellStyle: React.CSSProperties = {
    ...nunito,
    fontSize: "3.5rem",
    lineHeight: 1.1,
    color: "#1a1a2e",
    textAlign: "center",
  };

  const opColor = "#6366f1";

  if (layout === "expanded") {
    const aVals = { hundreds: aD.h, tens: aD.t, ones: aD.o };
    const bVals = { hundreds: bD.h, tens: bD.t, ones: bD.o };
    const sVals = { hundreds: sumH, tens: sumT, ones: sumO };

    const gridBase: React.CSSProperties = {
      display: "grid",
      gridTemplateColumns: "2rem 1fr 2rem 1fr 2rem 1fr",
      alignItems: "center",
      gap: "4px 0",
      width: "100%",
    };

    const valCellStyle = (
      col: "hundreds" | "tens" | "ones",
    ): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "clamp(6px, 2vw, 12px) clamp(4px, 1vw, 8px)",
      borderRadius: 12,
      background: isActive(col) ? "#FFF9F0" : "transparent",
      border: isActive(col)
        ? "3px solid #EF9F27"
        : showDividers
          ? "3px solid #E2E8F0"
          : "3px solid transparent",
      transform: isActive(col) ? "scale(1.06)" : "scale(1)",
      transition: "all 0.25s ease",
    });

    const sepStyle: React.CSSProperties = {
      ...nunito,
      fontSize: "clamp(1rem, 3vw, 1.5rem)",
      color: opColor,
      textAlign: "center",
      lineHeight: 1,
    };

    const responsiveCellStyle: React.CSSProperties = {
      ...cellStyle,
      fontSize: "clamp(1.8rem, 6vw, 3.5rem)",
    };

    return (
      <div
        className="canvas-content w-full"
        style={{ ...nunito, maxWidth: 560, margin: "0 auto" }}
      >
        {showLabels && (
          <div style={{ ...gridBase, marginBottom: 8 }}>
            {COLS.map(({ key, label }) => (
              <React.Fragment key={key}>
                <div />
                <div style={{ textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: "clamp(0.65rem, 2vw, 0.9rem)",
                      color: isActive(key) ? "#EF9F27" : "#94a3b8",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    {label}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
        <div style={gridBase}>
          <div />
          <div style={valCellStyle("hundreds")}>
            <span style={responsiveCellStyle}>{aVals.hundreds}</span>
          </div>
          <span style={sepStyle}>+</span>
          <div style={valCellStyle("tens")}>
            <span style={responsiveCellStyle}>{aVals.tens}</span>
          </div>
          <span style={sepStyle}>+</span>
          <div style={valCellStyle("ones")}>
            <span style={responsiveCellStyle}>{aVals.ones}</span>
          </div>
        </div>
        <div style={{ ...gridBase, marginTop: 4 }}>
          <span style={sepStyle}>{op === "addition" ? "+" : "−"}</span>
          <div style={valCellStyle("hundreds")}>
            <span style={responsiveCellStyle}>{bVals.hundreds}</span>
          </div>
          <span style={sepStyle} />
          <div style={valCellStyle("tens")}>
            <span style={responsiveCellStyle}>{bVals.tens}</span>
          </div>
          <span style={sepStyle} />
          <div style={valCellStyle("ones")}>
            <span style={responsiveCellStyle}>{bVals.ones}</span>
          </div>
        </div>
        <div
          style={{
            height: 3,
            background: "#CBD5E1",
            borderRadius: 2,
            margin: "10px 0",
          }}
        />
        <div style={gridBase}>
          <div />
          <div style={valCellStyle("hundreds")}>
            {isRevealed("hundreds") ? (
              <span style={{ ...responsiveCellStyle, color: "#16a34a" }}>
                {sVals.hundreds}
              </span>
            ) : (
              <span
                className={isActive("hundreds") ? "q-pulse" : ""}
                style={{ ...responsiveCellStyle, color: "#EF9F27" }}
              >
                ?
              </span>
            )}
          </div>
          <span style={sepStyle} />
          <div style={valCellStyle("tens")}>
            {isRevealed("tens") ? (
              <span style={{ ...responsiveCellStyle, color: "#16a34a" }}>
                {sVals.tens}
              </span>
            ) : (
              <span
                className={isActive("tens") ? "q-pulse" : ""}
                style={{ ...responsiveCellStyle, color: "#EF9F27" }}
              >
                ?
              </span>
            )}
          </div>
          <span style={sepStyle} />
          <div style={valCellStyle("ones")}>
            {isRevealed("ones") ? (
              <span style={{ ...responsiveCellStyle, color: "#16a34a" }}>
                {sVals.ones}
              </span>
            ) : (
              <span
                className={isActive("ones") ? "q-pulse" : ""}
                style={{ ...responsiveCellStyle, color: "#EF9F27" }}
              >
                ?
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Column layout — stacked digit-by-digit, like the worksheet
  const aDigits = {
    hundreds: Math.floor(data.operandA / 100) % 10,
    tens: Math.floor(data.operandA / 10) % 10,
    ones: data.operandA % 10,
  };
  const bDigits = {
    hundreds: Math.floor(data.operandB / 100) % 10,
    tens: Math.floor(data.operandB / 10) % 10,
    ones: data.operandB % 10,
  };
  const result =
    op === "subtraction"
      ? data.operandA - data.operandB
      : data.operandA + data.operandB;
  const sumDigits = {
    hundreds: Math.floor(result / 100) % 10,
    tens: Math.floor(result / 10) % 10,
    ones: result % 10,
  };

  const colGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "2.5rem 1fr 1fr 1fr",
    alignItems: "center",
    width: "100%",
  };

  const colCellFont: React.CSSProperties = {
    ...cellStyle,
    fontSize: "clamp(2rem, 8vw, 4rem)",
  };

  return (
    <div
      className="canvas-content"
      style={{ ...nunito, width: "100%", maxWidth: 420 }}
    >
      {showLabels && (
        <div style={{ ...colGridStyle, marginBottom: 4 }}>
          <div />
          {COLS.map(({ key, label }) => (
            <div key={key} style={{ textAlign: "center" }}>
              <span
                style={{
                  fontSize: "clamp(0.65rem, 2vw, 0.85rem)",
                  color: isActive(key) ? "#EF9F27" : "#94a3b8",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          border: "3px solid #E2E8F0",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Row A */}
        <div style={{ ...colGridStyle, borderBottom: "3px solid #E2E8F0" }}>
          <div />
          {COLS.map(({ key }, i) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "clamp(6px, 2vw, 10px) 4px",
                background: isActive(key) ? "#FFF9F0" : "transparent",
                borderLeft:
                  i > 0 && showDividers ? "3px solid #E2E8F0" : "none",
              }}
            >
              <span style={colCellFont}>{aDigits[key]}</span>
            </div>
          ))}
        </div>
        {/* Row B with operator */}
        <div style={colGridStyle}>
          <span
            style={{
              ...nunito,
              fontSize: "clamp(1.4rem, 5vw, 2.5rem)",
              color: opColor,
              textAlign: "center",
              lineHeight: 1,
            }}
          >
            {op === "addition" ? "+" : "−"}
          </span>
          {COLS.map(({ key }, i) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "clamp(6px, 2vw, 10px) 4px",
                background: isActive(key) ? "#FFF9F0" : "transparent",
                borderLeft:
                  i > 0 && showDividers ? "3px solid #E2E8F0" : "none",
              }}
            >
              <span style={colCellFont}>{bDigits[key]}</span>
            </div>
          ))}
        </div>
        {/* Sum row */}
        <div
          style={{
            ...colGridStyle,
            borderTop: "4px double #CBD5E1",
            background: "#F8FAFC",
          }}
        >
          <div />
          {COLS.map(({ key }, i) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "clamp(8px, 2vw, 12px) 4px",
                background: isActive(key) ? "#FFF9F0" : "transparent",
                borderLeft:
                  i > 0 && showDividers ? "3px solid #E2E8F0" : "none",
              }}
            >
              {isRevealed(key) ? (
                <span style={{ ...colCellFont, color: "#16a34a" }}>
                  {sumDigits[key]}
                </span>
              ) : (
                <span
                  className={isActive(key) ? "q-pulse" : ""}
                  style={{ ...colCellFont, color: "#EF9F27" }}
                >
                  ?
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div style={{ textAlign: "center", marginTop: 20, ...nunito }}>
          <span style={{ fontSize: "2rem", color: "#EF9F27" }}>
            {aDigits[active]}
          </span>
          <span style={{ fontSize: "1.4rem", color: opColor }}>
            {" "}
            {op === "addition" ? "+" : "−"}{" "}
          </span>
          <span style={{ fontSize: "2rem", color: "#EF9F27" }}>
            {bDigits[active]}
          </span>
          <span style={{ fontSize: "1.4rem", color: "#64748b" }}> in the </span>
          <span style={{ fontSize: "1.6rem", color: "#EF9F27" }}>
            {active.charAt(0).toUpperCase() + active.slice(1)}
          </span>
          <span style={{ fontSize: "1.4rem", color: "#64748b" }}> place</span>
        </div>
      )}
    </div>
  );
}

function SpellingContent({
  spellingWord,
  spellingRevealed,
  showWord = "hidden",
  compoundBreak,
  streakCount,
  personalBest,
}: {
  spellingWord: string;
  spellingRevealed: string[];
  showWord?: "hidden" | "hint" | "always";
  compoundBreak?: number;
  streakCount?: number;
  personalBest?: number;
}) {
  const nunito = { fontFamily: "'Nunito', sans-serif" };
  const nunito900 = { ...nunito, fontWeight: 900 };

  if (!spellingWord || spellingWord.length === 0) return null;

  const letters = spellingWord.split("");
  const revealed = spellingRevealed ?? [];
  /** hidden: no word above, empty tiles until revealed | hint: no word above, partial in tiles | always: word above + full letters in tiles */
  const showWordAbove = showWord === "always";
  const wordColor = "#64748B";
  const tileChar = (index: number) =>
    showWord === "always" ? letters[index] : (revealed[index] ?? "");

  return (
    <div
      className="canvas-content flex flex-col items-center justify-center w-full flex-1"
      style={{ ...nunito }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        {streakCount != null && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "#EF9F27",
                }}
              >
                🔥 {streakCount}
              </div>
              {personalBest != null && (
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 400,
                    color: "#94A3B8",
                  }}
                >
                  Best: {personalBest}
                </div>
              )}
            </div>
          </div>
        )}

        {showWordAbove && (
          <div
            style={{
              fontSize: remToCss(computeTeachingFontSize(spellingWord.length)),
              fontWeight: 900,
              color: wordColor,
              maxWidth: "100%",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              overflow: "hidden",
              whiteSpace: "pre-wrap",
            }}
          >
            {spellingWord}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {letters.map((_, index) => (
            <React.Fragment key={index}>
              {compoundBreak != null && index === compoundBreak && (
                <div
                  style={{
                    width: 18,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      height: "60%",
                      backgroundColor: "#CBD5E1",
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  width: "clamp(48px, 12vw, 80px)",
                  height: "clamp(48px, 12vw, 80px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "12px",
                  border:
                    index === revealed.length - 1
                      ? "2px solid #EF9F27"
                      : "1.5px solid #CBD5E1",
                  backgroundColor:
                    index === revealed.length - 1 ? "#FFF9F0" : "white",
                  flexShrink: 0,
                  ...nunito900,
                  fontSize: "clamp(1.2rem, 4vw, 2rem)",
                  color: tileChar(index) ? "#1E293B" : "#CBD5E1",
                }}
              >
                {tileChar(index)}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeachingContent({
  content,
  phonemeBoxes,
  label,
  canvasSvg,
  pendingAnswer,
}: {
  content: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  label?: string;
  canvasSvg?: string;
  pendingAnswer?: string;
}) {
  const nunito = { fontFamily: "'Nunito', sans-serif", fontWeight: 900 };

  if (isMath(content)) {
    const rawPending = pendingAnswer?.trim().replace(/[.!?]+$/, "") ?? "";
    const asNumber = rawPending ? spokenToNumber(rawPending) : null;
    const normalizedPendingAnswer =
      asNumber !== null ? String(asNumber) : rawPending || undefined;
    const showQuestionMark = !normalizedPendingAnswer;

    const renderMathSpans = (
      parts: { type: "num" | "op" | "q"; text: string }[],
      keyPrefix: string,
    ) =>
      parts.map((p, i) => (
        <span
          key={`${keyPrefix}-${i}`}
          className={p.type === "q" && showQuestionMark ? "q-pulse" : ""}
          style={{
            ...MATH_MONO,
            fontSize:
              p.type === "num" ? "10rem" : p.type === "op" ? "7rem" : "8rem",
            color:
              p.type === "op"
                ? "#6366f1"
                : p.type === "q"
                  ? showQuestionMark
                    ? "#EF9F27"
                    : "#16a34a"
                  : "#1a1a2e",
            lineHeight: 1,
          }}
        >
          {p.text}
        </span>
      ));

    const rawLines = content.split("\n");
    const lastLineIndex = rawLines.length - 1;

    if (content.includes("\n")) {
      return (
        <div className="space-y-6">
          {canvasSvg && (
            <div
              className="mx-auto max-w-md w-full"
              style={{ minHeight: "200px" }}
              dangerouslySetInnerHTML={{ __html: unescapeSvg(canvasSvg) }}
            />
          )}
          <div
            className="canvas-content flex flex-col items-stretch w-full max-w-3xl mx-auto"
            style={MATH_MONO}
          >
            {rawLines.map((line, lineIdx) => {
              const trimmed = line.trim();
              const isLastLine = lineIdx === lastLineIndex;
              const parts = buildTeachingMathParts(trimmed, {
                isLastLine,
                normalizedPendingAnswer,
              });
              return (
                <div
                  key={`math-line-${lineIdx}`}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginTop: lineIdx > 0 ? "1.2em" : 0,
                    width: "100%",
                  }}
                >
                  {parts.length > 0 ? (
                    renderMathSpans(parts, `v-${lineIdx}`)
                  ) : trimmed ? (
                    <span
                      style={{
                        ...MATH_MONO,
                        fontSize: remToCss(
                          computeTeachingFontSize(trimmed.length),
                        ),
                        color: "#1a1a2e",
                        lineHeight: 1,
                        textAlign: "right",
                        maxWidth: "100%",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        overflow: "hidden",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {trimmed}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {label && (
            <p
              className="text-center text-xl font-medium text-gray-900"
              style={{
                maxWidth: "100%",
                wordBreak: "break-word",
                overflow: "hidden",
              }}
            >
              {label}
            </p>
          )}
        </div>
      );
    }

    const parts = buildTeachingMathParts(content.trim(), {
      isLastLine: true,
      normalizedPendingAnswer,
    });

    return (
      <div className="space-y-6">
        {canvasSvg && (
          <div
            className="mx-auto max-w-md w-full"
            style={{ minHeight: "200px" }}
            dangerouslySetInnerHTML={{ __html: unescapeSvg(canvasSvg) }}
          />
        )}
        <div
          className="canvas-content flex flex-row items-center justify-center gap-4"
          style={nunito}
        >
          {renderMathSpans(parts, "h")}
        </div>
        {label && (
          <p
            className="text-center text-xl font-medium text-gray-900"
            style={{
              maxWidth: "100%",
              wordBreak: "break-word",
              overflow: "hidden",
            }}
          >
            {label}
          </p>
        )}
      </div>
    );
  }

  const letters = content.split("");
  const boxes = phonemeBoxes ?? [];

  return (
    <div className="space-y-6">
      {canvasSvg && (
        <div
          className="mx-auto max-w-md w-full"
          style={{ minHeight: "200px" }}
          dangerouslySetInnerHTML={{ __html: unescapeSvg(canvasSvg) }}
        />
      )}
      {boxes.length > 0 ? (
        <div className="canvas-content flex justify-center items-center gap-4">
          {boxes.map((b, i) => (
            <div
              key={i}
              className="flex items-center justify-center rounded-xl transition-transform duration-200 ease-out"
              style={{
                minWidth: 100,
                minHeight: 120,
                border: `4px solid ${b.highlighted ? "#EF9F27" : "#CBD5E1"}`,
                background: b.highlighted ? "#FFF9F0" : "white",
                transform: b.highlighted ? "scale(1.08)" : "scale(1)",
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 900,
                fontSize: "5rem",
                color: "#1a1a2e",
                lineHeight: 1,
              }}
            >
              {b.value}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="canvas-content flex justify-center items-end gap-1"
          style={{ flexWrap: "wrap" }}
        >
          {letters.map((letter, i) => {
            const activeBox = boxes.find((b) => b.highlighted);
            const activeIndex = activeBox
              ? activeBox.position === "first"
                ? 0
                : activeBox.position === "last"
                  ? letters.length - 1
                  : Math.floor(letters.length / 2)
              : -1;
            const isActive = i === activeIndex;
            return (
              <span
                key={i}
                className="letter-bounce"
                style={{
                  fontSize: remToCss(computeTeachingFontSize(content.length)),
                  lineHeight: 1,
                  color: isActive ? "#EF9F27" : "#1a1a2e",
                  borderBottom: isActive
                    ? "6px solid #EF9F27"
                    : "6px solid transparent",
                  paddingBottom: "4px",
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 900,
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      )}
      {label && (
        <p
          className="text-center text-xl font-medium text-gray-900"
          style={{
            maxWidth: "100%",
            wordBreak: "break-word",
            overflow: "hidden",
          }}
        >
          {label}
        </p>
      )}
      {pendingAnswer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center gap-2"
          style={{
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 900,
            fontSize: "3rem",
            color: "#EF9F27",
          }}
        >
          {pendingAnswer}
          <span className="pending-dot" />
        </motion.div>
      )}
    </div>
  );
}

function CanvasRewardVisual({
  svg,
  lottieData,
}: {
  svg?: string;
  lottieData?: Record<string, unknown>;
}) {
  if (lottieData) {
    return (
      <div className="canvas-content mx-auto mb-4 max-w-[200px]">
        <Lottie
          animationData={lottieData}
          loop={false}
          autoplay={true}
          style={{ width: 200, height: 200 }}
        />
      </div>
    );
  }
  if (svg) {
    return (
      <div
        className="canvas-content mx-auto mb-4 max-w-[200px]"
        dangerouslySetInnerHTML={{ __html: unescapeSvg(svg) }}
      />
    );
  }
  return null;
}

function spawnParticles(
  container: HTMLElement | null,
  count: number,
  color: string,
) {
  if (!container) return;
  container.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "particle";
    el.style.cssText = `
      position: absolute;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: ${color};
      left: 50%; top: 50%;
      pointer-events: none;
    `;
    container.appendChild(el);

    const angle = (i / count) * Math.PI * 2;
    const dist = 80 + Math.random() * 60;
    gsap.fromTo(
      el,
      { x: 0, y: 0, opacity: 1, scale: 1 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        opacity: 0,
        scale: 0.3,
        duration: 0.8 + Math.random() * 0.4,
        ease: "power2.out",
        delay: Math.random() * 0.1,
      },
    );
  }
}

function CanvasLoader() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "5px solid #f0f0f0",
          borderTopColor: "#EF9F27",
          animation: "canvasSpin 0.7s linear infinite",
        }}
      />
      <div
        style={{
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 800,
          fontSize: 14,
          color: "#94a3b8",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Loading...
      </div>
    </div>
  );
}

export function Canvas({
  canvas,
  blackboard,
  reward,
  sessionPhase,
  sessionState,
  accentColor = "#854F0B",
  onCanvasDone,
  onWorksheetAnswer,
  onOverlayFieldChange,
}: Props) {
  console.log("[Canvas] render:", {
    mode: canvas.mode,
    hasSvg: !!canvas.svg,
    willRender: shouldRenderTeachingContent(canvas),
  });
  const [displayContent, setDisplayContent] = useState("");
  const [riddleLabel, setRiddleLabel] = useState("");
  const [displayMode, setDisplayMode] = useState<CanvasState["mode"]>("idle");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const particlesRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef<string>(canvas.mode);
  const transitionFromRef = useRef<string>(canvas.mode);

  const handleCanvasDone = useCallback(() => {
    onCanvasDone();
    requestAnimationFrame(() => {
      setIsTransitioning(false);
    });
  }, [onCanvasDone]);

  const showReward =
    reward?.rewardStyle === "takeover" && (reward.svg || reward.lottieData);
  const showFlash = reward?.rewardStyle === "flash";

  const showBlackboard =
    blackboard.gesture !== null &&
    blackboard.gesture !== "clear" &&
    canvas.mode === "idle";

  const runAnimation = useCallback(
    (payload: CanvasState) => {
      const { mode, content, label } = payload;
      const text = content ?? label ?? "";

      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
      gsap.killTweensOf(".canvas-content");

      switch (mode) {
        case "teaching": {
          if (!text.trim()) {
            setDisplayContent("");
            setDisplayMode("teaching");
            setRiddleLabel("");
            handleCanvasDone();
            return;
          }
          setDisplayContent(text);
          setDisplayMode("teaching");
          setRiddleLabel("");
          // Signal the server immediately — the canvas state is committed and
          // the content is visible. GSAP runs as a cosmetic enhancement in the
          // background; TTS must not wait for it. Firing inside rAF was the root
          // cause of canvas_done timeouts when React rendering was slower than
          // the 2 s server timeout (especially with TTS disabled in dev mode).
          handleCanvasDone();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { scale: 0.3, opacity: 0, y: -40 },
                {
                  scale: 1,
                  opacity: 1,
                  y: 0,
                  duration: 0.4,
                  ease: "elastic.out(1, 0.5)",
                },
              );
            });
          });
          break;
        }
        case "karaoke":
        case "sound_box":
        case "clock":
        case "score_meter": {
          const line =
            mode === "score_meter" && label
              ? `${label}: ${text}`
              : text || label || "";
          setDisplayContent(line);
          setDisplayMode("teaching");
          setRiddleLabel("");
          handleCanvasDone();
          break;
        }
        case "worksheet_pdf": {
          setDisplayContent("");
          setDisplayMode("worksheet_pdf");
          setRiddleLabel("");
          handleCanvasDone();
          break;
        }
        case "riddle": {
          setDisplayMode("riddle");
          setDisplayContent("");
          setRiddleLabel(label ?? "");
          let i = 0;
          typewriterRef.current = setInterval(() => {
            i++;
            setDisplayContent(text.slice(0, i));
            if (i >= text.length) {
              if (typewriterRef.current) {
                clearInterval(typewriterRef.current);
                typewriterRef.current = null;
              }
              handleCanvasDone();
            }
          }, 18);
          break;
        }
        case "reward": {
          setDisplayContent(label ?? text);
          setDisplayMode("reward");
          setRiddleLabel("");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { scale: 1.4, opacity: 0 },
                { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" },
              );
              spawnParticles(particlesRef.current, 12, "#FFD700");
              setTimeout(() => handleCanvasDone(), 800);
            });
          });
          break;
        }
        case "championship": {
          setDisplayContent(label ?? text);
          setDisplayMode("championship");
          setRiddleLabel("");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { scale: 0, rotation: -15, opacity: 0 },
                {
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                  duration: 0.6,
                  ease: "elastic.out(1, 0.4)",
                },
              );
              spawnParticles(particlesRef.current, 20, "#FFD700");
              setTimeout(() => handleCanvasDone(), 1200);
            });
          });
          break;
        }
        case "place_value": {
          setDisplayMode("place_value");
          setDisplayContent("");
          setRiddleLabel("");
          if (!payload.placeValueData) {
            handleCanvasDone();
            break;
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gsap.fromTo(
                ".canvas-content",
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
              );
              handleCanvasDone();
            });
          });
          break;
        }
        case "spelling": {
          setDisplayMode("spelling");
          setDisplayContent("");
          setRiddleLabel("");
          if (!payload.spellingWord) {
            handleCanvasDone();
            break;
          }
          handleCanvasDone();
          break;
        }
        default:
          setDisplayContent("");
          setDisplayMode("idle");
          setRiddleLabel("");
      }
    },
    [handleCanvasDone],
  );

  useEffect(() => {
    const prevMode = prevModeRef.current;
    transitionFromRef.current = prevMode;

    if (canvas.mode === "idle") {
      setIsTransitioning(false);
    }
    // Skip overlay: first paint (idle → *), clear (* → idle), enter game (iframe loads itself).
    // Do NOT skip worksheet_pdf ↔ teaching or other non-game mode changes.
    const skipLoader =
      prevMode === "idle" ||
      canvas.mode === "idle" ||
      GAME_MODES.has(canvas.mode);

    if (!skipLoader && canvas.mode !== prevMode) {
      setIsTransitioning(true);
    }
    prevModeRef.current = canvas.mode;

    const hasContent = canvasHasRenderableContent(canvas);
    // Game iframes do not use runAnimation; clear stale teaching/riddle display so
    // we never show math/text alongside Word Builder / Spell Check (BUG-024).
    if (GAME_MODES.has(canvas.mode)) {
      setDisplayContent("");
      setDisplayMode("idle");
      setRiddleLabel("");
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
      gsap.killTweensOf(".canvas-content");
      return () => {
        if (typewriterRef.current) {
          clearInterval(typewriterRef.current);
        }
      };
    }
    if (canvas.mode === "teaching") {
      const teachingText = (canvas.content ?? canvas.label ?? "").trim();
      const hasTeachingVisual = shouldRenderTeachingContent({
        mode: canvas.mode,
        svg: canvas.svg,
        content: teachingText,
        phonemeBoxes: canvas.phonemeBoxes,
      });
      if (!hasTeachingVisual) {
        setDisplayContent("");
        setDisplayMode("teaching");
        setRiddleLabel("");
        if (typewriterRef.current) {
          clearInterval(typewriterRef.current);
          typewriterRef.current = null;
        }
        gsap.killTweensOf(".canvas-content");
        handleCanvasDone();
        return () => {
          if (typewriterRef.current) {
            clearInterval(typewriterRef.current);
          }
        };
      }
    }
    if (
      canvas.mode !== "idle" &&
      hasContent &&
      (canvas.mode === "teaching" ||
        canvas.mode === "worksheet_pdf" ||
        canvas.mode === "riddle" ||
        canvas.mode === "reward" ||
        canvas.mode === "championship" ||
        canvas.mode === "place_value" ||
        canvas.mode === "spelling")
    ) {
      runAnimation(canvas);
    } else if (canvas.mode === "idle") {
      setDisplayContent("");
      setDisplayMode("idle");
      setRiddleLabel("");
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    }

    return () => {
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
      }
    };
  }, [canvas, runAnimation, handleCanvasDone]);

  useEffect(() => {
    console.log(
      "[Canvas] transitioning:",
      isTransitioning,
      transitionFromRef.current,
      "→",
      canvas.mode,
    );
  }, [isTransitioning, canvas.mode]);

  const showAnimatedContent =
    displayMode === "teaching" ||
    displayMode === "worksheet_pdf" ||
    displayMode === "riddle" ||
    displayMode === "reward" ||
    displayMode === "championship" ||
    displayMode === "place_value" ||
    displayMode === "spelling";
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-8 bg-white relative"
      style={{ overflow: "hidden" }}
    >
      <style>{`@keyframes letterBounce { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } .letter-bounce { animation: letterBounce 0.3s ease-out backwards; } @keyframes qPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } } .q-pulse { animation: qPulse 1.5s ease-in-out infinite; } @keyframes riddleTilt { 0%, 100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } } .riddle-emoji { animation: riddleTilt 2s ease-in-out infinite; } @keyframes pendingDotPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } } .pending-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #EF9F27; animation: pendingDotPulse 1s ease-in-out infinite; margin-left: 4px; } @keyframes canvasSpin { to { transform: rotate(360deg); } }`}</style>
      {sessionState === "LOADING" && (
        <div
          className="thinking-indicator"
          style={{ ["--accent" as string]: accentColor }}
        >
          <span />
          <span />
          <span />
        </div>
      )}
      {showFlash && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-yellow-200/80 flex items-center justify-center z-20"
        >
          <span className="text-6xl">⭐</span>
        </motion.div>
      )}

      {showReward && reward && <RewardTakeover reward={reward} />}

      <div
        className={
          GAME_MODES.has(canvas.mode)
            ? "canvas-wrapper w-full max-w-none flex flex-col items-stretch justify-center"
            : "canvas-wrapper w-full max-w-2xl flex flex-col items-center justify-center"
        }
        style={{ position: "relative", minHeight: 200 }}
        data-mode={displayMode}
      >
        {isTransitioning && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(4px)",
              zIndex: 40,
              borderRadius: "inherit",
            }}
          >
            <CanvasLoader />
          </div>
        )}
        {GAME_MODES.has(canvas.mode) && canvas.gameUrl && (
          <iframe
            ref={gameIframeRef}
            title={`Sunny ${canvas.mode.replace(/-/g, " ")}`}
            src={canvas.gameUrl}
            style={{
              width: "100%",
              height: "min(90vh, 720px)",
              border: "none",
              borderRadius: "8px",
              background:
                GAME_IFRAME_BACKGROUNDS[canvas.mode as RegistryGameMode] ??
                "#121213",
            }}
            onLoad={(e) => {
              runGameIframeOnLoad(e.currentTarget, canvas, handleCanvasDone);
            }}
          />
        )}
        {showBlackboard && (
          <div
            className="absolute inset-0 z-[25] flex items-center justify-center bg-white/95 px-4"
            aria-hidden
          >
            <BlackboardContent blackboard={blackboard} />
          </div>
        )}
        {canvas.mode === "idle" && !showAnimatedContent && (
          <div
            className="flex flex-col items-center justify-center gap-4 select-none"
            style={{ fontFamily: "'Nunito', sans-serif" }}
          >
            <div className="text-8xl">🌟</div>
            <div className="text-xl font-medium text-gray-400 tracking-wide">
              Ready when you are
            </div>
          </div>
        )}

        {displayMode === "worksheet_pdf" && canvas.pdfAssetUrl ? (
          /\.(png|jpe?g|gif|webp)$/i.test(canvas.pdfAssetUrl) ? (
            <img
              src={canvas.pdfAssetUrl}
              alt="Worksheet"
              onLoad={() => handleCanvasDone()}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <WorksheetPdfContent
              canvas={canvas}
              onReady={handleCanvasDone}
              onWorksheetAnswer={onWorksheetAnswer}
              onOverlayFieldChange={onOverlayFieldChange}
            />
          )
        ) : displayMode === "place_value" && canvas.placeValueData ? (
          <PlaceValueContent data={canvas.placeValueData} />
        ) : displayMode === "spelling" && canvas.spellingWord ? (
          <SpellingContent
            spellingWord={canvas.spellingWord}
            spellingRevealed={canvas.spellingRevealed ?? []}
            compoundBreak={canvas.compoundBreak}
            streakCount={canvas.streakCount}
            personalBest={canvas.personalBest}
            showWord={canvas.showWord}
          />
        ) : displayMode === "teaching" &&
          shouldRenderTeachingContent({
            mode: canvas.mode,
            svg: canvas.svg,
            content: displayContent,
            phonemeBoxes: canvas.phonemeBoxes,
          }) ? (
          <TeachingContent
            content={displayContent}
            phonemeBoxes={canvas.phonemeBoxes}
            label={canvas.label}
            canvasSvg={canvas.svg}
            pendingAnswer={canvas.pendingAnswer}
          />
        ) : showAnimatedContent ? (
          <div className="text-center w-full">
            {displayMode === "riddle" && (
              <div className="space-y-4">
                <div
                  className="riddle-emoji text-6xl"
                  style={{ fontSize: "5rem" }}
                >
                  🤔
                </div>
                <p
                  className="text-2xl font-bold"
                  style={{
                    fontFamily: "'Nunito', sans-serif",
                    fontWeight: 900,
                    color: "#6366f1",
                  }}
                >
                  Can you solve this riddle?
                </p>
                <div
                  className="mx-auto max-w-[560px] rounded-[20px] px-8 py-6"
                  style={{
                    background: "#fef3c7",
                    border: "3px solid #FCD34D",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#92400e",
                    lineHeight: 1.6,
                    textAlign: "center",
                  }}
                >
                  {displayContent}
                </div>
                {riddleLabel && (
                  <p className="text-sm text-gray-500">{riddleLabel}</p>
                )}
              </div>
            )}
            {(displayMode === "reward" || displayMode === "championship") && (
              <div className="space-y-4">
                {(canvas.svg || canvas.lottieData) && (
                  <CanvasRewardVisual
                    svg={canvas.svg}
                    lottieData={canvas.lottieData}
                  />
                )}
                <p
                  className="canvas-content text-3xl font-bold"
                  style={{
                    fontFamily: "'Nunito', sans-serif",
                    fontWeight: 900,
                    color:
                      displayMode === "championship" ? "#EF9F27" : "#1a1a2e",
                  }}
                >
                  {displayContent}
                </p>
              </div>
            )}
          </div>
        ) : null}

        <div
          ref={particlesRef}
          className="canvas-particles"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        />
      </div>

      {sessionPhase && sessionPhase !== "warmup" && (
        <div className="mt-6 text-center text-sm text-gray-400">
          Phase: {sessionPhase}
        </div>
      )}
    </div>
  );
}
