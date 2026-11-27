import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { revealUncoveredBaseClothing, setVrmBaseClothingVisible } from "../lib/xwearDress";

// 2026-11-14 (Saori's second try-on, human-caught): Kefla lost her boots in every dress, Tene in the blazer showed only
// underwear below, and Towa and Yukari lost their upper arms in the sleeveless dresses. VRoid bodies keep many clothes in
// one material (Kefla's boots, Tene's skirt with her top) and drop the skin under their own sleeves, so hiding a whole
// material hid things the new outfit never covers. Why logs missed it: hiding a material is not an error. Why the lab
// missed it: fixtures had one material per garment and full skin. Rule: her own clothing hides only where the new outfit
// actually covers it.

/** One body mesh: skin (group 0) and one merged clothing material (group 1) with a torso triangle and a boot triangle. */
function body() {
  const positions = new Float32Array([
    // skin
    -0.1, 1.0, 0, 0.1, 1.0, 0, 0, 1.2, 0,
    // clothing: torso (y ≈ 1.2)
    -0.1, 1.15, 0.01, 0.1, 1.15, 0.01, 0, 1.25, 0.01,
    // clothing: boot (y ≈ 0.05)
    -0.05, 0.0, 0.02, 0.05, 0.0, 0.02, 0, 0.1, 0.02,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 6, 1);
  const skin = new THREE.MeshBasicMaterial({ name: "N00_000_00_Body_00_SKIN (Instance)" });
  const clothing = new THREE.MeshBasicMaterial({ name: "N00_007_01_Onepiece_01_CLOTH_01 (Instance)" });
  const mesh = new THREE.Mesh(geometry, [skin, clothing]);
  const scene = new THREE.Group();
  scene.add(mesh);
  return { scene, mesh, clothing };
}

/**
 * A dress that wraps the torso all the way round (a real garment is a dense mesh about 2 cm off her clothes), with a
 * ribbon tail hanging behind her down to the floor, as the ribbon dresses have.
 */
function torsoDress() {
  const points: number[] = [];
  for (let y = 1.1; y <= 1.3; y += 0.02) {
    for (let k = 0; k < 48; k++) {
      const angle = (k / 48) * Math.PI * 2;
      points.push(Math.sin(angle) * 0.03, y, Math.cos(angle) * 0.03);
    }
  }
  for (let y = 0; y <= 1.1; y += 0.01) points.push(0, y, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
}

/** Triangles drawn with a visible material whose name is the clothing's. */
function drawnClothingTriangles(mesh: THREE.Mesh) {
  const materials = mesh.material as THREE.Material[];
  return mesh.geometry.groups
    .filter((group) => materials[group.materialIndex!].visible && materials[group.materialIndex!].name.includes("CLOTH"))
    .reduce((sum, group) => sum + group.count / 3, 0);
}

describe("her own clothes under a new outfit", () => {
  it("stay where the outfit does not wrap round her (boots, even with a ribbon hanging behind them) and hide where it does", () => {
    const { scene, mesh } = body();
    const dress = torsoDress();
    scene.add(dress);
    scene.updateMatrixWorld(true);
    setVrmBaseClothingVisible(scene, false, ["top", "bottom", "onepiece"]);
    expect(drawnClothingTriangles(mesh)).toBe(0);
    revealUncoveredBaseClothing(scene, [dress]);
    expect(drawnClothingTriangles(mesh)).toBe(1);
    const materials = mesh.material as THREE.Material[];
    const drawn = mesh.geometry.groups.find((group) => materials[group.materialIndex!].visible && materials[group.materialIndex!].name.includes("CLOTH"))!;
    const index = mesh.geometry.index!;
    const position = mesh.geometry.getAttribute("position");
    expect(position.getY(index.getX(drawn.start))).toBeLessThan(0.2);
  });

  it("returns exactly to her own outfit when the new outfit comes off", () => {
    const { scene, mesh, clothing } = body();
    const originalIndex = Array.from(mesh.geometry.index!.array);
    const originalGroups = mesh.geometry.groups.map((group) => ({ ...group }));
    const dress = torsoDress();
    scene.add(dress);
    scene.updateMatrixWorld(true);
    setVrmBaseClothingVisible(scene, false, ["top", "bottom", "onepiece"]);
    revealUncoveredBaseClothing(scene, [dress]);
    setVrmBaseClothingVisible(scene, true);
    expect(Array.from(mesh.geometry.index!.array)).toEqual(originalIndex);
    expect(mesh.geometry.groups).toEqual(originalGroups);
    expect(mesh.material).toHaveLength(2);
    expect(clothing.visible).toBe(true);
  });

  it("works on bodies where each garment is its own mesh with one material (Towa, Yukari, Melty)", () => {
    const { mesh } = body();
    const geometry = mesh.geometry.clone();
    geometry.clearGroups();
    geometry.setIndex([3, 4, 5, 6, 7, 8]);
    const clothing = new THREE.MeshBasicMaterial({ name: "N00_002_03_Tops_01_CLOTH_01 (Instance)" });
    const garment = new THREE.Mesh(geometry, clothing);
    const scene = new THREE.Group();
    const dress = torsoDress();
    scene.add(garment, dress);
    scene.updateMatrixWorld(true);
    setVrmBaseClothingVisible(scene, false, ["top", "bottom", "onepiece"]);
    revealUncoveredBaseClothing(scene, [dress]);
    expect(drawnClothingTriangles(garment)).toBe(1);
    setVrmBaseClothingVisible(scene, true);
    expect(garment.material).toBe(clothing);
    expect(garment.geometry.groups).toEqual([]);
    expect(clothing.visible).toBe(true);
  });

  it("ignores parts of the outfit its texture cuts away (a see-through underskirt to the floor)", () => {
    const { scene, mesh } = body();
    const dress = torsoDress();
    // A long underskirt wrapping her down to the floor, drawn with the see-through half of the texture (u > 0.5).
    const positions = Array.from(dress.geometry.getAttribute("position").array);
    const uvs: number[] = new Array((positions.length / 3) * 2).fill(0.25);
    for (let y = 0; y <= 1.1; y += 0.02) {
      for (let k = 0; k < 48; k++) {
        const angle = (k / 48) * Math.PI * 2;
        positions.push(Math.sin(angle) * 0.06, y, Math.cos(angle) * 0.06);
        uvs.push(0.75, 0.5);
      }
    }
    dress.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    dress.geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    const texels = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0]);
    const map = new THREE.DataTexture(texels, 2, 1);
    dress.material = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 });
    scene.add(dress);
    scene.updateMatrixWorld(true);
    setVrmBaseClothingVisible(scene, false, ["top", "bottom", "onepiece"]);
    revealUncoveredBaseClothing(scene, [dress]);
    expect(drawnClothingTriangles(mesh)).toBe(1);
  });
});
