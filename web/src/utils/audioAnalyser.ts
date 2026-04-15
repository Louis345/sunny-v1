/**
 * Shared analyser for ElevenLabs PCM playback (COMPANION-005).
 * `useSession` routes BufferSource → AnalyserNode → destination; pass that node via a React ref to CompanionLayer for RMS → "aa".
 */

let playbackAnalyser: AnalyserNode | null = null;

let smoothedMouthWeight = 0;

export function resetAudioAnalyser(): void {
  try {
    playbackAnalyser?.disconnect();
  } catch {
    /* ignore */
  }
  playbackAnalyser = null;
  smoothedMouthWeight = 0;
}

/** Create or reuse an AnalyserNode for the given playback AudioContext. */
export function ensurePlaybackAnalyser(ctx: AudioContext): AnalyserNode {
  if (playbackAnalyser && playbackAnalyser.context === ctx) {
    return playbackAnalyser;
  }
  resetAudioAnalyser();
  const a = ctx.createAnalyser();
  a.fftSize = 2048;
  playbackAnalyser = a;
  return a;
}

/** RMS 0..1 from `getByteTimeDomainData` buffer (center 128 = silence). */
export function rmsFromByteTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const s = (data[i]! - 128) / 128;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.max(1, data.length));
}

/**
 * Returns smoothed mouth weight 0..1 for VRM "aa".
 * When analyser is null, decays toward 0 within ~200ms.
 */
export function updateMouthSync(
  analyser: AnalyserNode | null,
  deltaSeconds: number,
): number {
  const dt = Math.max(0, deltaSeconds);
  if (!analyser) {
    smoothedMouthWeight = Math.max(0, smoothedMouthWeight - dt / 0.2);
    return smoothedMouthWeight;
  }
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  const raw = Math.min(1, rmsFromByteTimeDomain(buf) * 3);
  const alpha = Math.min(1, 0.3 * (dt > 0 ? dt * 60 : 1));
  smoothedMouthWeight += (raw - smoothedMouthWeight) * alpha;
  smoothedMouthWeight = Math.max(0, Math.min(1, smoothedMouthWeight));
  return smoothedMouthWeight;
}
