export type WardrobeBodyProfileId =
  | "sunny-standard-v1"
  | "vroid-slim-v1"
  | "kefla-v1"
  | "melty-compact-v1"
  | "princess-tall-v1"
  | "tene-long-arm-v1"
  | "towa-athletic-v1"
  | "yukari-long-leg-v1";

export type WardrobeBodyProfile = {
  id: WardrobeBodyProfileId;
  label: string;
  classificationBasis: string;
  bindPoseMetrics: {
    headToFoot: number;
    shoulderBoneSpan: number;
    upperArm: number;
    forearm: number;
    upperLeg: number;
  };
};

export const WARDROBE_BODY_PROFILES: Readonly<
  Record<WardrobeBodyProfileId, WardrobeBodyProfile>
> = {
  "sunny-standard-v1": {
    id: "sunny-standard-v1",
    label: "Sunny Standard v1",
    classificationBasis: "Current Elli store reference model; Ribbon Dress visually approved.",
    bindPoseMetrics: {
      headToFoot: 1.2947,
      shoulderBoneSpan: 0.0448,
      upperArm: 0.2199,
      forearm: 0.2147,
      upperLeg: 0.353,
    },
  },
  "vroid-slim-v1": {
    id: "vroid-slim-v1",
    label: "VRoid Slim v1",
    classificationBasis: "Elli and Matilda source models share near-identical bind proportions.",
    bindPoseMetrics: {
      headToFoot: 1.2603,
      shoulderBoneSpan: 0.0441,
      upperArm: 0.2238,
      forearm: 0.2156,
      upperLeg: 0.3458,
    },
  },
  "kefla-v1": {
    id: "kefla-v1",
    label: "Kefla v1",
    classificationBasis: "Separate source family; matching bone lengths do not prove matching body volume.",
    bindPoseMetrics: {
      headToFoot: 1.2856,
      shoulderBoneSpan: 0.0448,
      upperArm: 0.2199,
      forearm: 0.2147,
      upperLeg: 0.353,
    },
  },
  "melty-compact-v1": {
    id: "melty-compact-v1",
    label: "Melty Compact v1",
    classificationBasis: "Narrower shoulder span and shorter forearm than the reference body.",
    bindPoseMetrics: {
      headToFoot: 1.2238,
      shoulderBoneSpan: 0.035,
      upperArm: 0.2202,
      forearm: 0.1883,
      upperLeg: 0.3789,
    },
  },
  "princess-tall-v1": {
    id: "princess-tall-v1",
    label: "Princess Tall v1",
    classificationBasis: "Substantially taller body with a wider shoulder rig and longer legs.",
    bindPoseMetrics: {
      headToFoot: 1.5435,
      shoulderBoneSpan: 0.0808,
      upperArm: 0.2904,
      forearm: 0.241,
      upperLeg: 0.4782,
    },
  },
  "tene-long-arm-v1": {
    id: "tene-long-arm-v1",
    label: "Tene Long Arm v1",
    classificationBasis: "Longer upper-arm ratio than the reference body.",
    bindPoseMetrics: {
      headToFoot: 1.2353,
      shoulderBoneSpan: 0.0416,
      upperArm: 0.2639,
      forearm: 0.2341,
      upperLeg: 0.3361,
    },
  },
  "towa-athletic-v1": {
    id: "towa-athletic-v1",
    label: "Towa Athletic v1",
    classificationBasis: "Wider shoulder span and shorter upper-leg ratio than the reference body.",
    bindPoseMetrics: {
      headToFoot: 1.2664,
      shoulderBoneSpan: 0.0477,
      upperArm: 0.234,
      forearm: 0.2285,
      upperLeg: 0.3211,
    },
  },
  "yukari-long-leg-v1": {
    id: "yukari-long-leg-v1",
    label: "Yukari Long Leg v1",
    classificationBasis: "Longer upper-leg and shorter arm ratios than the reference body.",
    bindPoseMetrics: {
      headToFoot: 1.2718,
      shoulderBoneSpan: 0.0418,
      upperArm: 0.2127,
      forearm: 0.1985,
      upperLeg: 0.3567,
    },
  },
};

export type CompanionWardrobeBodyAssignment = {
  companionId: string;
  companionName: string;
  activeModelUrl: string;
  activeBodyProfileId: WardrobeBodyProfileId;
  sourceModelUrl: string;
  sourceBodyProfileId: WardrobeBodyProfileId;
};

export const WARDROBE_COMPANION_BODY_ASSIGNMENTS: Readonly<
  Record<string, CompanionWardrobeBodyAssignment>
