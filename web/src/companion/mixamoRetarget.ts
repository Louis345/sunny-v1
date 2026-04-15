/**
 * Mixamo FBX → VRM humanoid clip retargeting (COMPANION-MOTOR).
 *
 * Uses the official @pixiv/three-vrm approach:
 * iterate the source clip's existing tracks, map each Mixamo bone to a VRM
 * humanoid bone via getNormalizedBoneNode, apply rest-rotation correction, and
 * emit new QuaternionKeyframeTrack / VectorKeyframeTrack entries.
 *
 * This is fundamentally different from SkeletonUtils.retargetClip:
 * - Works with VRM's normalized skeleton (not raw mesh bones)
 * - Handles rest-pose differences per-bone
 * - Scales hip position to match model height
 */

import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * Map from Mixamo bone name (colon-prefix canonical form) → VRM humanoid bone name.
 * Based on the official @pixiv/three-vrm Mixamo example.
 */
const MIXAMO_TO_VRM_HUMANOID: Record<string, VRMHumanBoneName> = {
  // Core
  "mixamorig:Hips": "hips",
  "mixamorig:Spine": "spine",
  "mixamorig:Spine1": "chest",
  "mixamorig:Spine2": "upperChest",
  "mixamorig:Neck": "neck",
  "mixamorig:Head": "head",
  // Left arm
  "mixamorig:LeftShoulder": "leftShoulder",
  "mixamorig:LeftArm": "leftUpperArm",
  "mixamorig:LeftForeArm": "leftLowerArm",
  "mixamorig:LeftHand": "leftHand",
  // Right arm
  "mixamorig:RightShoulder": "rightShoulder",
  "mixamorig:RightArm": "rightUpperArm",
  "mixamorig:RightForeArm": "rightLowerArm",
  "mixamorig:RightHand": "rightHand",
  // Left leg
  "mixamorig:LeftUpLeg": "leftUpperLeg",
  "mixamorig:LeftLeg": "leftLowerLeg",
  "mixamorig:LeftFoot": "leftFoot",
  "mixamorig:LeftToeBase": "leftToes",
  // Right leg
  "mixamorig:RightUpLeg": "rightUpperLeg",
  "mixamorig:RightLeg": "rightLowerLeg",
  "mixamorig:RightFoot": "rightFoot",
  "mixamorig:RightToeBase": "rightToes",
  // Eyes
  "mixamorig:LeftEye": "leftEye",
  "mixamorig:RightEye": "rightEye",
  // Left thumb
  "mixamorig:LeftHandThumb1": "leftThumbMetacarpal",
  "mixamorig:LeftHandThumb2": "leftThumbProximal",
  "mixamorig:LeftHandThumb3": "leftThumbDistal",
  // Right thumb
  "mixamorig:RightHandThumb1": "rightThumbMetacarpal",
  "mixamorig:RightHandThumb2": "rightThumbProximal",
  "mixamorig:RightHandThumb3": "rightThumbDistal",
  // Left index
  "mixamorig:LeftHandIndex1": "leftIndexProximal",
  "mixamorig:LeftHandIndex2": "leftIndexIntermediate",
  "mixamorig:LeftHandIndex3": "leftIndexDistal",
  // Right index
  "mixamorig:RightHandIndex1": "rightIndexProximal",
  "mixamorig:RightHandIndex2": "rightIndexIntermediate",
  "mixamorig:RightHandIndex3": "rightIndexDistal",
  // Left middle
  "mixamorig:LeftHandMiddle1": "leftMiddleProximal",
  "mixamorig:LeftHandMiddle2": "leftMiddleIntermediate",
  "mixamorig:LeftHandMiddle3": "leftMiddleDistal",
  // Right middle
  "mixamorig:RightHandMiddle1": "rightMiddleProximal",
  "mixamorig:RightHandMiddle2": "rightMiddleIntermediate",
  "mixamorig:RightHandMiddle3": "rightMiddleDistal",
  // Left ring
  "mixamorig:LeftHandRing1": "leftRingProximal",
  "mixamorig:LeftHandRing2": "leftRingIntermediate",
  "mixamorig:LeftHandRing3": "leftRingDistal",
  // Right ring
  "mixamorig:RightHandRing1": "rightRingProximal",
  "mixamorig:RightHandRing2": "rightRingIntermediate",
  "mixamorig:RightHandRing3": "rightRingDistal",
  // Left little
  "mixamorig:LeftHandPinky1": "leftLittleProximal",
  "mixamorig:LeftHandPinky2": "leftLittleIntermediate",
  "mixamorig:LeftHandPinky3": "leftLittleDistal",
  // Right little
  "mixamorig:RightHandPinky1": "rightLittleProximal",
  "mixamorig:RightHandPinky2": "rightLittleIntermediate",
  "mixamorig:RightHandPinky3": "rightLittleDistal",
};

