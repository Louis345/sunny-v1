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
    expect(presentation?.bodyModelUrl).toBe(`/companions/${id}-wardrobe-${WARDROBE_RECIPES.find(r=>r.id===id)!.version}.vrm`);
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

import {readAccessor} from '../../wardrobeBodyPreparation';
it('transfers donor aim/roll arm weights to moving arm joints instead of pinning them to the shoulder',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='matilda')!;
 const donorBytes=readFileSync('public/companions/sample.vrm'),donor=readVrm(donorBytes);
 const output=readVrm(prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe,donorBytes).bytes);
 const inputPrimitive=donor.json.meshes[0].primitives[0],outputPrimitive=output.json.meshes[1].primitives[0];
 const sourceSkin=donor.json.skins[donor.json.nodes.find((n:any)=>n.mesh===0).skin];
 const targetSkin=output.json.skins[output.json.nodes.find((n:any)=>n.mesh===1).skin];
 const sj=readAccessor(donor,inputPrimitive.attributes.JOINTS_0),sw=readAccessor(donor,inputPrimitive.attributes.WEIGHTS_0),tj=readAccessor(output,outputPrimitive.attributes.JOINTS_0),tw=readAccessor(output,outputPrimitive.attributes.WEIGHTS_0);
 const indices=new Set(readAccessor(donor,inputPrimitive.indices).flat());
 let inspected=0;
 for(const side of ['L','R']){
  const helper=sourceSkin.joints.findIndex((n:number)=>donor.json.nodes[n].name===`J_Roll_${side}_UpperArm`);
  const upperArm=targetSkin.joints.findIndex((n:number)=>output.json.nodes[n].name===`J_Bip_${side}_UpperArm`);
  for(const vertex of indices){
   const required=sw[vertex].reduce((sum,w,k)=>sum+(sj[vertex][k]===helper?w:0),0);
   if(required===0)continue;
   const actual=tw[vertex].reduce((sum,w,k)=>sum+(tj[vertex][k]===upperArm?w:0),0);
   expect(actual,`vertex ${vertex}, ${side} upper-arm helper`).toBeGreaterThanOrEqual(required-1e-5);
   inspected++;
  }
 }
 expect(inspected).toBe(338); // 169 affected vertices on each arm in the pinned donor.
});
it('preserves every donor body weight through all ten explicit helper mappings with repeatable output',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='matilda')!;
 const source=readFileSync(`public${recipe.sourceUrl}`),donorBytes=readFileSync('public/companions/sample.vrm'),donor=readVrm(donorBytes);
 const result=prepareWardrobeVrm(source,recipe,donorBytes),output=readVrm(result.bytes);
 expect(prepareWardrobeVrm(source,recipe,donorBytes).bytes.equals(result.bytes)).toBe(true);
 const input=donor.json.meshes[0].primitives[0],prepared=output.json.meshes[1].primitives[0];
 const sourceSkin=donor.json.skins[donor.json.nodes.find((n:any)=>n.mesh===0).skin];
 const targetSkin=output.json.skins[output.json.nodes.find((n:any)=>n.mesh===1).skin];
 const sj=readAccessor(donor,input.attributes.JOINTS_0),sw=readAccessor(donor,input.attributes.WEIGHTS_0),tj=readAccessor(output,prepared.attributes.JOINTS_0),tw=readAccessor(output,prepared.attributes.WEIGHTS_0);
 const helpers=new Set<string>();
 for(const vertex of new Set(readAccessor(donor,input.indices).flat())){
  const expected=new Map<string,number>(),actual=new Map<string,number>();
  const total=sw[vertex].reduce((a,b)=>a+b,0);
  for(let k=0;k<4;k++){
   const name=donor.json.nodes[sourceSkin.joints[sj[vertex][k]]].name as string,w=sw[vertex][k]/total;
   const match=/^J_(Aim|Roll)_([LR])_(Shoulder|UpperArm|Elbow|LowerArm|Hand)$/.exec(name);
   let destinations:[string,number][]=[[name,1]];
   if(match){
    helpers.add(name);const side=match[2],part=match[3];
    destinations=part==='Elbow'?[[`J_Bip_${side}_UpperArm`,.5],[`J_Bip_${side}_LowerArm`,.5]]:[[ `J_Bip_${side}_${part==='Shoulder'?'UpperArm':part}`,1]];
   }
   if(w>0)for(const [joint,factor] of destinations)expected.set(joint,(expected.get(joint)??0)+w*factor);
   if(tw[vertex][k]>0){const target=output.json.nodes[targetSkin.joints[tj[vertex][k]]].name;actual.set(target,(actual.get(target)??0)+tw[vertex][k]);}
  }
  expect(tw[vertex].reduce((a,b)=>a+b,0)).toBeCloseTo(1,5);
  for(const [joint,w] of expected)expect(actual.get(joint)??0,`${vertex}:${joint}`).toBeCloseTo(w,5);
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
 }
 expect(helpers.size).toBe(10);
 expect(output.json.extensions.VRM.blendShapeMaster).toEqual(readVrm(source).json.extensions.VRM.blendShapeMaster);
});
it.each([
 ['bad sum',[{joint:'J_Bip_L_UpperArm',weight:.5}],/sum to one/],
 ['missing joint',[{joint:'missing-joint',weight:1}],/Invalid body joint mapping/],
 ['unmapped active bone',[],/Unmapped active donor joint/],
 ['too many influences',['UpperArm','LowerArm','Hand','Shoulder','UpperLeg'].map(part=>({joint:`J_Bip_L_${part}`,weight:.2})),/needs \d+ skin influences/],
] as const)('rejects %s instead of silently dropping body weights',(_name,choices,message)=>{
 const original=WARDROBE_RECIPES.find(r=>r.id==='matilda')!;
 const recipe=structuredClone(original);recipe.bodyRepair!.jointMappings!['J_Roll_L_UpperArm']=[...choices];
 expect(()=>prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe,readFileSync('public/companions/sample.vrm'))).toThrow(message);
});
