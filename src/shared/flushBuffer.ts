/**
 * Flushes pre-capture rolling buffer to the voice WebSocket. When the mic is
 * muted, frames must not be sent (server STT / privacy).
 */
export function flushBufferIfUnmuted(
  frames: string[],
  isMuted: boolean,
  sendMessage: (type: "audio", payload: { data: string }) => void,
): void {
  if (isMuted) return;
  for (const frame of frames) {
    sendMessage("audio", { data: frame });
  }
}
