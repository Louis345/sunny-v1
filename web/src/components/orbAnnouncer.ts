import { announce, type AnnounceMoment, type AnnouncerBank, type AnnouncerMemory } from "../../../src/shared/announcer";

/** The slice of OrbAudio the announcer needs (a fake in tests). */
export interface AnnouncerAudio {
  loadExtra(sounds: Record<string, string>): Promise<number>;
  play(key: string, options?: { volume?: number; jitter?: number }): void;
  duration(key: string): number;
  has(key: string): boolean;
  duck(on: boolean): void;
  msToNextBeat(): number;
  /** The device voice, for a word this week's bank has no recording of. */
  say(text: string): void;
}

const KEY = (id: string) => `ann:${id}`;
/** Wait for the downbeat only when it is close; a long wait would make the call feel late. */
const MAX_BEAT_WAIT_MS = 450;
const GAP_S = 0.08;
/** A clip asked for again within this long after it ends is a repeat, not a request. */
const REPEAT_GUARD_MS = 800;
/** About how long the device voice takes to say one word. */
const SPOKEN_WORD_MS = 1100;

/**
 * Plays the week's recorded announcer bank: the shared picker chooses the clips, this lands them on
 * the next beat, one after another, with the music dipped underneath. No bank means no announcer,
 * and every call returns false so the game keeps its own lines.
 */
export class OrbAnnouncer {
  private memory: AnnouncerMemory = { recent: [], lastSpokeAt: -Infinity, now: 0 };
  private timers: number[] = [];
  /** When the voice is free again (the clock of now()). */
  private busyUntil = -Infinity;
  /** When each clip last finished (or will finish, when queued). */
  private lastEnds = new Map<string, number>();

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
    this.enqueue(keys, `call:${moment.event}`, true);
    return true;
  }

  /**
   * The companion says the practice word: her recorded voice, or the device voice when this week has no clip
   * for it (a new week's word), in line like every other line. Returns how many ms until it has been said
   * (the card times the chunks from then).
   */
  sayWord(word: string): number | false {
    const spoken = word.toLowerCase();
    const key = KEY(`slot-word-${spoken}`);
    if (this.audio.has(key)) this.enqueue([key], `word:${spoken}`, false);
    else this.enqueueSpoken(spoken);
    return Math.max(0, (this.lastEnds.get(this.audio.has(key) ? key : `say:${spoken}`) ?? this.now()) - this.now());
  }

  /** A word in the device voice, behind whatever the announcer is saying; a repeat is dropped like a clip. */
  private enqueueSpoken(word: string): void {
    const now = this.now();
    const id = `say:${word}`;
    const last = this.lastEnds.get(id);
    if (last !== undefined && now <= last + REPEAT_GUARD_MS) {
      console.log(` 🎮 [announcer] [repeat] [dropped] say:${word}`);
      return;
    }
    const at = Math.max(now, this.busyUntil);
    this.timers.push(window.setTimeout(() => this.audio.say(word), at - now));
    this.busyUntil = at + SPOKEN_WORD_MS;
    this.lastEnds.set(id, this.busyUntil);
    console.log(` 🎮 [announcer] [say] [device-voice] word=${word} inMs=${Math.round(at - now)}`);
  }

  /** One of the game's own cues in the announcer's voice ("ready" = Ready? Go!). False when the bank lacks it. */
  cue(name: string): boolean {
    const key = KEY(`slot-${name}`);
    if (!this.audio.has(key)) return false;
    this.enqueue([key], `cue:${name}`, true);
    return true;
  }

  /**
   * The one voice: every line waits for the line before it to finish, so nothing talks over anything.
   * The same clip asked for again while it is queued, playing, or just finished is dropped (double taps,
   * a card that mounts twice).
   */
  private enqueue(keys: string[], label: string, onBeat: boolean): void {
    const now = this.now();
    const fresh = keys.filter((key) => {
      const last = this.lastEnds.get(key);
      return last === undefined || now > last + REPEAT_GUARD_MS;
    });
    if (fresh.length < keys.length) console.log(` 🎮 [announcer] [repeat] [dropped] ${label}`);
    if (!fresh.length) return;
    const wait = onBeat ? this.audio.msToNextBeat() : 0;
    let at = Math.max(now + (wait <= MAX_BEAT_WAIT_MS ? wait : 0), this.busyUntil);
    const first = at;
    fresh.forEach((key, index) => {
      this.timers.push(window.setTimeout(() => {
        if (index === 0) this.audio.duck(true);
        this.audio.play(key, { volume: 1, jitter: 0 });
      }, at - now));
      at += (this.audio.duration(key) + GAP_S) * 1000;
      this.lastEnds.set(key, at);
    });
    this.busyUntil = at;
    this.timers.push(window.setTimeout(() => {
      if (this.now() >= this.busyUntil - 1) this.audio.duck(false);
    }, at - now));
    console.log(` 🎮 [announcer] [say] [${label}] clips=${fresh.map((key) => key.slice(4)).join("+")} inMs=${Math.round(first - now)}`);
  }

  dispose(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
  }
}
