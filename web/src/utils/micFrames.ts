/** Mic capture frame: 1024 samples at 16 kHz = 64 ms, so Deepgram hears her last word sooner (was 4096 = 256 ms). */
export const MIC_SAMPLE_RATE = 16000;
export const MIC_FRAME_SAMPLES = 1024;
export const MIC_FRAME_MS = (MIC_FRAME_SAMPLES / MIC_SAMPLE_RATE) * 1000;

/** How many mic frames make up a duration, so timing rules stay in milliseconds when the frame size changes. */
export function framesFor(ms: number): number {
  return Math.max(1, Math.round(ms / MIC_FRAME_MS));
}
