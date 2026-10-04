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

export function shouldAcknowledgeAudioPlayback(input: {
  requiresAudio: boolean;
  receivedAudioFrames: number;
  playedAudioFrames: number;
}): boolean {
  if (!input.requiresAudio) return true;
  return (
    input.receivedAudioFrames > 0 &&
    input.playedAudioFrames === input.receivedAudioFrames
  );
}
