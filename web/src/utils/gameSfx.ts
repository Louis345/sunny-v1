import {
  DEFAULT_SENSORY_PROFILE,
  resolveSensoryProfile,
  type SensoryProfile,
  type SensorySoundBrightness,
} from "../../../src/shared/sensoryProfile";

export const GAME_SFX = {
  adventureBoard: {
    launch: "/sfx/pronunciation/replay_start.wav",
    replay: "/sfx/pronunciation/combo.wav",
    locked: "/sfx/pronunciation/miss_thunk.wav",
  },
  generatedMath: {
    interaction: "/sfx/pronunciation/replay_start.wav",
    recovery: "/sfx/pronunciation/miss_thunk.wav",
    progress: "/sfx/pronunciation/hit_pop.wav",
    completion: "/sfx/pronunciation/complete_fanfare.wav",
  },
  pronunciation: {
    comboBreaker: "/sfx/pronunciation/combo_breaker.mp3",
    combo: "/sfx/pronunciation/combo.wav",
    onFire: "/sfx/pronunciation/on_fire.wav",
    megaStreak: "/sfx/pronunciation/killer_instinct_brutal_combo.mp3",
    legendary: "/sfx/pronunciation/killer_instinct_master_combo.mp3",
    hitPop: "/sfx/pronunciation/hit_pop.wav",
    missThunk: "/sfx/pronunciation/miss_thunk.wav",
    replayStart: "/sfx/pronunciation/replay_start.wav",
    completeFanfare: "/sfx/pronunciation/complete_fanfare.wav",
    heatUp: "/sfx/pronunciation/hes-heating-up.mp3",
  },
  /** Recorded big moments for the Spark Orb capture; gesture sounds are synthesized in sparkOrbSfx. */
  sparkOrb: {
    captureLock: "/sfx/unlock/boom.mp3",
    collected: "/sfx/unlock/fanfare.mp3",
    perfect: "/sfx/unlock/coin.mp3",
  },
} as const;

export type AdventureBoardSfxCue = keyof typeof GAME_SFX.adventureBoard;
export type GeneratedMathSfxCue = keyof typeof GAME_SFX.generatedMath;

export const GAME_SFX_CONFIG = {
  pronunciation: {
    enabled: true,
    arcadeCombos: true,
    comboVolume: 0.9,
    comboMilestones: [
      {
        minStreak: 5,
        label: "COMBO BREAKER!",
        effect: "combo-breaker",
        src: "/sfx/pronunciation/combo_breaker.mp3",
      },
      {
        minStreak: 10,
        label: "ON FIRE!",
        effect: "on-fire",
      },
      {
        minStreak: 15,
        label: "MEGA STREAK!",
        effect: "mega-streak",
      },
      {
        minStreak: 20,
        label: "LEGENDARY!",
        effect: "legendary",
      },
    ],
  },
} as const;

export type GameSfxGame = keyof typeof GAME_SFX;
export type GameSfxId<G extends GameSfxGame = GameSfxGame> =
  keyof (typeof GAME_SFX)[G];
export type PronunciationHitSfxEffect =
  | "correct"
  | "heating-up"
  | "combo"
  | "combo-breaker"
  | "on-fire"
  | "mega-streak"
  | "legendary";

let audioCtx: AudioContext | null = null;
let sensory: SensoryProfile = DEFAULT_SENSORY_PROFILE;

const BRIGHTNESS_CUTOFF_HZ: Record<SensorySoundBrightness, number> = { soft: 2_400, standard: 6_500, bright: 16_000 };

/** The chart's sensory sheet for the child on the kiosk: every game sound reads it (neutral until set). */
export function setGameSfxSensory(partial: Partial<SensoryProfile> | null | undefined): void {
  sensory = resolveSensoryProfile(partial);
  console.log(" 🎮 [sfx] [sensory] [set]", sensory);
}

export function getGameSfxSensory(): SensoryProfile {
  return sensory;
}

function soundOn(sheet: SensoryProfile): boolean {
  return sheet.soundEnabled && sheet.soundVolume > 0;
}

/** The one Web Audio context every game sound shares (browsers limit how many can be open). */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx || audioCtx.state === "closed") {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = Ctor ? new Ctor() : null;
  }
  return audioCtx;
}

