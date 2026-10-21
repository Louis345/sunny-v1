import type {
  CapturedMonsterCapturePersonality,
  CapturedMonsterConfig,
} from "./capturedMonsterCatalog";

export type CreatureFidgetMove =
  | "look-left"
  | "look-right"
  | "hop"
  | "shrink-peek"
  | "sway"
  | "chest-up"
  | "yawn"
  | "slow-sway"
  | "ear-wiggle";

export type CreatureLifeReaction =
  | "none"
  | "perk"
  | "concerned"
  | "alert"
  | "excited";

export interface CreatureLifeAnchorPoint {
  xPct: number;
  yPct: number;
}

export interface CreatureLifeAnchors {
  eyeLeft: CreatureLifeAnchorPoint;
  eyeRight: CreatureLifeAnchorPoint;
  eyeWidthPct: number;
  eyeHeightPct: number;
  lidColor: string;
}

export interface CreatureLifeProfile {
  breathe: { periodMs: number; scaleAmp: number };
  hover: { periodMs: number; pxAmp: number };
  sway: { periodMs: number; degAmp: number };
  blink: { minGapMs: number; maxGapMs: number; doubleBlinkChance: number };
  glance: { minGapMs: number; maxGapMs: number };
  fidget: { minGapMs: number; maxGapMs: number; moves: CreatureFidgetMove[] };
  drift: { periodMs: number; ampPx: number };
  reactionAmp: number;
}

export interface ResolvedCreatureLifeProfile extends CreatureLifeProfile {
  personality: CapturedMonsterCapturePersonality;
  anchors: CreatureLifeAnchors | null;
}

export const PERSONALITY_LIFE_DEFAULTS: Record<
  CapturedMonsterCapturePersonality,
  CreatureLifeProfile
> = {
  playful: {
    breathe: { periodMs: 2400, scaleAmp: 0.03 },
    hover: { periodMs: 3700, pxAmp: 7 },
    sway: { periodMs: 5100, degAmp: 1.2 },
    blink: { minGapMs: 2000, maxGapMs: 6200, doubleBlinkChance: 0.14 },
    glance: { minGapMs: 3600, maxGapMs: 8200 },
    fidget: { minGapMs: 7000, maxGapMs: 13000, moves: ["look-left", "look-right", "hop", "ear-wiggle"] },
    drift: { periodMs: 3200, ampPx: 46 },
    reactionAmp: 1,
  },
  shy: {
    breathe: { periodMs: 2800, scaleAmp: 0.02 },
    hover: { periodMs: 4100, pxAmp: 4 },
    sway: { periodMs: 5700, degAmp: 0.7 },
    blink: { minGapMs: 2400, maxGapMs: 7000, doubleBlinkChance: 0.2 },
    glance: { minGapMs: 4400, maxGapMs: 9400 },
    fidget: { minGapMs: 9000, maxGapMs: 16000, moves: ["shrink-peek", "sway", "look-left"] },
    drift: { periodMs: 4200, ampPx: 28 },
    reactionAmp: 0.7,
  },
  brave: {
    breathe: { periodMs: 2600, scaleAmp: 0.028 },
    hover: { periodMs: 3900, pxAmp: 6 },
    sway: { periodMs: 5300, degAmp: 1.5 },
    blink: { minGapMs: 2600, maxGapMs: 7200, doubleBlinkChance: 0.08 },
    glance: { minGapMs: 4000, maxGapMs: 8800 },
    fidget: { minGapMs: 8000, maxGapMs: 14000, moves: ["chest-up", "look-left", "look-right"] },
    drift: { periodMs: 3600, ampPx: 38 },
    reactionAmp: 1.15,
  },
  sleepy: {
    breathe: { periodMs: 3400, scaleAmp: 0.034 },
    hover: { periodMs: 4900, pxAmp: 5 },
    sway: { periodMs: 6700, degAmp: 1 },
    blink: { minGapMs: 4000, maxGapMs: 9000, doubleBlinkChance: 0.05 },
    glance: { minGapMs: 6000, maxGapMs: 12000 },
    fidget: { minGapMs: 10000, maxGapMs: 18000, moves: ["yawn", "slow-sway"] },
    drift: { periodMs: 5200, ampPx: 20 },
    reactionAmp: 0.6,
  },
};

