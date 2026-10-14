/**
 * Browser-side guarantee that Sunny never keeps the microphone closed for speech that is not
 * coming. Armed when speech starts, refreshed by each audio frame, disarmed when speech ends;
 * if nothing is heard for the deadline, the playback is released.
 */
export function createPlaybackWatchdog(deadlineMs: number, release: (requestId: string) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: string | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const start = () => {
    clear();
    const requestId = current;
    if (!requestId) return;
    timer = setTimeout(() => {
      timer = null;
      if (current !== requestId) return;
      current = null;
      release(requestId);
    }, deadlineMs);
  };
  return {
    arm(requestId: string) {
      current = requestId;
      start();
    },
    heard(requestId: string | null) {
      if (requestId && requestId === current) start();
    },
    disarm() {
      current = null;
      clear();
    },
  };
}