/** Test seam: drop the cached context so a stubbed AudioContext is picked up. */
export function resetSharedAudioContextForTests(): void {
  audioCtx = null;
}

/** Per-sound output: volume from the sensory sheet, then a low-pass that rounds off harsh highs. */
export function sfxOutput(context: AudioContext, sheet: SensoryProfile = sensory, volume = 1): AudioNode {
  const gain = context.createGain();
  gain.gain.value = sheet.soundVolume * volume;
  if (typeof context.createBiquadFilter !== "function") {
    gain.connect(context.destination);
    return gain;
  }
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = BRIGHTNESS_CUTOFF_HZ[sheet.soundBrightness];
  gain.connect(filter);
  filter.connect(context.destination);
  return gain;
}

/** Runs a synthesized sound on the shared context through the sensory output; false when silent or unavailable. */
export function playSynth(label: string, run: (context: AudioContext, out: AudioNode) => void, sheet: SensoryProfile = sensory): boolean {
  if (!soundOn(sheet)) return false;
  try {
    const context = getSharedAudioContext();
    if (!context) return false;
    void context.resume?.()?.catch((error: unknown) => console.warn(" 🎮 [sfx] [resume] [blocked]", { label, error }));
    run(context, sfxOutput(context, sheet));
    return true;
  } catch (error) {
    console.warn(" 🎮 [sfx] [synth] [failed]", { label, error });
    return false;
  }
}

/** One recorded sound file at the sensory sheet's volume; false when silent or unavailable. */
export function playSfxFile(
  src: string,
  options: { label: string; volume?: number; rate?: number; sensory?: SensoryProfile },
): boolean {
  const sheet = options.sensory ?? sensory;
  if (!soundOn(sheet) || typeof Audio === "undefined") return false;
  try {
    const audio = new Audio(src);
    const softness = sheet.soundBrightness === "soft" ? 0.8 : 1;
    audio.volume = Math.max(0, Math.min(1, (options.volume ?? 0.85) * sheet.soundVolume * softness));
    audio.playbackRate = options.rate ?? 1;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      void result.catch((error: unknown) => console.warn(" 🎮 [sfx] [file] [blocked]", { label: options.label, src, error }));
    }
    return true;
  } catch (error) {
    console.warn(" 🎮 [sfx] [file] [unavailable]", { label: options.label, src, error });
    return false;
  }
}

