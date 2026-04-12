/** Blend shapes / expressions required for companion reactions + mouth (COMPANION-002). */
export const REQUIRED_VRM_EXPRESSIONS = ["happy", "sad", "surprised", "aa"] as const;

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

/**
 * Throws a descriptive Error if the loaded VRM does not meet companion requirements.
 */
export function validateVrmRequirements(vrm: VrmValidateTarget): void {
  const em = vrm.expressionManager;
  if (!em) {
    throw new Error("CompanionLayer: VRM is missing expressionManager");
  }
  for (const name of REQUIRED_VRM_EXPRESSIONS) {
    if (em.getExpression(name) == null) {
      throw new Error(
        `CompanionLayer: VRM is missing required expression/blend shape "${name}"`,
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
