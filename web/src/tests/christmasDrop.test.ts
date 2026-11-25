import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CHRISTMAS_2026, REWARD_CATALOG } from "../../../src/shared/rewardCatalog";
import { planCompanionLook } from "../lib/dressCompanion";
import { attachWardrobeAccessory, removeWardrobeAccessory } from "../lib/wardrobeAccessory";
import { resolvePreparedWardrobePresentation } from "../lib/wardrobeBodyProfiles";
import { WARDROBE_STORE_CATALOG, getCompatibleWardrobeItems, type WardrobeAccessoryId } from "../lib/wardrobeStore";

// Christmas drop 2026 (owner, 2026-11-25): no person approves each item; two automated checks do instead.
// S1 "it loads without crashing" and "it shows up on her head: drawn, visible, not invisible or floating", on every
// companion body. S6: what she wins follows her companion everywhere, through the same look plan as every room.

const christmas = REWARD_CATALOG.filter(item => item.season === CHRISTMAS_2026.id);
const storeItem = (id: string) => WARDROBE_STORE_CATALOG.find(item => item.id === id)!;
const accessories = christmas.filter(item => item.slot === "head").map(item => storeItem(item.wardrobeItemId!));
const garments = christmas.filter(item => item.slot === "body").map(item => storeItem(item.wardrobeItemId!));
const BODIES = ["elli", "matilda"].map(id => ({ id, modelUrl: resolvePreparedWardrobePresentation(id)!.bodyModelUrl }));

/** A head bone on a loaded model: root → neck → head, faced like a VRM 0 model. */
function head() {
  const root = new THREE.Group();
  const neck = new THREE.Bone(); neck.position.set(0, 1.3, 0); root.add(neck);
  const bone = new THREE.Bone(); bone.position.set(0, 0.074, 0); neck.add(bone);
  root.updateMatrixWorld(true);
  return bone;
}
const visibleMeshes = (object: THREE.Object3D) => {
  const meshes: THREE.Mesh[] = [];
  object.traverseVisible(child => { if (child instanceof THREE.Mesh) meshes.push(child); });
  return meshes;
};

describe("S1: every Christmas accessory loads and shows on every companion body", () => {
  it("every item in the set is in the closet catalog", () => {
    for (const item of christmas) expect(WARDROBE_STORE_CATALOG.map(row => row.id), item.id).toContain(item.wardrobeItemId);
  });

  for (const body of BODIES) {
    it.each(accessories.map(item => item.id))(`%s sits on ${body.id}'s head, drawn and head-sized`, (id) => {
      const item = storeItem(id);
      expect(item.asset.kind).toBe("accessory");
      const accessoryId = (item.asset as { accessoryId: Exclude<WardrobeAccessoryId, "none"> }).accessoryId;
      const bone = head();
      const worn = attachWardrobeAccessory(bone, accessoryId, body.modelUrl);
      worn.updateMatrixWorld(true);
      expect(worn.parent).toBe(bone);
      const meshes = visibleMeshes(worn);
      expect(meshes.length).toBeGreaterThan(0);
      for (const mesh of meshes) expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(0);
      const box = new THREE.Box3();
      for (const mesh of meshes) box.expandByObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const headAt = bone.getWorldPosition(new THREE.Vector3());
      // Head-sized: wider than a coin, narrower than her shoulders.
      expect(Math.max(size.x, size.z)).toBeGreaterThan(0.06);
      expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.45);
      // On her head, not floating away: the piece reaches down to within a head's height of the head bone.
      expect(box.min.y - headAt.y).toBeLessThan(0.3);
      expect(box.max.y - headAt.y).toBeGreaterThan(0.12);
      expect(Math.abs((box.min.x + box.max.x) / 2 - headAt.x)).toBeLessThan(0.08);
      removeWardrobeAccessory(worn);
    });

    it(`the closet offers the whole Christmas set on ${body.id}`, () => {
      const offered = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, body.modelUrl, body.id).map(item => item.id);
      for (const item of [...accessories, ...garments]) expect(offered, item.id).toContain(item.id);
    });
  }

  it("the snowflake tiara glows", () => {
    const tiara = attachWardrobeAccessory(head(), "snowflake-tiara", BODIES[0]!.modelUrl);
    const glowing = visibleMeshes(tiara).some(mesh => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      return material.emissiveIntensity >= 1 && material.emissive.getHex() !== 0;
    });
    expect(glowing).toBe(true);
  });

  it("the red and green garments are coloured versions of fitted clothes", () => {
    for (const item of garments) {
      expect(item.asset.kind).toBe("outfit");
      const tint = (item.asset as { materialVariant: { tint: string } }).materialVariant.tint;
      expect(tint).not.toBe("#ffffff");
    }
  });
});

describe("S6: a won Christmas item follows her companion into every room", () => {
  it("the companion card's look puts the hat and the dress on her", () => {
    const hat = accessories.find(item => item.id === "santa-hat")!;
    const dress = garments[0]!;
    const planned = planCompanionLook({ companionId: "elli", vrmUrl: "/companions/elli-default.vrm",
      wearing: { accessoryItemId: hat.id, outfitItemId: dress.id } });
    expect(planned.look.accessoryId).toBe("santa-hat");
    expect(planned.look.outfitId).not.toBe("none");
  });
});
