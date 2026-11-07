import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {WARDROBE_RECIPES,prepareWardrobeVrm,readVrm} from '../../../scripts/prepareWardrobe';
import {resolvePreparedWardrobePresentation} from '../lib/wardrobeBodyProfiles';
import * as THREE from 'three';
import {captureXwearAvatarBindPose} from '../lib/xwearDress';
it('prepares Princess with her complete expression surfaces and native skeleton',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='princess');expect(recipe).toBeDefined();
 const bytes=readFileSync(`public${recipe!.sourceUrl}`),source=readVrm(bytes),output=readVrm(prepareWardrobeVrm(bytes,recipe!).bytes);
 for(const key of ['nodes','skins','textures','images'])expect(JSON.stringify(output.json[key])).toEqual(JSON.stringify(source.json[key]));
 for(const key of ['humanoid','blendShapeMaster','secondaryAnimation','firstPerson'])expect(output.json.extensions.VRM[key]).toEqual(source.json.extensions.VRM[key]);
 expect(JSON.stringify(output.json.extensions.VRM.materialProperties.slice(0,source.json.materials.length))).toEqual(JSON.stringify(source.json.extensions.VRM.materialProperties));
 for(const i of [0,2,3,4,5,6,7,8])expect(output.json.meshes[0].primitives[i]).toEqual(source.json.meshes[0].primitives[i]);
 expect(resolvePreparedWardrobePresentation('princess')).not.toHaveProperty("identityModelUrl");
 expect(resolvePreparedWardrobePresentation('princess')?.bodyModelUrl).toContain('princess-wardrobe-');
});
it('captures native skeleton bones through explicit humanoid aliases without renaming the rig',()=>{
 const scene=new THREE.Group(),hips=new THREE.Bone();hips.name='pelvis';hips.position.y=1;scene.add(hips);
 scene.userData.sunnyHumanoidBoneNames={J_Bip_C_Hips:'pelvis'};
 const bind=captureXwearAvatarBindPose(scene);expect(bind.get('J_Bip_C_Hips')?.elements[13]).toBe(1);expect(hips.name).toBe('pelvis');
});
it('fills Princess covered limb gaps from her own source geometry without a donor',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='princess')!;
 expect((recipe as any).bodyRepair).toBeUndefined();
 expect((recipe as any).nativeSurfacePatches?.length).toBe(4);
 const source=readFileSync(`public${recipe.sourceUrl}`),before=readVrm(source),after=readVrm(prepareWardrobeVrm(source,recipe).bytes);
 expect(after.json.meshes[0].primitives.length).toBeGreaterThan(before.json.meshes[0].primitives.length+2);
});
import {readAccessor} from '../../wardrobeBodyPreparation';
it('never classifies Princess head or neck identity triangles as clothing',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='princess')!,source=readVrm(readFileSync(`public${recipe.sourceUrl}`));
 const identity=new Set(source.json.extensions.VRM.humanoid.humanBones.filter((b:any)=>['head','neck'].includes(b.bone)).map((b:any)=>b.node));
 for(const choice of recipe.clothingTriangles??[]){const p=source.json.meshes[choice.mesh].primitives[choice.primitive],skin=source.json.skins[source.json.nodes.find((n:any)=>n.mesh===choice.mesh).skin];const indices=readAccessor(source,p.indices).flat(),joints=readAccessor(source,p.attributes.JOINTS_0),weights=readAccessor(source,p.attributes.WEIGHTS_0);
  for(const t of choice.triangles)expect(indices.slice(t*3,t*3+3).every(v=>weights[v].reduce((s,w,k)=>s+(identity.has(skin.joints[joints[v][k]])?w:0),0)>.99),`identity triangle ${t}`).toBe(false);
 }
});
it('fits Princess retained skirt below outerwear without changing identity attributes',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='princess')!,original=readVrm(readFileSync(`public${r.sourceUrl}`)),prepared=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 const bottom=prepared.json.meshes[0].primitives.find((p:any)=>prepared.json.materials[p.material].extras?.sunnyClothingCategory==='bottom');
 const positions=readAccessor(prepared,bottom.attributes.POSITION),indices=readAccessor(prepared,bottom.indices).flat();
 const upper=[...new Set(indices)].filter(v=>positions[v][1]>.95&&positions[v][1]<1.18);
 expect(Math.max(...upper.map(v=>Math.abs(positions[v][0])))).toBeLessThan(.25);
 expect(prepared.json.meshes[0].primitives[3]).toEqual(original.json.meshes[0].primitives[3]);
});
it('gives native limb patches outward winding and normals derived from their actual geometry',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='princess')!,output=readVrm(prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe).bytes);
 const primitives=output.json.meshes[0].primitives.slice(-4);
 primitives.forEach((primitive:any,p:number)=>{
  const positions=readAccessor(output,primitive.attributes.POSITION),normals=readAccessor(output,primitive.attributes.NORMAL),indices=readAccessor(output,primitive.indices).flat();
  const patch=recipe.nativeSurfacePatches![p],segments=patch.sourceRing!.vertices.length;
  for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),a=new THREE.Vector3(...positions[ids[0]]),b=new THREE.Vector3(...positions[ids[1]]),c=new THREE.Vector3(...positions[ids[2]]),face=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
   const radial=new THREE.Vector3();for(const id of ids)radial.add(new THREE.Vector3(...positions[id]).sub(new THREE.Vector3(...patch.rings[Math.floor(id/segments)].center)));
   expect(face.dot(radial),`patch ${p} triangle ${i/3} winding`).toBeGreaterThan(0);
   for(const id of ids)expect(face.dot(new THREE.Vector3(...normals[id])),`patch ${p} normal`).toBeGreaterThan(0);
  }
 });
});
it('prepares Yukari without removing her intrinsic cat ears or their physics',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='yukari');expect(recipe).toBeDefined();
 const source=readVrm(readFileSync(`public${recipe!.sourceUrl}`)),output=readVrm(prepareWardrobeVrm(readFileSync(`public${recipe!.sourceUrl}`),recipe!).bytes);
 expect((recipe as any).bodyRepair).toBeUndefined();expect(recipe!.clothingMaterials[11]).toBeUndefined();
 for(const key of ['nodes','skins','textures','images'])expect(JSON.stringify(output.json[key])).toBe(JSON.stringify(source.json[key]));
 for(const key of ['humanoid','blendShapeMaster','secondaryAnimation','firstPerson'])expect(output.json.extensions.VRM[key]).toEqual(source.json.extensions.VRM[key]);
 source.json.meshes.forEach((mesh:any,i:number)=>expect(output.json.meshes[i].primitives.slice(0,mesh.primitives.length)).toEqual(mesh.primitives));
 expect(resolvePreparedWardrobePresentation('yukari')).not.toHaveProperty("identityModelUrl");
});
it('restores Yukari own masked skin without borrowing or replacing geometry or textures',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='yukari')!,source=readVrm(readFileSync(`public${recipe.sourceUrl}`)),output=readVrm(prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe).bytes);
 expect(output.json.materials[8].alphaMode).toBe('OPAQUE');expect(output.json.extensions.VRM.materialProperties[8].floatProperties._BlendMode).toBe(0);
 expect(output.binary.subarray(8,source.binary.length).equals(source.binary.subarray(8))).toBe(true);source.json.meshes.forEach((mesh:any,i:number)=>expect(output.json.meshes[i].primitives.slice(0,mesh.primitives.length)).toEqual(mesh.primitives));expect(output.json.images).toEqual(source.json.images);
});
it('repairs both removed Yukari upper-arm sections using her own boundary rings and rig',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='yukari')!;expect(r.nativeSurfacePatches).toHaveLength(2);
 for(const patch of r.nativeSurfacePatches!){expect(patch.sourceRing?.vertices.length).toBe(12);expect(patch.rings.some(ring=>ring.bone.includes('UpperArm'))).toBe(true);expect(patch.rings.some(ring=>ring.bone.includes('LowerArm'))).toBe(true);}
});
it('keeps repaired Yukari endpoints coincident with the original forearm under elbow rotation',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='yukari')!,source=readVrm(readFileSync(`public${r.sourceUrl}`)),output=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 const sourcePrimitive=source.json.meshes[1].primitives[0],j=readAccessor(source,sourcePrimitive.attributes.JOINTS_0),w=readAccessor(source,sourcePrimitive.attributes.WEIGHTS_0);
 r.nativeSurfacePatches!.forEach((patch,i)=>{const primitive=output.json.meshes[1].primitives[source.json.meshes[1].primitives.length+i],actualJ=readAccessor(output,primitive.attributes.JOINTS_0),actualW=readAccessor(output,primitive.attributes.WEIGHTS_0),offset=(patch.rings.length-1)*patch.sourceRing!.vertices.length;
  patch.sourceRing!.vertices.forEach((v,k)=>{expect(actualJ[offset+k]).toEqual(j[v]);expect(actualW[offset+k]).toEqual(w[v]);});
 });
});
it.each(['kefla','melty','tene','towa','matilda'])('preserves %s native identity without an overlay or donor body',id=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id===id);expect(recipe).toBeDefined();expect((recipe as any).bodyRepair).toBeUndefined();
 const bytes=readFileSync(`public${recipe!.sourceUrl}`),source=readVrm(bytes),output=readVrm(prepareWardrobeVrm(bytes,recipe!).bytes);
 for(const key of ['nodes','skins','textures','images'])expect(JSON.stringify(output.json[key])).toBe(JSON.stringify(source.json[key]));
 for(const key of ['humanoid','blendShapeMaster','secondaryAnimation','firstPerson'])expect(output.json.extensions.VRM[key]).toEqual(source.json.extensions.VRM[key]);
 expect(output.binary.subarray(8,source.binary.length).equals(source.binary.subarray(8))).toBe(true);
 const face=source.json.meshes.findIndex((m:any)=>m.name.toLowerCase().includes('face'));if(face>=0)expect(output.json.meshes[face]).toEqual(source.json.meshes[face]);
 expect(resolvePreparedWardrobePresentation(id)).not.toHaveProperty("identityModelUrl");expect(resolvePreparedWardrobePresentation(id)?.bodyModelUrl).toContain(`${id}-wardrobe-`);
});
it('keeps Kefla tail geometry even though it shares the clothing material',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='kefla')!,a=readVrm(readFileSync(`public${r.sourceUrl}`)),p=a.json.meshes[1].primitives[2],skin=a.json.skins[a.json.nodes.find((n:any)=>n.mesh===1).skin];
 expect(r.clothingMaterials[5]).toBeUndefined();const idx=readAccessor(a,p.indices).flat(),j=readAccessor(a,p.attributes.JOINTS_0),w=readAccessor(a,p.attributes.WEIGHTS_0),removed=new Set(r.clothingTriangles!.flatMap(s=>s.triangles));let tailTriangles=0;
 for(let t=0;t<idx.length;t+=3)if(idx.slice(t,t+3).some(v=>j[v].some((joint,k)=>w[v][k]>.1&&a.json.nodes[skin.joints[joint]].name.includes('Tail')))){tailTriangles++;expect(removed.has(t/3)).toBe(false);}
 expect(tailTriangles).toBeGreaterThan(100);
});
it('fills Melty hidden shoulder gaps from her own upper-arm boundaries',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='melty')!;expect(r.nativeSurfacePatches).toHaveLength(2);
 const source=readVrm(readFileSync(`public${r.sourceUrl}`)),output=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 for(const [i,patch] of r.nativeSurfacePatches!.entries()){
  const primitive=output.json.meshes[1].primitives.slice(-r.nativeSurfacePatches!.length)[i],p=readAccessor(output,primitive.attributes.POSITION),j=readAccessor(output,primitive.attributes.JOINTS_0),w=readAccessor(output,primitive.attributes.WEIGHTS_0),original=source.json.meshes[1].primitives[0];
  const sp=readAccessor(source,original.attributes.POSITION),sj=readAccessor(source,original.attributes.JOINTS_0),sw=readAccessor(source,original.attributes.WEIGHTS_0),n=patch.sourceRing!.vertices.length;
  for(const [k,v] of patch.sourceRing!.vertices.entries()){const end=p.length-n+k;expect(p[end]).toEqual(sp[v]);expect(j[end]).toEqual(sj[v]);expect(w[end]).toEqual(sw[v]);}
 }
});
it('keeps Melty skirt beneath outerwear and preserves her native limb decorations',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='melty')!;
 expect(r.clothingMaterials[14]).toBe('bottom');
 for(const i of [17,18,19])expect(r.clothingMaterials[i]).toBeUndefined();
 expect(r.clothingTriangles?.some(s=>s.primitive===4&&s.category==='bottom'&&s.triangles.length>100)).toBe(true);
});
it('binds every garment collider and hair selection to existing native nodes',()=>{
 for(const r of WARDROBE_RECIPES){const a=readVrm(readFileSync(`public${r.sourceUrl}`)),names=new Set(a.json.nodes.map((n:any)=>n.name));
  for(const root of r.wardrobeHairRoots??[])expect(names.has(root),`${r.id} hair ${root}`).toBe(true);
  for(const [outfit,colliders]of Object.entries(r.garmentColliders??{}))for(const c of colliders)expect(names.has(c.bone),`${r.id}/${outfit} collider ${c.bone}`).toBe(true);
 }
});
it('fits Melty upper skirt inside the hoodie hem while retaining her native skirt surfaces',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='melty')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);let checked=0;
 for(const p of a.json.meshes[1].primitives)if(a.json.materials[p.material].extras?.sunnyClothingCategory==='bottom'){
  const positions=readAccessor(a,p.attributes.POSITION),indices=readAccessor(a,p.indices).flat();
  for(const v of new Set(indices))if(positions[v][1]>.83&&positions[v][1]<.93){expect(Math.abs(positions[v][0])).toBeLessThan(.155);checked++;}
 }expect(checked).toBeGreaterThan(40);
});
it('fits Tene retained skirt inside outerwear while keeping her original jewelry',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='tene')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);let checked=0;
 expect(r.clothingMaterials[11]).toBeUndefined();expect(r.clothingMaterials[15]).toBeUndefined();
 for(const p of a.json.meshes[1].primitives)if(a.json.materials[p.material].extras?.sunnyClothingCategory==='bottom'){
  const positions=readAccessor(a,p.attributes.POSITION);for(const v of new Set(readAccessor(a,p.indices).flat()))if(positions[v][1]>.75&&positions[v][1]<.95){expect(Math.abs(positions[v][0])).toBeLessThan(.175);checked++;}
 }expect(checked).toBeGreaterThan(40);
});
it('retains Tene complete native arm bracelets as well as her neck and wrist jewelry',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='tene')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 expect(a.json.accessors[a.json.meshes[1].primitives[4].indices].count).toBe(1803);
});
it('samples visible native skin for Towa repaired arms instead of the black sleeve mask',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='towa')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 for(const p of a.json.meshes[1].primitives.slice(-2))for(const uv of readAccessor(a,p.attributes.TEXCOORD_0))expect(uv[1]).toBeGreaterThan(.27);
});
it('keeps Towa original forearm seams outside the removed sleeve texture mask',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='towa')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 for(const patch of r.nativeSurfacePatches!){const p=a.json.meshes[patch.mesh].primitives[patch.sourceRing!.primitive],uv=readAccessor(a,p.attributes.TEXCOORD_0);for(const v of patch.sourceRing!.vertices)expect(uv[v][1]).toBeGreaterThan(.27);}
});
it('bridges both Matilda arm boundaries with her own positions and complete original skin weights',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='matilda')!;expect((r as any).bodyRepair).toBeUndefined();expect(r.nativeSurfacePatches).toHaveLength(2);
 const before=readVrm(readFileSync(`public${r.sourceUrl}`)),after=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 for(const [i,patch]of r.nativeSurfacePatches!.entries()){
  const src=before.json.meshes[patch.mesh].primitives[patch.sourceRing!.primitive],dst=after.json.meshes[patch.mesh].primitives.slice(-2)[i],n=patch.sourceRing!.vertices.length;
  for(const [ri,ring]of patch.rings.entries())if((ring as any).sourceVertices){for(const [k,v]of ((ring as any).sourceVertices as number[]).entries())for(const name of ['POSITION','TEXCOORD_0','JOINTS_0','WEIGHTS_0'])expect(readAccessor(after,dst.attributes[name])[ri*n+k]).toEqual(readAccessor(before,src.attributes[name])[v]);}
  expect(patch.rings.filter(ring=>(ring as any).sourceVertices)).toHaveLength(2);
 }
});
it('provides Matilda hoodie clearance for her front hair without attaching halo ornaments to clothing',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='matilda')!;
 expect(r.garmentClearancePlanes?.['comet-hoodie']?.some(plane=>plane.normal[1]===1&&plane.vertices?.length===410)).toBe(true);
 for(const root of ['J_Sec_Hair1_17','J_Sec_Hair1_18'])expect(r.wardrobeHairRoots??[]).not.toContain(root);
});
it.each(['source-radius','ring-radius','center','uv','source-uv','vertices'])('rejects malformed native patch %s before emitting corrupt geometry',field=>{
 const r=structuredClone(WARDROBE_RECIPES.find(r=>r.id==='matilda')!),patch=r.nativeSurfacePatches![0];
 if(field==='source-radius')patch.sourceRing!.radius=0;
 if(field==='ring-radius')patch.rings[1].radius=NaN;
 if(field==='center')patch.rings[1].center[0]=Infinity;
 if(field==='uv')patch.uv[0]=NaN;
 if(field==='source-uv')patch.sourceRing!.uvU=NaN;
 if(field==='vertices')patch.sourceRing!.vertices=[];
 expect(()=>prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r)).toThrow(/native/i);
});
it('uses exposed native skin UVs on Princess legs instead of the baked gown shadow',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='princess')!;
 for(const patch of recipe.nativeSurfacePatches!.filter(p=>p.axis==='y')){
  expect(patch.sourceRing?.uvV).toBe(.51);
  expect(patch.rings.every(r=>r.uvV===.51)).toBe(true);
 }
});
it('keeps Elli long hair on native springs with outerwear clearance',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='elli')!;
 expect(recipe.wardrobeHairRoots).toEqual(Array.from({length:8},(_,i)=>`J_Sec_Hair1_${String(i+5).padStart(2,'0')}`));
 for(const outfit of ['comet-hoodie','constellation-blazer'])expect(recipe.garmentColliders?.[outfit]?.length).toBeGreaterThan(1);
 expect(recipe.garmentClearancePlanes?.['comet-hoodie']?.length).toBe(2);
});
it('samples inside Princess native leg skin island without stretching its dark atlas border',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='princess')!,asset=readVrm(prepareWardrobeVrm(readFileSync(`public${recipe.sourceUrl}`),recipe).bytes);
 for(const i of [1,3]){
  const p=asset.json.meshes[0].primitives.slice(-4)[i];
  expect(readAccessor(asset,p.attributes.TEXCOORD_0).every(uv=>Math.abs(uv[0]-.39)<1e-6)).toBe(true);
 }
});
it('repairs the whole exposed Princess calf UV island without a boundary texture seam',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='princess')!,bytes=readFileSync(`public${r.sourceUrl}`),source=readVrm(bytes),prepared=readVrm(prepareWardrobeVrm(bytes,r).bytes);
 const p=source.json.meshes[0].primitives[1],positions=readAccessor(source,p.attributes.POSITION),uv=readAccessor(source,p.attributes.TEXCOORD_0),result=readAccessor(prepared,prepared.json.meshes[0].primitives[1].attributes.TEXCOORD_0);
 const selected=positions.flatMap((p,i)=>p[1]<.43&&uv[i][0]>.22&&uv[i][0]<.35&&uv[i][1]>.47&&uv[i][1]<.68?[i]:[]);
 expect(selected.length).toBeGreaterThan(20);
 for(const v of selected){expect(result[v][0]).toBeCloseTo(.39);expect(result[v][1]).toBeCloseTo(.51);}
});
it('keeps Princess retained skirt outside her native upper thighs under the blazer',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='princess')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes),primitives=a.json.meshes[0].primitives;
 const skirt=primitives.find((p:any)=>a.json.materials[p.material].extras?.sunnyClothingCategory==='bottom');
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes=[skirt,primitives.at(-3),primitives.at(-1)].map(p=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(readAccessor(a,p.attributes.POSITION).flat(),3));g.setIndex(readAccessor(a,p.indices).flat());return new THREE.Mesh(g,material);});
 for(const sign of [-1,1])for(const x of [.06,.10,.14,.16])for(const y of [1.04,1.06,1.08]){
  const ray=new THREE.Raycaster(new THREE.Vector3(sign*x,y,2),new THREE.Vector3(0,0,-1)),cloth=ray.intersectObject(meshes[0])[0],skin=ray.intersectObjects(meshes.slice(1))[0];
  expect(cloth,`skirt coverage ${sign*x}/${y}`).toBeDefined();expect(skin,`native thigh ${sign*x}/${y}`).toBeDefined();expect(cloth.point.z-skin.point.z,`skirt clearance ${sign*x}/${y}`).toBeGreaterThanOrEqual(.002);
 }
 for(const m of meshes)m.geometry.dispose();material.dispose();
});