/** One note (optionally gliding to toFrequency) into a sensory output. */
export function tone(
  context: AudioContext,
  out: AudioNode,
  frequency: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = "sine",
  toFrequency?: number,
): void {
  const start = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (toFrequency) oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

type Note = [frequency: number, startOffset: number, duration: number, gainPeak: number, type?: OscillatorType, toFrequency?: number];

/** Synthesized cues, each a list of notes. */
const SYNTH_CUES = {
  /** Slot machine lock: fairy-shimmer stacked sines. */
  lockChime: [[523, 0, 0.22, 0.16], [659, 0.08, 0.22, 0.16], [784, 0.16, 0.22, 0.16], [1047, 0.24, 0.22, 0.16]],
  /** Story finale: coins spent. */
  spend: [[780, 0, 0.16, 0.11, "triangle"], [620, 0.07, 0.16, 0.11, "triangle"], [480, 0.14, 0.16, 0.11, "triangle"]],
  wordRadarChime: [[523, 0, 0.35, 0.28], [659, 0.08, 0.35, 0.28], [784, 0.16, 0.35, 0.28]],
  wordRadarBuzz: [[180, 0, 0.35, 0.3, "sawtooth", 60]],
} satisfies Record<string, Note[]>;

export type SynthCue = keyof typeof SYNTH_CUES;

export function playSynthCue(cue: SynthCue): boolean {
  const notes: readonly Note[] = SYNTH_CUES[cue];
  return playSynth(cue, (context, out) => notes.forEach((note) => tone(context, out, ...note)));
}

/** Companion activities (tic-tac-toe, connect four): one short tone per move, game-agnostic. */
export type CompanionActivitySfx = "child_move" | "companion_move" | "round_complete";
export function playCompanionActivitySfx(kind: CompanionActivitySfx): boolean {
  const hz = { child_move: 520, companion_move: 740, round_complete: 880 }[kind];
  const done = kind === "round_complete";
  return playSynth(`companion-activity:${kind}`, (context, out) =>
    tone(context, out, hz, 0, done ? 0.28 : 0.16, done ? 0.075 : 0.045, done ? "triangle" : "sine", hz * (kind === "companion_move" ? 1.18 : 1.06)));
}

/** Reward loot sounds (node chest, boss drop): /sfx/loot/<name>.mp3. */
export function playLootSfx(name: string, rate = 1, volume = 0.6): boolean {
  return playSfxFile(`/sfx/loot/${name}.mp3`, { label: `loot:${name}`, rate, volume });
}

function srcForPronunciationEffect(effect: PronunciationHitSfxEffect): string | undefined {
  switch (effect) {
    case "correct":
      return GAME_SFX.pronunciation.hitPop;
    case "heating-up":
      return GAME_SFX.pronunciation.heatUp;
    case "combo":
      return GAME_SFX.pronunciation.combo;
    case "combo-breaker":
      return GAME_SFX.pronunciation.comboBreaker;
    case "on-fire":
      return GAME_SFX.pronunciation.onFire;
    case "mega-streak":
      return GAME_SFX.pronunciation.megaStreak;
    case "legendary":
      return GAME_SFX.pronunciation.legendary;
    default:
      return undefined;
  }
}

function playSfxSource(
  src: string,
  meta: { game: string; id: string },
  volume = 0.85,
): boolean {
  return playSfxFile(src, { label: `${meta.game}:${meta.id}`, volume });
}

export function playGameSfx<G extends GameSfxGame>(
  game: G,
  id: GameSfxId<G>,
): boolean {
  const src = GAME_SFX[game][id] as string | undefined;
  if (!src) return false;
  return playSfxSource(src, { game, id: String(id) });
}

export function playGeneratedMathSfx(cue: GeneratedMathSfxCue): boolean {
  return playGameSfx("generatedMath", cue);
}

export function playAdventureBoardSfx(cue: AdventureBoardSfxCue): boolean {
  return playGameSfx("adventureBoard", cue);
}

/** The approved unlock ceremony's recorded sounds (owner, 2026-11-03), timed to the board's ceremony stages:
 * rumble as the board dims, riser with the light pillar, the boom as the node bursts out, coins along the
 * new path, then the fanfare (Quest) or the boss hit. */
export function playUnlockCeremonySfx(kind: "quest" | "boss"): boolean {
  if (!soundOn(sensory) || typeof Audio === "undefined") return false;
  const boss = kind === "boss";
  const play = (name: string, rate = 1, volume = 0.85) =>
    playSfxFile(`/sfx/unlock/${name}.mp3`, { label: "unlock-ceremony", rate, volume });
  play("rumble", boss ? 0.8 : 1, boss ? 1 : 0.8);
  setTimeout(() => play("riser"), 900);
  setTimeout(() => { play("boom", boss ? 0.75 : 1); if (boss) play("boss"); }, 1250);
  for (let index = 1; index <= 12; index += 1) setTimeout(() => play("coin", 0.9 + index * 0.05, 0.6), 1900 + index * 70);
  if (!boss) setTimeout(() => play("fanfare"), 2200);
  console.log(" 🎮 [sfx] [unlock-ceremony] [played]", { kind });
  return true;
}

export function pronunciationHitSfxEffectForStreak(
  streak: number,
): PronunciationHitSfxEffect {
  const milestone = GAME_SFX_CONFIG.pronunciation.comboMilestones.find(
    (item) => item.minStreak === streak,
  );
  if (milestone) return milestone.effect;
  if (streak === 3) return "heating-up";
  if (streak > 3) return "combo";
  return "correct";
}

export function playPronunciationHitSfx(streak: number): boolean {
  if (!GAME_SFX_CONFIG.pronunciation.enabled) return false;
  const effect = pronunciationHitSfxEffectForStreak(streak);
  const src = srcForPronunciationEffect(effect);
  if (!src) return false;
  console.log(" 🎮 [sfx] [pronunciation] [hit]", {
    streak,
    effect,
    src,
  });
  return playSfxSource(
    src,
    { game: "pronunciation", id: effect },
    GAME_SFX_CONFIG.pronunciation.comboVolume,
  );
}
