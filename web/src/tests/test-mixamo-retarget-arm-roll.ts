import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { retargetMixamoClipToVrm } from "../utils/mixamoRetarget";

describe("mixamoRetarget legacy VRM0 arm roll", () => {
  it("normalizes legacy VRM0 arm roll direction", () => {
    const sourceArm = new THREE.Bone();
    sourceArm.name = "mixamorigLeftArm";
    const root = new THREE.Group();
    root.add(sourceArm);
    root.updateMatrixWorld(true);

    const inputQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, 0.5, "XYZ"),
    );
    const clip = new THREE.AnimationClip("legacy-arm", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigLeftArm.quaternion",
        [0],
        [inputQuat.x, inputQuat.y, inputQuat.z, inputQuat.w],
      ),
    ]);
    const targetArm = new THREE.Bone();
    targetArm.name = "leftUpperArmNode";
    const vrm = {
      meta: { metaVersion: "0" },
      humanoid: {
        getNormalizedBoneNode: (name: string) =>
          name === "leftUpperArm" ? targetArm : null,
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);

    expect(result?.tracks).toHaveLength(1);
    expect(result?.tracks[0]?.values[2]).toBeLessThan(0);
  });
});
