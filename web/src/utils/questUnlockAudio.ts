/** Short sparkly ascending tones (Web Audio). */
export function playMagicChime(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    if (ac.state === "suspended") void ac.resume();
    const now = ac.currentTime;
    const freqs = [392, 523.25, 659.25, 783.99];
    freqs.forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now + i * 0.06);
      o.connect(g);
      g.connect(ac.destination);
      const t0 = now + i * 0.06;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      o.start(t0);
      o.stop(t0 + 0.4);
    });
  } catch {
    /* Audio unavailable */
  }
}

/** Brassier fanfare-style burst after chime. */
export function playCelebration(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    if (ac.state === "suspended") void ac.resume();
    const now = ac.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, now);
      o.connect(g);
      g.connect(ac.destination);
      const t0 = now + i * 0.03;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
      o.start(t0);
      o.stop(t0 + 0.6);
    });
  } catch {
    /* Audio unavailable */
  }
}
