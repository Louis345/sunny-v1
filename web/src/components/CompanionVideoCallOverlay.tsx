import { type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, Mic, Send, Video, VideoOff, X } from "lucide-react";

export type CompanionVideoCallPhase = "idle" | "calling" | "answered" | "live";
export type CompanionVideoCallCameraState = "off" | "requesting" | "live" | "blocked";
export type CompanionVideoCallTalkPhase = "idle" | "listening" | "thinking" | "speaking";
export type CompanionVideoCallLayout = "call" | "play";

export type CompanionVideoCallStatusCopy = {
  heading: string;
  status: string;
  helperText: string;
};

export type CompanionVideoCallOverlayProps = {
  open: boolean;
  companionName: string;
  phase: CompanionVideoCallPhase;
  cameraState: CompanionVideoCallCameraState;
  talkPhase: CompanionVideoCallTalkPhase;
  responseText: string;
  error: string | null;
  question: string;
  statusCopy: CompanionVideoCallStatusCopy;
  primaryBackground: string;
  portrait: ReactNode;
  activitySlot?: ReactNode;
  layout?: CompanionVideoCallLayout;
  traceLink?: string | null;
  traceCopyStatus?: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onLayoutChange?: (layout: CompanionVideoCallLayout) => void;
  onCopyTraceLink?: () => void;
  onAskVoice: () => void;
  onQuestionChange: (value: string) => void;
  onSubmitQuestion: () => void;
  onLook: () => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onEnd: () => void;
};

function phaseLabel(phase: CompanionVideoCallTalkPhase, companionName: string): string {
  if (phase === "listening") return `${companionName} is listening`;
  if (phase === "thinking") return `${companionName} is thinking`;
  if (phase === "speaking") return `${companionName} is answering`;
  return "Ready";
}

