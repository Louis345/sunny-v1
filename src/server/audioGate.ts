export interface AudioGate {
  setMute(muted: boolean): void;
  receiveChunk(pcm: Buffer): void;
}

export function createAudioGate(deps: {
  sendAudio: (pcm: Buffer) => void;
}): AudioGate {
  let muted = false;
  return {
    setMute(m: boolean) {
      muted = m;
    },
    receiveChunk(pcm: Buffer) {
      if (muted) return;
      deps.sendAudio(pcm);
    },
  };
}
