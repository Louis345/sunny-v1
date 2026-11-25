import * as THREE from "three";
import { applyPreparedAccessoryFit, applyReferenceAccessoryFit } from "./wardrobeAccessoryFit";
import type { WardrobeAccessoryId } from "./wardrobeStore";
import { buildChristmasAccessory, isChristmasAccessory } from "./christmasAccessories";

// Generated accessories on a companion's head bone. Shared by the closet, the board portrait and the 3D games'
// dress-up (owner, 2026-11-25: her look follows her companion everywhere), so it lives outside any one screen.

function createWardrobeAccessory(
  accessoryId: Exclude<WardrobeAccessoryId, "none">,
): THREE.Group {
  const accessory = new THREE.Group();
  accessory.name = `sunny-wardrobe-${accessoryId}`;
  if (isChristmasAccessory(accessoryId)) {
    buildChristmasAccessory(accessoryId, accessory);
    return accessory;
  }

  if (accessoryId === "crown") {
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffc83d,
      emissive: 0x8a4b00,
      emissiveIntensity: 0.22,
      metalness: 0.55,
      roughness: 0.3,
    });
    const jewel = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x5b21b6,
      emissiveIntensity: 0.5,
      roughness: 0.2,
    });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 10, 36), gold);
    band.rotation.x = Math.PI / 2;
    accessory.add(band);
    for (const [index, x] of [-0.07, 0, 0.07].entries()) {
      const point = new THREE.Mesh(
        new THREE.ConeGeometry(index === 1 ? 0.035 : 0.028, index === 1 ? 0.12 : 0.09, 5),
        gold,
      );
      point.position.set(x, index === 1 ? 0.055 : 0.04, 0);
      accessory.add(point);
    }
    const centerJewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.027), jewel);
    centerJewel.position.set(0, 0.035, -0.1);
    accessory.add(centerJewel);
  }

  if (accessoryId === "cat-ears") {
    const fur = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      roughness: 0.55,
    });
    const inner = new THREE.MeshStandardMaterial({
      color: 0xf9a8d4,
      emissive: 0x831843,
      emissiveIntensity: 0.12,
      roughness: 0.7,
    });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 3), fur);
      ear.position.set(side * 0.085, 0.175, 0);
      ear.rotation.z = side * -0.12;
      accessory.add(ear);
      const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.041, 0.1, 3), inner);
      earInner.position.set(side * 0.085, 0.17, -0.036);
      earInner.rotation.z = side * -0.12;
      accessory.add(earInner);
    }
  }

  if (accessoryId === "halo") {
    const glow = new THREE.MeshStandardMaterial({
      color: 0xfff1a8,
      emissive: 0xffc400,
      emissiveIntensity: 2.2,
      metalness: 0.1,
      roughness: 0.25,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 12, 48), glow);
    ring.rotation.x = Math.PI / 2;
    accessory.add(ring);
  }

  return accessory;
}

export function removeWardrobeAccessory(accessory: THREE.Object3D | null): void {
  if (!accessory) return;
  accessory.removeFromParent();
  accessory.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child instanceof THREE.SkinnedMesh) child.skeleton?.dispose();
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("map" in material && material.map instanceof THREE.Texture) {
        material.map.dispose();
      }
      material.dispose();
    }
  });
}

/** Which way she faces, level with the floor, from where her arms are (a person's left arm is on her left). */
export function characterForward(leftArm: THREE.Object3D, rightArm: THREE.Object3D): THREE.Vector3 {
  const left = leftArm.getWorldPosition(new THREE.Vector3());
  const right = rightArm.getWorldPosition(new THREE.Vector3());
  const forward = new THREE.Vector3().crossVectors(left.sub(right), new THREE.Vector3(0, 1, 0)).setY(0);
  return forward.lengthSq() > 1e-10 ? forward.normalize() : new THREE.Vector3(0, 0, -1);
}

export function attachWardrobeAccessory(
  head: THREE.Object3D,
  accessoryId: Exclude<WardrobeAccessoryId, "none">,
  modelUrl = "",
  /** Where her face points; accessories are made with their front toward -Z. */
  facing?: THREE.Vector3,
): THREE.Group {
  const accessory = createWardrobeAccessory(accessoryId);
  try {
    if(applyPreparedAccessoryFit(accessory,head,modelUrl,accessoryId)){
      head.add(accessory);
      return accessory;
    }
  } catch(error) {
    removeWardrobeAccessory(accessory);
    console.error(` 🎮 [wardrobe-accessory] attachment failed model=${modelUrl} accessory=${accessoryId}`,error);
    throw error;
  }
  // No prepared fit (Saori's try-on, 2026-11-14): wear Elli's fitted size and height, facing where her face points.
  const forward = facing ?? new THREE.Vector3(0, 0, -1);
  const facingRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-forward.x, -forward.z));
  applyReferenceAccessoryFit(accessory, head, accessoryId, facingRotation);
  head.add(accessory);
  console.log(
    ` 🎮 [companion-wardrobe-lab] accessory_preview applied accessory=${accessoryId} fit=elli-reference facing=${forward.x.toFixed(2)},${forward.z.toFixed(2)}`,
  );
  return accessory;
}
