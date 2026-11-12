/**
 * The orb catcher's sound mix, built the way the Fable game does it (owner, 2026-11-11): three buses
 * (music quiet, effects, voice loud), music that ducks under a spoken line, decoded buffers with a little
 * pitch variation so repeats never sound copy-pasted. Sounds come from the shared /a3d/sfx library and the
 * theme pack's own files. Speech is the browser's voice in this prototype; production uses the companion's.
 */

export type OrbSoundMap = Record<string, string>;

/** The shared library every theme can use. */
export const ORB_SOUND_LIBRARY: OrbSoundMap = {
  riser: "/a3d/sfx/riser.mp3",
  takedown: "/a3d/sfx/takedown.mp3",
  boom: "/a3d/sfx/boom.mp3",
  tick: "/a3d/sfx/tick.mp3",
  coin: "/a3d/sfx/coin.mp3",
  legendary: "/a3d/sfx/legendary.mp3",
  fanfare: "/a3d/sfx/fanfare.mp3",
  correct: "/a3d/sfx/correct.mp3",
  combo: "/a3d/sfx/combo.wav",
  pop: "/a3d/sfx/hit_pop.wav",
  jump: "/a3d/sfx/jump.mp3",
  crowdCheer: "/a3d/sfx/crowd-cheer.mp3",
  crowdLoop: "/a3d/sfx/crowd-loop.mp3",
  music: "/a3d/sfx/music-loop.mp3",
};

export class OrbAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loops: AudioBufferSourceNode[] = [];
  private disposed = false;
  private musicOn = true;

  private readonly sounds: OrbSoundMap;
  private readonly volume: number;

  constructor(sounds: OrbSoundMap, volume = 1) {
    this.sounds = sounds;
    this.volume = volume;
  }

  async load(): Promise<void> {
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.music = this.context.createGain();
      this.music.gain.value = 0.28 * this.volume;
      this.music.connect(this.context.destination);
      this.effects = this.context.createGain();
      this.effects.gain.value = 0.8 * this.volume;
      this.effects.connect(this.context.destination);
    } catch (error) {
      console.warn(" 🎮 [orb-audio] [context] [unavailable]", error);
      return;
    }
    await Promise.all(
      Object.entries(this.sounds).map(async ([key, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`status ${response.status}`);
          const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
          if (!this.disposed) this.buffers.set(key, buffer);
        } catch (error) {
          console.warn(` 🎮 [orb-audio] [load] [skipped] key=${key}`, error);
        }
      }),
    );
    console.log(` 🎮 [orb-audio] [load] [ready] sounds=${this.buffers.size}/${Object.keys(this.sounds).length}`);
  }

  /** Browsers start audio only after a tap; call this from the first pointer press. */
  resume(): void {
    if (this.context?.state === "suspended") void this.context.resume().catch(() => undefined);
  }

  play(key: string, options: { volume?: number; rate?: number; jitter?: number } = {}): void {
    const buffer = this.buffers.get(key);
    if (!this.context || !this.effects || !buffer) return;
    try {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const jitter = options.jitter ?? 0.06;
      source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);
      const gain = this.context.createGain();
      gain.gain.value = options.volume ?? 1;
      source.connect(gain).connect(this.effects);
      source.start();
    } catch (error) {
      console.warn(` 🎮 [orb-audio] [play] [failed] key=${key}`, error);
    }
  }

  /** A looping bed under everything (music or a crowd), on the quiet music bus. */
  loop(key: string, volume = 1): void {
    const buffer = this.buffers.get(key);
    if (!this.context || !this.music || !buffer) return;
    try {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.context.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(this.music);
      source.start();
      this.loops.push(source);
    } catch (error) {
      console.warn(` 🎮 [orb-audio] [loop] [failed] key=${key}`, error);
    }
  }

  /** Music dips while a line is spoken, like the Fable game. */
  duck(on: boolean): void {
    if (!this.context || !this.music) return;
    const level = this.musicOn ? (on ? 0.09 : 0.28) * this.volume : 0;
    this.music.gain.setTargetAtTime(level, this.context.currentTime, 0.25);
  }

  /** Music on or off (effects and voice keep playing). */
  setMusic(on: boolean): void {
    this.musicOn = on;
    console.log(` 🎮 [orb-audio] [music] [${on ? "on" : "off"}]`);
    if (!this.context || !this.music) return;
    this.music.gain.setTargetAtTime(on ? 0.28 * this.volume : 0, this.context.currentTime, 0.15);
  }

  /** Prototype voice: the browser speaks the line (Japanese lines in a Japanese voice when there is one). */
  say(text: string, lang: "en" | "ja" = "en", rate?: number): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const line = new SpeechSynthesisUtterance(text);
      line.lang = lang === "ja" ? "ja-JP" : "en-US";
      line.rate = rate ?? (lang === "ja" ? 1 : 1.05);
      line.pitch = 1.15;
      const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.startsWith(line.lang.slice(0, 2)));
      if (voice) line.voice = voice;
      line.onstart = () => this.duck(true);
      line.onend = () => this.duck(false);
      window.speechSynthesis.speak(line);
    } catch (error) {
      console.warn(" 🎮 [orb-audio] [say] [failed]", error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.loops.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    void this.context?.close().catch(() => undefined);
  }
}
