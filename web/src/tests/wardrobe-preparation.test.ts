import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { prepareWardrobeVrm, readVrm, WARDROBE_RECIPES } from "../../../scripts/prepareWardrobe";

describe("complete wardrobe identity preparation", () => {
  it.each(WARDROBE_RECIPES)("preserves $id identity and adds explicit clothing roles", (recipe) => {
    const bytes = readFileSync(`public${recipe.sourceUrl}`);
    const original = readVrm(bytes);
    original.json=JSON.parse(JSON.stringify(original.json));
    const result = prepareWardrobeVrm(bytes, {...recipe, clothingTriangles: undefined, nativeSurfacePatches: undefined, restoreOpaqueBodyMaterials: undefined});
    const prepared = readVrm(result.bytes);
    expect(prepared.binary.equals(original.binary)).toBe(true);
    for (const key of ['meshes', 'skins', 'nodes', 'textures', 'images', 'accessors', 'bufferViews', 'extensions']) {
      expect(prepared.json[key]).toEqual(original.json[key]);
    }
    expect(prepared.json.materials.map((material: { name: string }) => material.name)).toEqual(original.json.materials.map((material: { name: string }) => material.name));
    for (const [index, role] of Object.entries(recipe.clothingMaterials)) {
      expect(prepared.json.materials[Number(index)].extras.sunnyClothingCategory).toBe(role);
    }
    expect(result.manifest.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.preparedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(prepareWardrobeVrm(bytes, {...recipe, clothingTriangles: undefined, nativeSurfacePatches: undefined, restoreOpaqueBodyMaterials: undefined}).bytes.equals(result.bytes)).toBe(true);
  });
  it('rejects a stale material selection instead of guessing by name or weight', () => {
    const recipe = WARDROBE_RECIPES[0];
    const bytes = readFileSync(`public${recipe.sourceUrl}`);
    expect(() => prepareWardrobeVrm(bytes, {...recipe, expectedMaterials: ['wrong model']})).toThrow(/material inventory/);
  });
});

import * as THREE from 'three';
import { setVrmBaseClothingVisible } from '../lib/xwearDress';
import { resolvePreparedWardrobePresentation } from '../lib/wardrobeBodyProfiles';

it('routes migrated companions to their complete prepared identity without an overlay', () => {
  for (const id of ['elli', 'matilda']) {
    const presentation = resolvePreparedWardrobePresentation(id);
    expect(presentation?.bodyModelUrl).toBe(`/companions/${id}-wardrobe-${WARDROBE_RECIPES.find(r=>r.id===id)!.version}.vrm`);
    expect(presentation).not.toHaveProperty("identityModelUrl");
  }
  expect(resolvePreparedWardrobePresentation('matilda')?.bodyProfileId).toBe('vroid-slim-v1');
});

it('uses explicit prepared clothing roles, including ties, without hiding identity surfaces', () => {
  const scene = new THREE.Group();
  scene.userData.sunnyWardrobe = true;
  const tie = new THREE.MeshBasicMaterial({name:'opaque material'});
  tie.userData.sunnyClothingCategory = 'top';
  const identity = new THREE.MeshBasicMaterial({name:'Tops_identity_surface'});
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), [tie, identity]));
  setVrmBaseClothingVisible(scene, false, ['top']);
  expect(tie.visible).toBe(false);
  expect(identity.visible).toBe(true);
  setVrmBaseClothingVisible(scene, true);
  expect(tie.visible).toBe(true);
});

it('removes Matilda’s overlapping outer skirt panels with a replacement top while retaining her base skirt', () => {
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='matilda')!;
 const prepared=readVrm(prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe).bytes);
 const scene=new THREE.Group();scene.userData.sunnyWardrobe=true;
 const materials=prepared.json.materials.map((definition:any)=>{
  const material=new THREE.MeshBasicMaterial({name:definition.name});material.userData=definition.extras ?? {};return material;
 });
 scene.add(new THREE.Mesh(new THREE.BufferGeometry(),materials));
 setVrmBaseClothingVisible(scene,false,['top']);
 // Diagnostic material-ID render identifies material 16 intersecting the hoodie;
 // 16/17 are the outer layer, while 9/14 form the complete inner pleated skirt.
 for(const index of [16,17])expect(materials[index].visible).toBe(false);
 for(const index of [9,14,0,1,2,3,4,5,6,7])expect(materials[index].visible).toBe(true);
 setVrmBaseClothingVisible(scene,true);
 for(const material of materials)expect(material.visible).toBe(true);
});