/**
 * Normalise a Mixamo bone name to the canonical colon form so a single lookup
 * table covers all three export variants:
 *   "mixamorig:BoneName"  — standard Mixamo download
 *   "mixamorig_BoneName"  — some Blender re-exports
 *   "mixamorigBoneName"   — concatenated (no separator)
 */
function toCanonical(name: string): string {
  return name
    .replace(/^mixamorig_/, "mixamorig:")
    .replace(/^mixamorig([A-Z])/, "mixamorig:$1");
}

/**
 * Retarget the first clip from a Mixamo-style FBX rig onto a VRM model.
 *
 * Official @pixiv/three-vrm approach:
 * 1. Iterate source clip tracks.
 * 2. Map each Mixamo bone name → VRM humanoid bone name.
 * 3. Resolve the target node name via `vrm.humanoid.getNormalizedBoneNode`.
 * 4. Apply per-bone rest-rotation correction.
 * 5. Emit new typed KeyframeTrack instances.
 *
 * Returns null if retargeting yields zero usable tracks.
 */
export function retargetMixamoClipToVrm(
  clip: THREE.AnimationClip,
  mixamoRoot: THREE.Object3D,
  vrm: VRM,
): THREE.AnimationClip | null {
  const _vec3 = new THREE.Vector3();
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();

  if (!vrm.humanoid) {
    console.warn("🎮 [mixamoRetarget] VRM has no humanoid");
    return null;
  }

  // Compute hip-height scale so the character's step height matches the VRM.
  const hipsObj =
    mixamoRoot.getObjectByName("mixamorig:Hips") ??
    mixamoRoot.getObjectByName("mixamorig_Hips") ??
    mixamoRoot.getObjectByName("mixamorigHips");
  const vrmHipsNode = vrm.humanoid.getNormalizedBoneNode("hips");
  let hipsPositionScale = 1.0;
  if (hipsObj && vrmHipsNode) {
    const motionHipsHeight = hipsObj.position.y;
    const vrmHipsY = vrmHipsNode.getWorldPosition(_vec3).y;
    const vrmRootY = vrm.scene.getWorldPosition(new THREE.Vector3()).y;
    const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
    if (motionHipsHeight > 0) {
      hipsPositionScale = vrmHipsHeight / motionHipsHeight;
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  let missingBones = 0;

  if (clip.tracks.length > 0) {
    console.log(
      "🎮 [mixamoRetarget] clip track name sample:",
      clip.tracks.slice(0, 3).map((t) => t.name),
    );
  }

  for (const track of clip.tracks) {
    // Track name formats:
    //   "mixamorig:BoneName.quaternion"   — direct Mixamo export
    //   "Armature|mixamorig:BoneName.quaternion" — Blender/FBX with armature
    // Strip armature prefix (everything up to and including last "|") then normalise.
    const dotIdx = track.name.lastIndexOf(".");
    const rawBonePart = dotIdx >= 0 ? track.name.slice(0, dotIdx) : track.name;
    const pipeIdx = rawBonePart.lastIndexOf("|");
    const mixamoRigName = pipeIdx >= 0 ? rawBonePart.slice(pipeIdx + 1) : rawBonePart;
    const property = dotIdx >= 0 ? track.name.slice(dotIdx + 1) : "";

    const vrmBoneName = MIXAMO_TO_VRM_HUMANOID[toCanonical(mixamoRigName)];
    if (!vrmBoneName) continue;

    const vrmNodeName = vrm.humanoid.getNormalizedBoneNode(vrmBoneName)?.name;
    if (!vrmNodeName) {
      missingBones++;
      continue;
    }

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // Correct for the difference in rest-pose orientation between the Mixamo
      // rig and the VRM normalized skeleton.
      // getObjectByName uses the short name (without armature prefix)
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
      const scale = vrmBoneName === "hips" ? hipsPositionScale : 1.0;
      const values =
        scale !== 1.0
          ? new Float32Array(track.values.length)
          : new Float32Array(track.values);
      if (scale !== 1.0) {
        for (let i = 0; i < track.values.length; i++) {
          values[i] = track.values[i]! * scale;
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

  console.log(
    `🎮 [mixamoRetarget] retargeted ${tracks.length} tracks (${missingBones} bones missing from VRM)`,
  );

  if (tracks.length === 0) {
    console.warn(
      "🎮 [mixamoRetarget] 0 usable tracks — VRM has no normalized bones for this clip",
    );
    return null;
  }

  return new THREE.AnimationClip("vrmAnimation", clip.duration, tracks);
}

export async function loadMixamoFbxRoot(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
  const loader = new FBXLoader();
  return loader.loadAsync(url);
}
