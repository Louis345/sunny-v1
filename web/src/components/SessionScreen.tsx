import { CompanionStrip } from "./CompanionStrip";
import { Canvas } from "./Canvas";

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
}

interface CanvasState {
  mode: "idle" | "teaching" | "reward" | "riddle" | "championship";
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
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
  reward: RewardEvent | null;
  sessionPhase: string;
  sessionState: string;
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
  reward,
  sessionPhase,
  sessionState,
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
        accentColor={color.accent}
        accentBg={color.bg}
        onBargeIn={onBargeIn}
        onEndSession={onEndSession}
      />
      <Canvas
        canvas={canvas}
        reward={reward}
        sessionPhase={sessionPhase}
        sessionState={sessionState}
        accentColor={color.accent}
        onCanvasDone={onCanvasDone}
      />
    </div>
  );
}
