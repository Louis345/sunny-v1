import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const MIXAMO_TO_VRM_HUMANOID: Record<string, VRMHumanBoneName> = {
  "mixamorig:Hips": "hips",
  "mixamorig:Spine": "spine",
  "mixamorig:Spine1": "chest",
  "mixamorig:Spine2": "upperChest",
  "mixamorig:Neck": "neck",
  "mixamorig:Head": "head",
  "mixamorig:LeftShoulder": "leftShoulder",
  "mixamorig:LeftArm": "leftUpperArm",
  "mixamorig:LeftForeArm": "leftLowerArm",
  "mixamorig:LeftHand": "leftHand",
  "mixamorig:RightShoulder": "rightShoulder",
  "mixamorig:RightArm": "rightUpperArm",
  "mixamorig:RightForeArm": "rightLowerArm",
  "mixamorig:RightHand": "rightHand",
  "mixamorig:LeftUpLeg": "leftUpperLeg",
  "mixamorig:LeftLeg": "leftLowerLeg",
  "mixamorig:LeftFoot": "leftFoot",
  "mixamorig:LeftToeBase": "leftToes",
  "mixamorig:RightUpLeg": "rightUpperLeg",
  "mixamorig:RightLeg": "rightLowerLeg",
  "mixamorig:RightFoot": "rightFoot",
  "mixamorig:RightToeBase": "rightToes",
  "mixamorig:LeftEye": "leftEye",
  "mixamorig:RightEye": "rightEye",
  "mixamorig:LeftHandThumb1": "leftThumbMetacarpal",
  "mixamorig:LeftHandThumb2": "leftThumbProximal",
  "mixamorig:LeftHandThumb3": "leftThumbDistal",
  "mixamorig:RightHandThumb1": "rightThumbMetacarpal",
  "mixamorig:RightHandThumb2": "rightThumbProximal",
  "mixamorig:RightHandThumb3": "rightThumbDistal",
  "mixamorig:LeftHandIndex1": "leftIndexProximal",
  "mixamorig:LeftHandIndex2": "leftIndexIntermediate",
  "mixamorig:LeftHandIndex3": "leftIndexDistal",
  "mixamorig:RightHandIndex1": "rightIndexProximal",
  "mixamorig:RightHandIndex2": "rightIndexIntermediate",
  "mixamorig:RightHandIndex3": "rightIndexDistal",
  "mixamorig:LeftHandMiddle1": "leftMiddleProximal",
  "mixamorig:LeftHandMiddle2": "leftMiddleIntermediate",
  "mixamorig:LeftHandMiddle3": "leftMiddleDistal",
  "mixamorig:RightHandMiddle1": "rightMiddleProximal",
  "mixamorig:RightHandMiddle2": "rightMiddleIntermediate",
  "mixamorig:RightHandMiddle3": "rightMiddleDistal",
  "mixamorig:LeftHandRing1": "leftRingProximal",
  "mixamorig:LeftHandRing2": "leftRingIntermediate",
  "mixamorig:LeftHandRing3": "leftRingDistal",
  "mixamorig:RightHandRing1": "rightRingProximal",
  "mixamorig:RightHandRing2": "rightRingIntermediate",
  "mixamorig:RightHandRing3": "rightRingDistal",
  "mixamorig:LeftHandPinky1": "leftLittleProximal",
  "mixamorig:LeftHandPinky2": "leftLittleIntermediate",
  "mixamorig:LeftHandPinky3": "leftLittleDistal",
  "mixamorig:RightHandPinky1": "rightLittleProximal",
  "mixamorig:RightHandPinky2": "rightLittleIntermediate",
  "mixamorig:RightHandPinky3": "rightLittleDistal",
};

const LEGACY_VRM0_ARM_ROLL_BONES = new Set<VRMHumanBoneName>([
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
]);
const MIXAMO_CENTIMETERS_TO_VRM_METERS = 0.01;
export type MixamoRetargetArmCorrection =
  | "standard"
  | "legacy-vrm0"
  | "mirrored-arm-rest-x";

export type MixamoRetargetCompatibility = {
  armCorrection: MixamoRetargetArmCorrection;
};

function toCanonicalMixamoBoneName(name: string): string {
  return name
    .replace(/^mixamorig_/, "mixamorig:")
    .replace(/^mixamorig([A-Z])/, "mixamorig:$1");
}

function isLegacyVrm0(vrm: VRM): boolean {
  const metaVersion = (vrm as { meta?: { metaVersion?: unknown } }).meta
    ?.metaVersion;
  return String(metaVersion ?? "").startsWith("0");
}

function getNormalizedBoneLocalX(vrm: VRM, boneName: VRMHumanBoneName): number | null {
  const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
  if (!node) return null;
  return Number.isFinite(node.position.x) ? node.position.x : null;
}

export function resolveMixamoRetargetCompatibility(
  vrm: VRM,
): MixamoRetargetCompatibility {
  const leftLowerArmX = getNormalizedBoneLocalX(vrm, "leftLowerArm");
  const rightLowerArmX = getNormalizedBoneLocalX(vrm, "rightLowerArm");

  if (
    leftLowerArmX != null &&
    rightLowerArmX != null &&
    leftLowerArmX < 0 &&
    rightLowerArmX > 0
  ) {
    return { armCorrection: "mirrored-arm-rest-x" };
  }

  if (!isLegacyVrm0(vrm)) {
    return { armCorrection: "standard" };
  }

  return { armCorrection: "legacy-vrm0" };
}

