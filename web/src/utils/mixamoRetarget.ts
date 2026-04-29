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
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
]);
const MIXAMO_CENTIMETERS_TO_VRM_METERS = 0.01;

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
  const flipLegacyArmRoll = isLegacyVrm0(vrm);

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
      const srcBoneObj = mixamoRoot.getObjectByName(mixamoRigName);
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
        if (flipLegacyArmRoll && LEGACY_VRM0_ARM_ROLL_BONES.has(vrmBoneName)) {
          _quatA.z *= -1;
          _quatA.normalize();
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
        const baseX = values[0] ?? 0;
        const baseY = values[1] ?? 0;
        const baseZ = values[2] ?? 0;
        for (let i = 0; i < values.length; i += 3) {
          values[i] =
            vrmNode.position.x +
            (values[i] - baseX) * MIXAMO_CENTIMETERS_TO_VRM_METERS;
          values[i + 1] =
            vrmNode.position.y +
            (values[i + 1] - baseY) * MIXAMO_CENTIMETERS_TO_VRM_METERS;
          values[i + 2] =
            vrmNode.position.z +
            (values[i + 2] - baseZ) * MIXAMO_CENTIMETERS_TO_VRM_METERS;
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
