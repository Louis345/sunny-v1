import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { attachWardrobeAccessory, characterForward } from "../components/CompanionShowroom";

// 2026-11-14 (Saori's try-on, human-caught): on companions without a prepared fit the Royal Crown sat front-to-back
// (Melty, Tene, Towa), did not show on Princess, and the cat ears were too big and floating (Melty, Princess, Tene,
// Towa). The fallback placed every accessory with fixed world numbers: one facing, one height, one size. It now faces
// where her face points and is sized and placed from her own head.

/** A minimal rig: root (turned and scaled like a loaded model) → neck → head, with arms to tell left from right. */
function rig(opts: { turnY: number; scale: number; neckToHead: number }) {
  const root = new THREE.Group();
  root.rotation.y = opts.turnY;
  root.scale.setScalar(opts.scale);
  const neck = new THREE.Bone(); neck.position.set(0, 1.3, 0); root.add(neck);
  const head = new THREE.Bone(); head.position.set(0, opts.neckToHead, 0); neck.add(head);
  // Authored like a VRM 0 model: faces -Z, so her left arm is at -X.
  const left = new THREE.Bone(); left.position.set(-0.1, 1.25, 0); root.add(left);
  const right = new THREE.Bone(); right.position.set(0.1, 1.25, 0); root.add(right);
  root.updateMatrixWorld(true);
  return { root, head, left, right };
}

function jewelWorld(accessory: THREE.Object3D) {
  accessory.updateMatrixWorld(true);
  const jewel = accessory.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.OctahedronGeometry)!;
  return jewel.getWorldPosition(new THREE.Vector3());
}

describe("accessories on a companion with no prepared fit", () => {
  it("puts the crown's jewel on the side her face points to, however the model was turned", () => {
    for (const turnY of [0, Math.PI]) {
      const { head, left, right } = rig({ turnY, scale: 1, neckToHead: 0.074 });
      const forward = characterForward(left, right);
      const crown = attachWardrobeAccessory(head, "crown", "/companions/4573661938486170180.vrm", forward);
      const headPos = head.getWorldPosition(new THREE.Vector3());
      const towardJewel = jewelWorld(crown).sub(headPos).setY(0).normalize();
      expect(towardJewel.dot(forward)).toBeGreaterThan(0.9);
    }
  });

  it("sizes and lifts the accessory with her head size and the model's scale", () => {
    const small = rig({ turnY: Math.PI, scale: 1, neckToHead: 0.074 });
    const big = rig({ turnY: Math.PI, scale: 2, neckToHead: 0.095 });
    const a = attachWardrobeAccessory(small.head, "cat-ears", "/companions/princess.vrm", characterForward(small.left, small.right));
    const b = attachWardrobeAccessory(big.head, "cat-ears", "/companions/princess.vrm", characterForward(big.left, big.right));
    const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
    const lift = (o: THREE.Object3D, h: THREE.Object3D) => new THREE.Box3().setFromObject(o).min.y - h.getWorldPosition(new THREE.Vector3()).y;
    const expected = 2 * (0.095 / 0.074);
    expect(size(b) / size(a)).toBeCloseTo(expected, 1);
    expect(lift(b, big.head) / lift(a, small.head)).toBeCloseTo(expected, 1);
  });
});