function applyLegacyVrm0QuaternionCoordinates(quat: THREE.Quaternion): void {
  quat.x *= -1;
  quat.z *= -1;
  quat.normalize();
}

function findMixamoRigObject(
  root: THREE.Object3D,
  rigName: string,
): THREE.Object3D | undefined {
  return (
    root.getObjectByName(rigName) ??
    root.getObjectByName(toCanonicalMixamoBoneName(rigName)) ??
    root.getObjectByName(toCanonicalMixamoBoneName(rigName).replace(":", ""))
  );
}

function getVrmHipsRestHeight(vrm: VRM, fallbackNode: THREE.Object3D): number {
  const normalizedRestPose = (
    vrm.humanoid as unknown as {
      normalizedRestPose?: {
        hips?: { position?: ArrayLike<number> };
      };
    }
  ).normalizedRestPose;
  const restY = normalizedRestPose?.hips?.position?.[1];
  if (Number.isFinite(restY)) {
    return Number(restY);
  }
  return fallbackNode.position.y;
}

function getHipsPositionScale(
  vrm: VRM,
  mixamoRoot: THREE.Object3D,
  vrmHipsNode: THREE.Object3D,
): number {
  const sourceHips =
    mixamoRoot.getObjectByName("mixamorigHips") ??
    mixamoRoot.getObjectByName("mixamorig:Hips") ??
    mixamoRoot.getObjectByName("mixamorig_Hips");
  const sourceHeight = sourceHips?.position.y;
  if (sourceHeight && Number.isFinite(sourceHeight) && Math.abs(sourceHeight) > 1e-6) {
    return getVrmHipsRestHeight(vrm, vrmHipsNode) / sourceHeight;
  }
  return MIXAMO_CENTIMETERS_TO_VRM_METERS;
}

export function retargetMixamoClipToVrm(
  clip: THREE.AnimationClip,
  mixamoRoot: THREE.Object3D,
  vrm: VRM,
): THREE.AnimationClip | null {
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();

  if (!vrm.humanoid) {
    return null;
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const compatibility = resolveMixamoRetargetCompatibility(vrm);
  const legacyVrm0 = isLegacyVrm0(vrm);
  if (compatibility.armCorrection !== "standard") {
    console.log(
      `🎮 [mixamoRetarget] [compat] [${compatibility.armCorrection}]`,
    );
  }

  for (const track of clip.tracks) {
    const dotIdx = track.name.lastIndexOf(".");
    const rawBonePart = dotIdx >= 0 ? track.name.slice(0, dotIdx) : track.name;
    const pipeIdx = rawBonePart.lastIndexOf("|");
    const mixamoRigName = pipeIdx >= 0 ? rawBonePart.slice(pipeIdx + 1) : rawBonePart;
    const property = dotIdx >= 0 ? track.name.slice(dotIdx + 1) : "";

    const vrmBoneName = MIXAMO_TO_VRM_HUMANOID[toCanonicalMixamoBoneName(mixamoRigName)];
    if (!vrmBoneName) continue;

    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
    const vrmNodeName = vrmNode?.name;
    if (!vrmNode || !vrmNodeName) {
      continue;
    }

    if (property === "quaternion") {
      const srcBoneObj = findMixamoRigObject(mixamoRoot, mixamoRigName);
      if (srcBoneObj) {
        srcBoneObj.getWorldQuaternion(restRotationInverse);
        restRotationInverse.invert();
        if (srcBoneObj.parent) {
          srcBoneObj.parent.getWorldQuaternion(parentRestWorldRotation);
        } else {
          parentRestWorldRotation.identity();
        }
      } else {
        restRotationInverse.identity();
        parentRestWorldRotation.identity();
      }

      const values = new Float32Array(track.values);
      for (let i = 0; i < values.length; i += 4) {
        _quatA.fromArray(values, i);
        _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        if (legacyVrm0) {
          applyLegacyVrm0QuaternionCoordinates(_quatA);
        }
        if (
          !legacyVrm0 &&
          compatibility.armCorrection === "mirrored-arm-rest-x" &&
          LEGACY_VRM0_ARM_ROLL_BONES.has(vrmBoneName)
        ) {
          applyLegacyVrm0QuaternionCoordinates(_quatA);
        }
        _quatA.toArray(values, i);
      }

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.quaternion`,
          track.times,
          values,
        ),
      );
    } else if (property === "position") {
      const values = new Float32Array(track.values);
      if (vrmBoneName === "hips") {
        const hipsPositionScale = getHipsPositionScale(vrm, mixamoRoot, vrmNode);
        const baseX = values[0] ?? 0;
        const baseY = values[1] ?? 0;
        const baseZ = values[2] ?? 0;
        for (let i = 0; i < values.length; i += 3) {
          const deltaX = (values[i] - baseX) * hipsPositionScale;
          const deltaY = (values[i + 1] - baseY) * hipsPositionScale;
          const deltaZ = (values[i + 2] - baseZ) * hipsPositionScale;
          values[i] =
            vrmNode.position.x +
            (legacyVrm0 ? -deltaX : deltaX);
          values[i + 1] = vrmNode.position.y + deltaY;
          values[i + 2] =
            vrmNode.position.z +
            (legacyVrm0 ? -deltaZ : deltaZ);
        }
      }
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.position`,
          track.times,
          values,
        ),
      );
    }
  }

  if (tracks.length === 0) {
    return null;
  }

  return new THREE.AnimationClip("vrmAnimation", clip.duration, tracks);
}

export async function loadMixamoFbxRoot(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
  const loader = new FBXLoader();
  return loader.loadAsync(url);
}