function assertGapRange(name: string, minGapMs: number, maxGapMs: number): void {
  if (!Number.isFinite(minGapMs) || !Number.isFinite(maxGapMs) || minGapMs <= 0 || maxGapMs <= minGapMs) {
    throw new Error(`creature_life_profile_invalid:${name}_gap_range`);
  }
}

function assertPositive(name: string, value: number, max: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`creature_life_profile_invalid:${name}`);
  }
}

function validateLifeProfile(profile: CreatureLifeProfile): void {
  assertPositive("breathe_period", profile.breathe.periodMs, 20000);
  assertPositive("breathe_scale_amp", profile.breathe.scaleAmp, 0.12);
  assertPositive("hover_period", profile.hover.periodMs, 20000);
  assertPositive("hover_px_amp", profile.hover.pxAmp, 24);
  assertPositive("sway_period", profile.sway.periodMs, 30000);
  assertPositive("sway_deg_amp", profile.sway.degAmp, 6);
  assertGapRange("blink", profile.blink.minGapMs, profile.blink.maxGapMs);
  if (profile.blink.doubleBlinkChance < 0 || profile.blink.doubleBlinkChance > 1) {
    throw new Error("creature_life_profile_invalid:double_blink_chance");
  }
  assertGapRange("glance", profile.glance.minGapMs, profile.glance.maxGapMs);
  assertGapRange("fidget", profile.fidget.minGapMs, profile.fidget.maxGapMs);
  assertPositive("drift_period", profile.drift.periodMs, 30000);
  if (!Number.isFinite(profile.drift.ampPx) || profile.drift.ampPx < 0 || profile.drift.ampPx > 120) {
    throw new Error("creature_life_profile_invalid:drift_amp");
  }
  if (profile.fidget.moves.length === 0) {
    throw new Error("creature_life_profile_invalid:fidget_moves_empty");
  }
  assertPositive("reaction_amp", profile.reactionAmp, 2);
}

function validateAnchors(anchors: CreatureLifeAnchors): void {
  const points = [anchors.eyeLeft, anchors.eyeRight];
  for (const point of points) {
    if (
      !Number.isFinite(point.xPct) ||
      !Number.isFinite(point.yPct) ||
      point.xPct < 0 ||
      point.xPct > 100 ||
      point.yPct < 0 ||
      point.yPct > 100
    ) {
      throw new Error("creature_life_profile_invalid:anchor_point");
    }
  }
  if (
    !Number.isFinite(anchors.eyeWidthPct) ||
    !Number.isFinite(anchors.eyeHeightPct) ||
    anchors.eyeWidthPct <= 0 ||
    anchors.eyeWidthPct > 40 ||
    anchors.eyeHeightPct <= 0 ||
    anchors.eyeHeightPct > 40
  ) {
    throw new Error("creature_life_profile_invalid:anchor_size");
  }
  if (!anchors.lidColor) {
    throw new Error("creature_life_profile_invalid:lid_color");
  }
}

export function resolveLifeProfile(
  config: Pick<CapturedMonsterConfig, "capturePersonality" | "lifeAnchors" | "lifeProfile">,
): ResolvedCreatureLifeProfile {
  const defaults = PERSONALITY_LIFE_DEFAULTS[config.capturePersonality];
  if (!defaults) {
    throw new Error("creature_life_profile_invalid:unknown_personality");
  }
  const overrides = config.lifeProfile ?? {};
  const merged: CreatureLifeProfile = {
    breathe: { ...defaults.breathe, ...overrides.breathe },
    hover: { ...defaults.hover, ...overrides.hover },
    sway: { ...defaults.sway, ...overrides.sway },
    blink: { ...defaults.blink, ...overrides.blink },
    glance: { ...defaults.glance, ...overrides.glance },
    fidget: { ...defaults.fidget, ...overrides.fidget },
    drift: { ...defaults.drift, ...overrides.drift },
    reactionAmp: overrides.reactionAmp ?? defaults.reactionAmp,
  };
  validateLifeProfile(merged);
  const anchors = config.lifeAnchors ?? null;
  if (anchors) {
    validateAnchors(anchors);
  }
  return {
    ...merged,
    personality: config.capturePersonality,
    anchors,
  };
}
