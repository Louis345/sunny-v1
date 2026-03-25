import { CompanionStrip } from "./CompanionStrip";
import { Canvas, type CanvasState } from "./Canvas";
import type { BlackboardState } from "../hooks/useSession";

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
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
}

const colors: Record<string, { accent: string; bg: string }> = {
  Ila: { accent: "#854F0B", bg: "#FAEEDA" },
  Reina: { accent: "#0C447C", bg: "#E6F1FB" },
};

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
}: Props) {
  const color = colors[childName] ?? colors.Ila;

  return (
    <div className="w-full h-full flex">
      <CompanionStrip
        childName={childName}
        companionName={companion?.companionName ?? "Companion"}
        companionText={companionText}
        interimTranscript={interimTranscript}
        correctStreak={correctStreak}
        sessionState={sessionState}
        accentColor={color.accent}
        accentBg={color.bg}
        micMuted={micMuted}
        onToggleMicMute={onToggleMicMute}
        onBargeIn={onBargeIn}
        onEndSession={onEndSession}
      />
      <Canvas
        canvas={canvas}
        blackboard={blackboard}
        reward={reward}
        sessionPhase={sessionPhase}
        sessionState={sessionState}
        accentColor={color.accent}
        onCanvasDone={onCanvasDone}
      />
    </div>
  );
}
