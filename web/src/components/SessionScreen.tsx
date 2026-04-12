import { CompanionStrip } from "./CompanionStrip";
import { Canvas, type CanvasState } from "./Canvas";
import type { OverlayField } from "../../../src/server/assignment-player";
import type { BlackboardState } from "../hooks/useSession";
import type { ReadingCanvasPreferences } from "../../../src/shared/readingCanvasPreferences";

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
  accentColor?: string;
  accentBg?: string;
}

interface RewardEvent {
  rewardStyle: "flash" | "takeover" | "none";
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  displayDuration_ms: number;
}

interface Props {
  childName: string;
  companion: CompanionConfig | null;
  companionText: string;
  interimTranscript: string;
  correctStreak: number;
  canvas: CanvasState;
  blackboard: BlackboardState;
  reward: RewardEvent | null;
  sessionPhase: string;
  sessionState: string;
  micMuted: boolean;
  onToggleMicMute: () => void;
  onBargeIn: () => void;
  onEndSession: () => void;
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
  sendMessage?: (type: string, payload?: Record<string, unknown>) => void;
  readingCanvas: ReadingCanvasPreferences;
  storyImageLoading?: boolean;
  storyImageUrl?: string | null;
  accentColor: string;
  accentBg: string;
}

export function SessionScreen({
  childName,
  companion,
  companionText,
  interimTranscript,
  correctStreak,
  canvas,
  blackboard,
  reward,
  sessionPhase,
  sessionState,
  micMuted,
  onToggleMicMute,
  onBargeIn,
  onEndSession,
  onCanvasDone,
  onWorksheetAnswer,
  onOverlayFieldChange,
  sendMessage,
  readingCanvas,
  storyImageLoading = false,
  storyImageUrl = null,
  accentColor,
  accentBg,
}: Props) {
  const childId =
    childName === "creator" ? "star" : childName.toLowerCase();

  return (
    <div className="w-full h-full flex">
      <CompanionStrip
        childName={childName}
        companionName={companion?.companionName ?? "Companion"}
        companionText={companionText}
        interimTranscript={interimTranscript}
        correctStreak={correctStreak}
        sessionState={sessionState}
        accentColor={accentColor}
        accentBg={accentBg}
        micMuted={micMuted}
        onToggleMicMute={onToggleMicMute}
        onBargeIn={onBargeIn}
        onEndSession={onEndSession}
      />
      <div className="flex-1 relative min-w-0 flex flex-col">
        <img
          src={`/characters/${childId}.png`}
          alt=""
          onError={(e) => {
            e.currentTarget.src = "/characters/star.png";
          }}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            width: 60,
            height: 60,
            borderRadius: "50%",
            objectFit: "cover",
            border: "3px solid #FFD700",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        />
        <Canvas
          canvas={canvas}
          blackboard={blackboard}
          reward={reward}
          sessionPhase={sessionPhase}
          sessionState={sessionState}
          accentColor={accentColor}
          onCanvasDone={onCanvasDone}
          onWorksheetAnswer={onWorksheetAnswer}
          onOverlayFieldChange={onOverlayFieldChange}
          interimTranscript={interimTranscript}
          sendMessage={sendMessage}
          readingCanvas={readingCanvas}
          storyImageChildId={childId}
          storyImageLoading={storyImageLoading}
          storyImageUrl={storyImageUrl}
        />
      </div>
    </div>
  );
}
