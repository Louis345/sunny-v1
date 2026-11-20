import { announce, type AnnounceMoment, type AnnouncerBank, type AnnouncerMemory } from "../../../src/shared/announcer";

/** The slice of OrbAudio the announcer needs (a fake in tests). */
export interface AnnouncerAudio {
  loadExtra(sounds: Record<string, string>): Promise<number>;
  play(key: string, options?: { volume?: number; jitter?: number }): void;
  duration(key: string): number;
  has(key: string): boolean;
  duck(on: boolean): void;
  msToNextBeat(): number;
}

const KEY = (id: string) => `ann:${id}`;
/** Wait for the downbeat only when it is close; a long wait would make the call feel late. */
const MAX_BEAT_WAIT_MS = 450;
const GAP_S = 0.08;

/**
 * Plays the week's recorded announcer bank: the shared picker chooses the clips, this lands them on
 * the next beat, one after another, with the music dipped underneath. No bank means no announcer,
 * and every call returns false so the game keeps its own lines.
 */
export class OrbAnnouncer {
  private memory: AnnouncerMemory = { recent: [], lastSpokeAt: -Infinity, now: 0 };
  private timers: number[] = [];

  private readonly bank: AnnouncerBank;
  private readonly audio: AnnouncerAudio;
  private readonly now: () => number;

  private constructor(bank: AnnouncerBank, audio: AnnouncerAudio, now: () => number) {
    this.bank = bank;
    this.audio = audio;
    this.now = now;
  }

  static async load(childId: string | undefined, audio: AnnouncerAudio, now: () => number = () => performance.now()): Promise<OrbAnnouncer | null> {
    if (!childId) return null;
    const base = `/generated/announcer/${childId}/`;
    try {
      const response = await fetch(`${base}bank.json`);
      if (!response.ok) {
        console.log(` 🎮 [announcer] [bank] [none] child=${childId} status=${response.status}: game lines only`);
        return null;
      }
      const bank = (await response.json()) as AnnouncerBank;
      const loaded = await audio.loadExtra(Object.fromEntries(bank.clips.map((clip) => [KEY(clip.id), base + clip.file])));
      console.log(` 🎮 [announcer] [bank] [ready] child=${childId} week=${bank.week} clips=${loaded}/${bank.clips.length}`);
      return new OrbAnnouncer(bank, audio, now);
    } catch (error) {
      console.warn(` 🎮 [announcer] [bank] [failed] child=${childId}: game lines only`, error);
      return null;
    }
  }

  /** Call a moment. True when the announcer spoke (the game then skips its own line). */
  call(moment: AnnounceMoment): boolean {
    const picked = announce(this.bank, moment, { ...this.memory, now: this.now() });
    if (!picked) return false;
    const keys = picked.clips.map(KEY).filter((key) => this.audio.has(key));
    if (!keys.length) return false;
    this.memory = picked.memory;
    const wait = this.audio.msToNextBeat();
    let at = wait <= MAX_BEAT_WAIT_MS ? wait : 0;
    this.audio.duck(true);
    keys.forEach((key) => {
      this.timers.push(window.setTimeout(() => this.audio.play(key, { volume: 1, jitter: 0 }), at));
      at += (this.audio.duration(key) + GAP_S) * 1000;
    });
    this.timers.push(window.setTimeout(() => this.audio.duck(false), at));
    console.log(` 🎮 [announcer] [call] [${moment.event}] clips=${picked.clips.join("+")} inMs=${Math.round(wait <= MAX_BEAT_WAIT_MS ? wait : 0)}`);
    return true;
  }

  /** The companion says the practice word (her recorded voice). False when this week has no clip for it. */
  sayWord(word: string): boolean {
    const key = KEY(`slot-word-${word.toLowerCase()}`);
    if (!this.audio.has(key)) return false;
    this.audio.duck(true);
    this.audio.play(key, { volume: 1, jitter: 0 });
    this.timers.push(window.setTimeout(() => this.audio.duck(false), this.audio.duration(key) * 1000 + 100));
    return true;
  }

  dispose(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
  }
}
