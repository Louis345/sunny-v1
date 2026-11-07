import engineeringReviews from "./wardrobeEngineeringReview.json";
import preparedAssets from "./wardrobePrepared.generated.json";
import assetVersions from "./wardrobeAssetVersions.generated.json";
import fittedAssets from "./wardrobeFitted.generated.json";
import { WARDROBE_HUMAN_APPROVAL_BATCH } from "./wardrobeHumanApprovals";

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
    classificationBasis: "Current Elli identity reference. Wardrobe combinations require review for their exact asset versions.",
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

export type PreparedWardrobePresentation = {
  companionId: string;
  bodyModelUrl: string;
  bodyProfileId: WardrobeBodyProfileId;
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
    activeModelUrl: "/companions/673852811403133503.vrm",
    activeBodyProfileId: "vroid-slim-v1",
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

for (const prepared of preparedAssets) {
  BODY_PROFILE_BY_MODEL_URL.set(prepared.modelUrl, prepared.bodyProfileId as WardrobeBodyProfileId);
}

export function resolvePreparedWardrobePresentation(
  companionId: string,
): PreparedWardrobePresentation | null {
  const prepared = preparedAssets.find(asset => asset.companionId === companionId);
  if (prepared) return {
    companionId,
    bodyModelUrl: prepared.modelUrl,
    bodyProfileId: prepared.bodyProfileId as WardrobeBodyProfileId,
  };
  return null;
}

export type WardrobeCompatibilityCase = {
  id: string;
  kind: "reference" | "source" | "prepared";
  sourceModelUrl?: string;
  companionId: string;
  companionName: string;
  label: string;
  modelUrl: string;
  bodyProfileId: WardrobeBodyProfileId;
  dressQaStatus: "approved" | "candidate";
};

export const WARDROBE_COMPATIBILITY_CASES: readonly WardrobeCompatibilityCase[] = [
  ...preparedAssets.map(prepared => ({
    id: `${prepared.companionId}-prepared-identity`, kind: "prepared" as const,
    companionId: prepared.companionId,
    companionName: WARDROBE_COMPANION_BODY_ASSIGNMENTS[prepared.companionId].companionName,
    label: `${WARDROBE_COMPANION_BODY_ASSIGNMENTS[prepared.companionId].companionName} prepared identity`,
    sourceModelUrl: prepared.sourceUrl, modelUrl: prepared.modelUrl,
    bodyProfileId: prepared.bodyProfileId as WardrobeBodyProfileId, dressQaStatus: "candidate" as const,
  })),
  ...Object.values(WARDROBE_COMPANION_BODY_ASSIGNMENTS).map(assignment => ({
    id: `${assignment.companionId}-source-model`, kind: "source" as const,
    companionId: assignment.companionId, companionName: assignment.companionName,
    label: `${assignment.companionName} source model`,
    modelUrl: preparedAssets.find(p=>p.companionId===assignment.companionId)?.sourceUrl??assignment.sourceModelUrl,
    bodyProfileId: assignment.sourceBodyProfileId, dressQaStatus: "candidate" as const,
  })),
];

export type WardrobeTemplateCertificationStatus =
  | "approved"
  | "candidate"
  | "rejected";

export type WardrobeTemplateCertification = {
  companionId: string;
  templateId: string;
  status: WardrobeTemplateCertificationStatus;
  reason: string;
  modelUrl?: string;
  preparedSha256?: string;
  assetVersion?: string;
  recipeVersion?: string;
  fittedSha256?: string;
  humanReview?: { reviewedBy: string; reviewedAt: string; evidence: string[] };
};

export type WardrobePairCertification={companionId:string;outfitItemId:string;accessoryItemId:string;version:string;status:WardrobeTemplateCertificationStatus;humanReview?:WardrobeTemplateCertification['humanReview']};
export const WARDROBE_PAIR_CERTIFICATIONS:readonly WardrobePairCertification[]=[];
export function isWardrobePairApproved(companionId:string,outfitItemId:string,accessoryItemId:string,version:string,records:readonly WardrobePairCertification[]=WARDROBE_PAIR_CERTIFICATIONS){
 return Boolean(version&&records.some(r=>r.companionId===companionId&&r.outfitItemId===outfitItemId&&r.accessoryItemId===accessoryItemId&&r.version===version&&r.status==='approved'&&r.humanReview?.reviewedBy.trim()&&r.humanReview.reviewedAt&&r.humanReview.evidence.length));
}

export function validateWardrobeCertification(
  record: WardrobeTemplateCertification,
  current: { modelUrl: string; preparedSha256: string; assetVersion: string; recipeVersion: string; fittedSha256: string },
): WardrobeTemplateCertification {
  if (record.status !== "approved") return record;
  const matches = Object.entries(current).every(([key, value]) => value && record[key as keyof WardrobeTemplateCertification] === value);
  const review = record.humanReview;
  if (matches && review?.reviewedBy.trim() && review.reviewedAt && review.evidence.length > 0) return record;
  return { ...record, status: "candidate", reason: "Current asset versions require a recorded human visual review." };
}

export const WARDROBE_TEMPLATE_CERTIFICATIONS: readonly WardrobeTemplateCertification[] =
  Object.entries(WARDROBE_HUMAN_APPROVAL_BATCH.fits).flatMap(
    ([companionId, approvedFits]) => {
      const body = WARDROBE_HUMAN_APPROVAL_BATCH.bodies[
        companionId as keyof typeof WARDROBE_HUMAN_APPROVAL_BATCH.bodies
      ];
      return Object.entries(approvedFits).map(([templateId, fit]) => ({
        companionId,
        templateId,
        status: "approved" as const,
        reason: "Human-reviewed in the native identity wardrobe certification lab.",
        modelUrl: body.modelUrl,
        preparedSha256: body.preparedSha256,
        assetVersion:
          WARDROBE_HUMAN_APPROVAL_BATCH.templates[
            templateId as keyof typeof WARDROBE_HUMAN_APPROVAL_BATCH.templates
          ],
        recipeVersion: body.recipeVersion,
        fittedSha256: fit.fittedSha256,
        humanReview: {
          reviewedBy: WARDROBE_HUMAN_APPROVAL_BATCH.reviewedBy,
          reviewedAt: WARDROBE_HUMAN_APPROVAL_BATCH.reviewedAt,
          evidence: [fit.evidence],
        },
      }));
    },
  );

export function resolveWardrobeTemplateCertification(
  companionId: string,
  templateId: string,
  modelUrl?: string,
): WardrobeTemplateCertification {
  const record = WARDROBE_TEMPLATE_CERTIFICATIONS.find(entry => entry.companionId === companionId && entry.templateId === templateId) ?? {
    companionId, templateId, status: "candidate" as const,
    reason: "No human-reviewed fit has been recorded for this companion yet.",
  };
  const prepared = preparedAssets.find(asset => asset.companionId === companionId);
  const assetVersion = (assetVersions as Record<string, string>)[templateId] ?? "";
  const outfitId = templateId === "ribbon-dress" ? "sleeveless-dress" : templateId;
  const isGarment = ["ribbon-dress", "comet-hoodie", "constellation-blazer"].includes(templateId);
  const fitted = fittedAssets.find(asset => asset.companionId === companionId && asset.outfitId === outfitId && asset.bodySha256 === prepared?.preparedSha256 && asset.sourceVersion === assetVersion);
  return validateWardrobeCertification(record, {
    modelUrl: modelUrl ?? prepared?.modelUrl ?? "",
    preparedSha256: prepared?.preparedSha256 ?? "",
    recipeVersion: prepared?.recipeVersion ?? "",
    assetVersion,
    fittedSha256: isGarment ? fitted?.sha256 ?? "" : "not-applicable",
  });
}

export const WARDROBE_STORE_CERTIFICATION_CASES: readonly WardrobeCompatibilityCase[] =
  WARDROBE_COMPATIBILITY_CASES.filter(testCase=>testCase.kind === "prepared");

export type WardrobeEngineeringReview = {
  companionId: string;
  preparedSha256: string;
  recipeVersion: string;
  presentationVersion: string;
  automated: string;
  accessoryVersions?: Partial<Record<string,string>>;
  supplemental?: {check:string;path:string}[];
  garments: {outfitId:string;sha256:string;sourceVersion:string;visual:string;evidence:{check:string;path:string}[]}[];
};
const REQUIRED_VISUAL_CHECKS=['front:idle','back:idle','side:idle','face:idle','face:speak','face:head-turn','front:arms-up','front:elbows-bent'];
export function isWardrobeReadyForHumanReview(companionId:string,records:readonly WardrobeEngineeringReview[]=engineeringReviews):boolean {
  const body=preparedAssets.find(b=>b.companionId===companionId);
  const record=records.find(r=>r.companionId===companionId);
  const presentation=(assetVersions as Record<string,string>).presentation;
  if(!body||!record||record.automated!=='passed'||!presentation||record.presentationVersion!==presentation||record.preparedSha256!==body.preparedSha256||record.recipeVersion!==body.recipeVersion)return false;
  const hasSupplemental=(check:string)=>record.supplemental?.some(e=>e.check===check&&e.path.trim());
  if(!hasSupplemental('face:blink'))return false;
  // Measured optional accessories form the original complete wardrobe deliverable.
  // Each must be inspected on every garment; profiles cannot grant that coverage.
  const accessories=Object.keys(body.accessoryFits??{});
  const accessoryIds:Record<string,string>={crown:'royal-crown','cat-ears':'cat-ears',halo:'star-halo'};
  if(accessories.some(accessory=>!record.accessoryVersions?.[accessory]||record.accessoryVersions[accessory]!==((assetVersions as Record<string,string>)[accessoryIds[accessory]])))return false;
  if(accessories.length&&(!['plum','teal','rose'].every(color=>hasSupplemental(`${color}-ribbon-dress`))||!['sleeveless-dress','comet-hoodie','constellation-blazer'].every(outfit=>accessories.every(accessory=>hasSupplemental(`${outfit}:${accessory}`)))))return false;
  return ['sleeveless-dress','comet-hoodie','constellation-blazer'].every(outfitId=>{
    const sourceVersion=(assetVersions as Record<string,string>)[outfitId==='sleeveless-dress'?'ribbon-dress':outfitId];
    const fit=fittedAssets.find(f=>f.companionId===companionId&&f.outfitId===outfitId&&f.bodySha256===body.preparedSha256&&f.sourceVersion===sourceVersion);
    const review=record.garments.find(g=>g.outfitId===outfitId);
    return Boolean(fit&&review&&review.sha256===fit.sha256&&review.sourceVersion===sourceVersion&&review.visual==='passed'&&REQUIRED_VISUAL_CHECKS.every(check=>review.evidence.some(e=>e.check===check&&e.path.trim())));
  });
}
