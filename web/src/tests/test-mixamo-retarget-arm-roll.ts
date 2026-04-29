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

describe("mixamoRetarget root motion", () => {
  it("keeps hips position as rest pose plus scaled Mixamo root delta", () => {
    const sourceHips = new THREE.Bone();
    sourceHips.name = "mixamorigHips";
    const root = new THREE.Group();
    root.add(sourceHips);
    root.updateMatrixWorld(true);

    const clip = new THREE.AnimationClip("root-motion", 1, [
      new THREE.VectorKeyframeTrack(
        "mixamorigHips.position",
        [0, 1],
        [
          10, 100, -5,
          25, 90, 15,
        ],
      ),
    ]);
    const targetHips = new THREE.Bone();
    targetHips.name = "hipsNode";
    targetHips.position.set(0, 1, 0);
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (name: string) =>
          name === "hips" ? targetHips : null,
      },
    } as unknown as VRM;

    const result = retargetMixamoClipToVrm(clip, root, vrm);
    const hipsTrack = result?.tracks.find(
      (track) => track.name === "hipsNode.position",
    );

    expect(hipsTrack).toBeDefined();
    expect(Array.from(hipsTrack!.values)).toEqual([
      expect.closeTo(0),
      expect.closeTo(1),
      expect.closeTo(0),
      expect.closeTo(0.15),
      expect.closeTo(0.9),
      expect.closeTo(0.2),
    ]);
  });
});