export function CompanionVideoCallOverlay({
  open,
  companionName,
  phase,
  cameraState,
  talkPhase,
  responseText,
  error,
  question,
  statusCopy,
  primaryBackground,
  portrait,
  activitySlot,
  layout,
  traceLink,
  traceCopyStatus,
  videoRef,
  onLayoutChange,
  onCopyTraceLink,
  onAskVoice,
  onQuestionChange,
  onSubmitQuestion,
  onLook,
  onStartCamera,
  onStopCamera,
  onEnd,
}: CompanionVideoCallOverlayProps) {
  const interactionDisabled = talkPhase === "thinking" || talkPhase === "speaking";
  const resolvedLayout: CompanionVideoCallLayout = layout ?? (activitySlot ? "play" : "call");
  const isPlayLayout = resolvedLayout === "play" && Boolean(activitySlot);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="companion-video-call"
          role="dialog"
          aria-label={`Video Chat with ${companionName}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 88,
            background:
              "radial-gradient(circle at 50% 42%, rgba(65,55,120,0.34), transparent 46%), #05050a",
            color: "#f8fafc",
            overflow: "hidden",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Child camera preview"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
              opacity: cameraState === "live" ? 1 : 0,
              transition: "opacity 220ms ease",
            }}
          />
          {cameraState !== "live" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 24,
                textAlign: "center",
                background:
                  "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(88,64,180,0.84))",
              }}
            >
              <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
                <div
                  aria-hidden
                  style={{
                    margin: "0 auto",
                    width: 76,
                    height: 76,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    boxShadow:
                      phase === "calling"
                        ? "0 0 0 12px rgba(124,92,255,0.16), 0 0 44px rgba(124,92,255,0.42)"
                        : "0 18px 54px rgba(0,0,0,0.24)",
                  }}
                >
                  <Video size={36} aria-hidden style={{ opacity: 0.86 }} />
                </div>
                <div style={{ fontSize: "clamp(30px, 5vw, 54px)", fontWeight: 950 }}>
                  {statusCopy.heading}
                </div>
                <p style={{ margin: 0, color: "rgba(248,250,252,0.72)", lineHeight: 1.45 }}>
                  {statusCopy.helperText}
                </p>
                {error && (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      color: "#fecdd3",
                      fontSize: 14,
                      fontWeight: 800,
                    }}
                  >
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              right: 18,
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              style={{
                borderRadius: 8,
                background: "rgba(5,5,10,0.54)",
                border: "1px solid rgba(255,255,255,0.16)",
                padding: "10px 13px",
                backdropFilter: "blur(14px)",
                display: "grid",
                gap: 2,
                minWidth: 0,
              }}
            >
              <strong style={{ fontSize: 15 }}>{statusCopy.heading}</strong>
              <span style={{ fontSize: 12, color: "rgba(248,250,252,0.68)" }}>
                {statusCopy.status}
              </span>
              {traceLink && onCopyTraceLink && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    type="button"
                    aria-label="Copy trace link"
                    onClick={onCopyTraceLink}
                    style={{
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.1)",
                      color: "#f8fafc",
                      cursor: "pointer",
                      fontFamily: "Lexend, system-ui, sans-serif",
                      fontSize: 11,
                      fontWeight: 850,
                      padding: "4px 7px",
                    }}
                  >
                    Copy trace link
                  </button>
                  {traceCopyStatus && (
                    <span style={{ color: "rgba(248,250,252,0.68)", fontSize: 11 }}>
                      {traceCopyStatus}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div
              aria-label="Video chat layout"
              style={{
                marginLeft: "auto",
                display: "inline-grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 4,
                borderRadius: 8,
                padding: 4,
                background: "rgba(5,5,10,0.46)",
                border: "1px solid rgba(255,255,255,0.16)",
                backdropFilter: "blur(14px)",
              }}
            >
              <button
                type="button"
                aria-label="Call view"
                aria-pressed={resolvedLayout === "call"}
                onClick={() => onLayoutChange?.("call")}
                style={{
                  border: 0,
                  borderRadius: 7,
                  minHeight: 34,
                  padding: "0 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    resolvedLayout === "call"
                      ? "rgba(255,255,255,0.92)"
                      : "transparent",
                  color: resolvedLayout === "call" ? "#27214a" : "#f8fafc",
                  fontFamily: "Lexend, system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <Video size={15} aria-hidden />
                Call
              </button>
              <button
                type="button"
                aria-label="Play view"
                aria-pressed={resolvedLayout === "play"}
                onClick={() => onLayoutChange?.("play")}
                style={{
                  border: 0,
                  borderRadius: 7,
                  minHeight: 34,
                  padding: "0 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    resolvedLayout === "play"
                      ? "rgba(255,255,255,0.92)"
                      : "transparent",
                  color: resolvedLayout === "play" ? "#27214a" : "#f8fafc",
                  fontFamily: "Lexend, system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <Gamepad2 size={15} aria-hidden />
                Play
              </button>
            </div>
            <button
              type="button"
              aria-label="Close video chat"
              onClick={onEnd}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(5,5,10,0.54)",
                color: "#f8fafc",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                backdropFilter: "blur(14px)",
              }}
            >
              <X size={22} aria-hidden />
            </button>
          </div>

          <div
            aria-label={`${companionName} companion portrait`}
            style={{
              position: "absolute",
              right: isPlayLayout ? "clamp(10px, 2vw, 26px)" : "clamp(14px, 3vw, 34px)",
              bottom: isPlayLayout ? "clamp(92px, 12vh, 120px)" : "clamp(96px, 14vh, 132px)",
              zIndex: 4,
              width: isPlayLayout ? "min(24vw, 210px)" : "min(30vw, 230px)",
              minWidth: isPlayLayout ? 132 : 148,
              aspectRatio: "3 / 4",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.24)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(15,23,42,0.74))",
              boxShadow: "0 22px 72px rgba(0,0,0,0.38)",
              overflow: "hidden",
              backdropFilter: "blur(18px)",
            }}
          >
            {portrait}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "10px 11px",
                background:
                  "linear-gradient(180deg, transparent, rgba(5,5,10,0.78) 28%, rgba(5,5,10,0.92))",
                fontSize: 13,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>{companionName}</span>
              <span style={{ color: "rgba(248,250,252,0.68)", fontSize: 11, fontWeight: 800 }}>
                companion
              </span>
            </div>
          </div>

          {(responseText || error || talkPhase !== "idle") && (
            <div
              style={{
                position: "absolute",
                left: "clamp(14px, 3vw, 34px)",
                bottom: "clamp(106px, 14vh, 144px)",
                zIndex: 4,
                width: "min(54vw, 560px)",
                maxWidth: "calc(100vw - min(30vw, 230px) - 96px)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(5,5,10,0.58)",
                color: "#f8fafc",
                boxShadow: "0 22px 72px rgba(0,0,0,0.28)",
                backdropFilter: "blur(16px)",
                padding: "12px 14px",
                display: "grid",
                gap: 8,
              }}
            >
              <div
                aria-live="polite"
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "rgba(248,250,252,0.68)",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                }}
              >
                {phaseLabel(talkPhase, companionName)}
              </div>
              {responseText && (
                <div style={{ fontSize: 15, fontWeight: 750, lineHeight: 1.38 }}>
                  {responseText}
                </div>
              )}
              {error && (
                <div role="alert" style={{ color: "#fecdd3", fontSize: 13, fontWeight: 800 }}>
                  {error}
                </div>
              )}
            </div>
          )}

          <AnimatePresence>
            {activitySlot && (
              <motion.div
                key="video-call-activity-tray"
                aria-label="Video chat activity"
                initial={{ opacity: 0, x: -28, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -24, scale: 0.97 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  left: "3vw",
                  top: "auto",
                  bottom: "14vh",
                  transform: "none",
                  zIndex: 4,
                  width: "34vw",
                  minWidth: 250,
                  maxWidth: 360,
                  maxHeight: "calc(100vh - 190px)",
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "auto",
                }}
              >
                {activitySlot}
              </motion.div>
            )}
          </AnimatePresence>

          <form
            aria-label="Video chat question form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitQuestion();
            }}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 22,
              transform: "translateX(-50%)",
              zIndex: 5,
              display: "grid",
              gridTemplateColumns: "44px minmax(160px, 1fr) 44px auto auto auto",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "min(94vw, 860px)",
              padding: 10,
              borderRadius: 8,
              background: "rgba(5,5,10,0.56)",
              border: "1px solid rgba(255,255,255,0.16)",
              backdropFilter: "blur(16px)",
            }}
          >
            <button
              type="button"
              aria-label="Ask by voice in video chat"
              onClick={onAskVoice}
              disabled={interactionDisabled}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.18)",
                background: talkPhase === "listening" ? primaryBackground : "rgba(255,255,255,0.12)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                cursor: interactionDisabled ? "wait" : "pointer",
                opacity: interactionDisabled ? 0.62 : 1,
              }}
            >
              <Mic size={19} aria-hidden />
            </button>
            <input
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              disabled={interactionDisabled}
              placeholder={`Ask ${companionName}`}
              style={{
                minWidth: 0,
                height: 44,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.92)",
                color: "#111827",
                padding: "0 12px",
                fontSize: 15,
                fontWeight: 800,
                outline: "none",
              }}
            />
            <button
              type="submit"
              aria-label="Send video chat question"
              disabled={interactionDisabled}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: 0,
                background: primaryBackground,
                color: "#fff",
                display: "grid",
                placeItems: "center",
                cursor: interactionDisabled ? "wait" : "pointer",
                opacity: interactionDisabled ? 0.62 : 1,
              }}
            >
              <Send size={18} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Let companion look"
              onClick={onLook}
              disabled={interactionDisabled}
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8,
                minHeight: 46,
                padding: "0 16px",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                fontFamily: "Lexend, system-ui, sans-serif",
                fontSize: 15,
                fontWeight: 900,
                cursor: interactionDisabled ? "wait" : "pointer",
                opacity: interactionDisabled ? 0.62 : 1,
              }}
            >
              Look
            </button>
            <button
              type="button"
              aria-label={cameraState === "live" ? "Stop camera" : "Start camera"}
              onClick={cameraState === "live" ? onStopCamera : onStartCamera}
              disabled={cameraState === "requesting"}
              style={{
                border: 0,
                borderRadius: 8,
                minHeight: 46,
                padding: "0 18px",
                background: cameraState === "live" ? "rgba(255,255,255,0.12)" : primaryBackground,
                color: "#fff",
                fontFamily: "Lexend, system-ui, sans-serif",
                fontSize: 15,
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: cameraState === "requesting" ? "wait" : "pointer",
                opacity: cameraState === "requesting" ? 0.7 : 1,
              }}
            >
              {cameraState === "live" ? <VideoOff size={18} aria-hidden /> : <Video size={18} aria-hidden />}
              {cameraState === "requesting"
                ? "Starting..."
                : cameraState === "live"
                  ? "Stop camera"
                  : "Start camera"}
            </button>
            <button
              type="button"
              onClick={onEnd}
              style={{
                border: 0,
                borderRadius: 8,
                minHeight: 46,
                padding: "0 18px",
                background: "#dc2626",
                color: "#fff",
                fontFamily: "Lexend, system-ui, sans-serif",
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              End video chat
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
