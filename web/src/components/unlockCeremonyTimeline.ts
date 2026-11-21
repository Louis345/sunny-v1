/** The rumble holds the reveal while her companion notices the moment (owner, 2026-11-20: "Elli's like, oh my god,
 * something's happening, and then the sound effect, and then the quest and boss node are shown"). */
export const UNLOCK_CEREMONY_BUILD_UP_MS = 3000;
const B = UNLOCK_CEREMONY_BUILD_UP_MS;
export const UNLOCK_CEREMONY_STAGES = [
  { stage: "dim", at: 0 },
  { stage: "shake", at: 450 },
  { stage: "rumble", at: 1050 },
  { stage: "pillar", at: 900 + B },
  { stage: "rise", at: 1250 + B },
  { stage: "open", at: 1900 + B },
  { stage: "banner", at: 2200 + B },
] as const;
export const UNLOCK_CEREMONY_END_MS = 4400 + B;
/** When a stage starts, for the sound and the Boss's second shake to follow the same timeline. */
export const ceremonyStageAt = (stage: (typeof UNLOCK_CEREMONY_STAGES)[number]["stage"]): number =>
  UNLOCK_CEREMONY_STAGES.find(entry => entry.stage === stage)!.at;
