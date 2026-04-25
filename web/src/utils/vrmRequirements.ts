/** Blend shapes / expressions required for companion reactions + mouth (COMPANION-002). */
export const REQUIRED_VRM_EXPRESSIONS = ["happy", "sad", "surprised", "aa"] as const;
export type RequiredVrmExpression = (typeof REQUIRED_VRM_EXPRESSIONS)[number];

/**
 * VRM 1.x models usually expose lower-case presets (`happy`, `aa`), while many
 * VRM 0.x exports expose legacy names (`Joy`, `A`). Treat those as equivalent
 * for validation and expression playback so downloaded companions can render.
 */
export const VRM_EXPRESSION_ALIASES: Record<RequiredVrmExpression, string[]> = {
  happy: ["happy", "Joy", "joy", "Fun", "fun"],
  sad: ["sad", "Sorrow", "sorrow"],
  surprised: ["surprised", "Surprised"],
  aa: ["aa", "A", "a"],
};

const OPTIONAL_VRM_EXPRESSION_ALIASES: Record<string, string[]> = {
  neutral: ["neutral", "Neutral"],
  angry: ["angry", "Angry"],
  blink: ["blink", "Blink"],
  blinkLeft: ["blinkLeft", "Blink_L"],
  blinkRight: ["blinkRight", "Blink_R"],
  relaxed: ["relaxed", "Fun", "fun"],
};

/** Humanoid bones required for poses and validation (COMPANION-002). */
export const REQUIRED_VRM_BONES = ["head", "leftHand", "rightHand", "spine"] as const;

export interface VrmExpressionManagerLike {
  getExpression(name: string): unknown | null;
}

export interface VrmHumanoidLike {
  getRawBoneNode(name: string): unknown | null;
}

export interface VrmValidateTarget {
  expressionManager?: VrmExpressionManagerLike | null;
  humanoid: VrmHumanoidLike;
}

export function resolveVrmExpressionName(
  em: VrmExpressionManagerLike,
  preferredName: string,
): string | null {
  if (em.getExpression(preferredName) != null) return preferredName;
  const aliases =
    VRM_EXPRESSION_ALIASES[preferredName as RequiredVrmExpression] ??
    OPTIONAL_VRM_EXPRESSION_ALIASES[preferredName] ??
    [];
  for (const alias of aliases) {
    if (em.getExpression(alias) != null) return alias;
  }
  return null;
}

/**
 * Throws a descriptive Error if the loaded VRM does not meet companion requirements.
 */
export function validateVrmRequirements(vrm: VrmValidateTarget): void {
  const em = vrm.expressionManager;
  if (!em) {
    throw new Error("CompanionLayer: VRM is missing expressionManager");
  }
  for (const name of REQUIRED_VRM_EXPRESSIONS) {
    if (resolveVrmExpressionName(em, name) == null) {
      throw new Error(
        `CompanionLayer: VRM is missing required expression/blend shape "${name}" or VRM0 alias`,
      );
    }
  }
  const h = vrm.humanoid;
  for (const bone of REQUIRED_VRM_BONES) {
    const node = h.getRawBoneNode(bone);
    if (node == null) {
      throw new Error(`CompanionLayer: VRM is missing required humanoid bone "${bone}"`);
    }
  }
}
