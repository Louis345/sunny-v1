/**
 * Shared activity sound effects. The three kinds are game-agnostic, so every
 * companion activity reuses these exact tones — moved verbatim from the
 * original tic-tac-toe implementation so play feels identical across games.
 */
export type CompanionActivitySfx = "child_move" | "companion_move" | "round_complete";

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function playCompanionActivitySfx(kind: CompanionActivitySfx): void {
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const gain = context.createGain();
    const frequencies: Record<CompanionActivitySfx, number> = {
      child_move: 520,
      companion_move: 740,
      round_complete: 880,
    };
    const oscillator = context.createOscillator();
    oscillator.type = kind === "round_complete" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequencies[kind], now);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequencies[kind] * (kind === "companion_move" ? 1.18 : 1.06),
      now + 0.11,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "round_complete" ? 0.075 : 0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "round_complete" ? 0.28 : 0.16));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + (kind === "round_complete" ? 0.3 : 0.18));
    oscillator.onended = () => {
      void context.close().catch((err: unknown) => {
        console.warn(" 🎮 [companion-activity] [sfx_close] [error]", err);
      });
    };
  } catch (err: unknown) {
    console.warn(" 🎮 [companion-activity] [sfx] [error]", err);
  }
}
