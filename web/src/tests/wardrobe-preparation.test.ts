import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { prepareWardrobeVrm, readVrm, WARDROBE_RECIPES } from "../../../scripts/prepareWardrobe";

describe("complete wardrobe identity preparation", () => {
  it.each(WARDROBE_RECIPES)("preserves $id identity and adds explicit clothing roles", (recipe) => {
    const bytes = readFileSync(`public${recipe.sourceUrl}`);
    const original = readVrm(bytes);
    const result = prepareWardrobeVrm(bytes, {...recipe, bodyRepair: undefined});
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
    expect(prepareWardrobeVrm(bytes, {...recipe, bodyRepair: undefined}).bytes.equals(result.bytes)).toBe(true);
  });
  it('rejects a stale material selection instead of guessing by name or weight', () => {
    const recipe = WARDROBE_RECIPES[0];
    const bytes = readFileSync(`public${recipe.sourceUrl}`);
    expect(() => prepareWardrobeVrm(bytes, {...recipe, expectedMaterials: ['wrong model']})).toThrow(/material inventory/);
  });
});

import * as THREE from 'three';
import { setVrmBaseClothingVisible } from '../lib/xwearDress';
import { resolveStandardizedWardrobePresentation } from '../lib/wardrobeBodyProfiles';

it('routes migrated companions to their complete prepared identity without an overlay', () => {
  for (const id of ['elli', 'matilda']) {
    const presentation = resolveStandardizedWardrobePresentation(id);
    expect(presentation?.bodyModelUrl).toBe(`/companions/${id}-wardrobe-identity-preserved-v1.vrm`);
    expect(presentation?.identityModelUrl).toBeUndefined();
  }
  expect(resolveStandardizedWardrobePresentation('matilda')?.bodyProfileId).toBe('vroid-slim-v1');
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

it('restores Matilda’s missing body surface from the approved body family without altering her face or rig', () => {
  const recipe = WARDROBE_RECIPES.find(recipe => recipe.id === 'matilda')!;
  const original = readVrm(readFileSync(`public${recipe.sourceUrl}`));
  const donor = readFileSync('public/companions/sample.vrm');
  const result = prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`), recipe, donor);
  const prepared = readVrm(result.bytes);
  const originalTriangles = original.json.accessors[original.json.meshes[1].primitives[0].indices].count;
  const preparedTriangles = prepared.json.accessors[prepared.json.meshes[1].primitives[0].indices].count;
  expect(preparedTriangles).toBeGreaterThan(originalTriangles);
  const bodyPosition = prepared.json.accessors[prepared.json.meshes[1].primitives[0].attributes.POSITION];
  expect(bodyPosition.max[1]).toBeGreaterThan(1.55); // Arbitrary donor head-bone axes must not flatten the scalp into the neck.
  expect(prepared.json.meshes[0]).toEqual(original.json.meshes[0]);
  expect(prepared.json.meshes[2]).toEqual(original.json.meshes[2]);
  expect(prepared.json.nodes).toEqual(original.json.nodes);
  expect(prepared.json.skins).toEqual(original.json.skins);
  expect(prepared.json.materials[8].alphaMode).toBe('OPAQUE');
});

it('rejects incomplete preparation when a required body donor is absent', () => {
  const recipe = WARDROBE_RECIPES.find(recipe => recipe.id === 'matilda')!;
  expect(() => prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe)).toThrow(/required body donor/i);
});
