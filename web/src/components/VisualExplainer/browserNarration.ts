export type BrowserNarrationStatus = "idle" | "speaking" | "unsupported" | "muted";

export type BrowserNarrationControls = {
  speak: (text: string) => BrowserNarrationStatus;
  stop: () => void;
  supported: boolean;
};

export function createBrowserNarrationControls(opts: {
  muted: boolean;
  rate?: number;
  pitch?: number;
}): BrowserNarrationControls {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";

  const stop = () => {
    if (!supported) return;
    window.speechSynthesis.cancel();
  };

  const speak = (text: string): BrowserNarrationStatus => {
    if (opts.muted) return "muted";
    if (!supported) return "unsupported";
    const trimmed = text.trim();
    if (!trimmed) return "idle";
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = opts.rate ?? 0.95;
    utterance.pitch = opts.pitch ?? 1.05;
    window.speechSynthesis.speak(utterance);
    return "speaking";
  };

  return {
    speak,
    stop,
    supported,
  };
}