> = {
  elli: {
    companionId: "elli",
    companionName: "Elli",
    activeModelUrl: "/companions/sample.vrm",
    activeBodyProfileId: "sunny-standard-v1",
    sourceModelUrl: "/companions/2878599730723533962.vrm",
    sourceBodyProfileId: "vroid-slim-v1",
  },
  kefla: {
    companionId: "kefla",
    companionName: "Kefla",
    activeModelUrl: "/companions/Kefla.vrm",
    activeBodyProfileId: "kefla-v1",
    sourceModelUrl: "/companions/Kefla.vrm",
    sourceBodyProfileId: "kefla-v1",
  },
  matilda: {
    companionId: "matilda",
    companionName: "Matilda",
    activeModelUrl: "/companions/sample.vrm",
    activeBodyProfileId: "sunny-standard-v1",
    sourceModelUrl: "/companions/673852811403133503.vrm",
    sourceBodyProfileId: "vroid-slim-v1",
  },
  melty: {
    companionId: "melty",
    companionName: "Melty",
    activeModelUrl: "/companions/4573661938486170180.vrm",
    activeBodyProfileId: "melty-compact-v1",
    sourceModelUrl: "/companions/4573661938486170180.vrm",
    sourceBodyProfileId: "melty-compact-v1",
  },
  princess: {
    companionId: "princess",
    companionName: "Princess",
    activeModelUrl: "/companions/princess.vrm",
    activeBodyProfileId: "princess-tall-v1",
    sourceModelUrl: "/companions/princess.vrm",
    sourceBodyProfileId: "princess-tall-v1",
  },
  tene: {
    companionId: "tene",
    companionName: "Tene",
    activeModelUrl: "/companions/1537416846714225126.vrm",
    activeBodyProfileId: "tene-long-arm-v1",
    sourceModelUrl: "/companions/1537416846714225126.vrm",
    sourceBodyProfileId: "tene-long-arm-v1",
  },
  towa: {
    companionId: "towa",
    companionName: "Towa",
    activeModelUrl: "/companions/7339187387832391139.vrm",
    activeBodyProfileId: "towa-athletic-v1",
    sourceModelUrl: "/companions/7339187387832391139.vrm",
    sourceBodyProfileId: "towa-athletic-v1",
  },
  yukari: {
    companionId: "yukari",
    companionName: "Yukari",
    activeModelUrl: "/companions/3852603318431396015.vrm",
    activeBodyProfileId: "yukari-long-leg-v1",
    sourceModelUrl: "/companions/3852603318431396015.vrm",
    sourceBodyProfileId: "yukari-long-leg-v1",
  },
};

const BODY_PROFILE_BY_MODEL_URL = new Map<string, WardrobeBodyProfileId>();
for (const assignment of Object.values(WARDROBE_COMPANION_BODY_ASSIGNMENTS)) {
  BODY_PROFILE_BY_MODEL_URL.set(
    assignment.activeModelUrl,
    assignment.activeBodyProfileId,
  );
  BODY_PROFILE_BY_MODEL_URL.set(
    assignment.sourceModelUrl,
    assignment.sourceBodyProfileId,
  );
}

export function resolveWardrobeBodyProfileId(modelUrl: string) {
  return BODY_PROFILE_BY_MODEL_URL.get(modelUrl) ?? null;
}

export type WardrobeCompatibilityCase = {
  id: string;
  kind: "reference" | "source";
  companionId: string;
  companionName: string;
  label: string;
  modelUrl: string;
  bodyProfileId: WardrobeBodyProfileId;
  dressQaStatus: "approved" | "candidate";
};

export const WARDROBE_COMPATIBILITY_CASES: readonly WardrobeCompatibilityCase[] = [
  {
    id: "elli-store-reference",
    kind: "reference",
    companionId: "elli",
    companionName: "Elli",
    label: "Elli store reference",
    modelUrl: "/companions/sample.vrm",
    bodyProfileId: "sunny-standard-v1",
    dressQaStatus: "approved",
  },
  ...Object.values(WARDROBE_COMPANION_BODY_ASSIGNMENTS).map((assignment) => ({
    id: `${assignment.companionId}-source-model`,
    kind: "source" as const,
    companionId: assignment.companionId,
    companionName: assignment.companionName,
    label: `${assignment.companionName} source model`,
    modelUrl: assignment.sourceModelUrl,
    bodyProfileId: assignment.sourceBodyProfileId,
    dressQaStatus: "candidate" as const,
  })),
];
