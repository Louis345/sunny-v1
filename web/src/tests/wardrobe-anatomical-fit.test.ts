import {expect,it} from 'vitest';import * as THREE from 'three';
import {resolveXwearFitPose} from '../lib/xwearDress';
it('uses explicit anatomical garment anchors without moving the identity skeleton bind pose',()=>{
 const bind=new Map([['J_Bip_C_Hips',new THREE.Matrix4().makeTranslation(0,1.25,0)]]);
 const fit=resolveXwearFitPose(bind,{J_Bip_C_Hips:[0,1.12,.03]});
 expect(fit.get('J_Bip_C_Hips')!.elements.slice(12,15)).toEqual([0,1.12,.03]);
 expect(bind.get('J_Bip_C_Hips')!.elements.slice(12,15)).toEqual([0,1.25,0]);
});
import {retargetGarmentVerticesToAvatarBindPose} from '../lib/xwearDress';
it('separates garment length from cross-section size so tall rigs do not inflate collars and sleeves',()=>{
 const r=retargetGarmentVerticesToAvatarBindPose({positions:new Float32Array([1,1,1]),normals:new Float32Array([0,0,1]),boneIndices:[0,0,0,0],boneWeights:[1,0,0,0],sourceBindWorldMatrices:[new THREE.Matrix4()],targetBindWorldMatrices:[new THREE.Matrix4()],fitScale:2,crossSectionScale:1,boneNames:['J_Bip_C_Chest']});
 expect([...r.positions]).toEqual([1,2,1]);
});
import {conformXwearGarmentToBody} from '../lib/xwearDress';
it('moves intersecting garment surfaces outside the original body without changing body geometry',()=>{
 const scene=new THREE.Group(),material=new THREE.MeshBasicMaterial({name:'own skin'}),body=new THREE.Mesh(new THREE.BoxGeometry(.4,1,.4),material);body.geometry.computeBoundingBox();body.geometry.computeBoundingSphere();body.position.y=1;scene.add(body);scene.updateMatrixWorld(true);
 const original=[...body.geometry.attributes.position.array];
 const result=conformXwearGarmentToBody(new Float32Array([0,1,-.1,0,1,.1,0,1,-.3]),scene,['own skin']);
 expect(result[2]).toBeLessThan(-.2);expect(result[5]).toBeGreaterThan(.2);expect(result[8]).toBeCloseTo(-.3);expect([...body.geometry.attributes.position.array]).toEqual(original);
});
it('keeps garment body height continuous across different native bone spacings',()=>{
 const r=retargetGarmentVerticesToAvatarBindPose({positions:new Float32Array([0,0,0,0,0,0]),normals:new Float32Array([0,0,1,0,0,1]),boneIndices:[0,0,0,0,1,0,0,0],boneWeights:[1,0,0,0,1,0,0,0],sourceBindWorldMatrices:[new THREE.Matrix4(),new THREE.Matrix4().makeTranslation(0,.1,0)],targetBindWorldMatrices:[new THREE.Matrix4().makeTranslation(0,1,0),new THREE.Matrix4().makeTranslation(0,1.4,0)],boneNames:['J_Bip_C_Hips','J_Bip_L_UpperLeg'],bodyHeightMap:{sourceY:0,targetY:1,scale:2}});
 expect(r.positions[1]).toBe(1);expect(r.positions[4]).toBe(1);
});
it('keeps both garment layers on their nearest body side even when the body bounds are asymmetric',()=>{
 const scene=new THREE.Group(),material=new THREE.MeshBasicMaterial({name:'skin'});
 const torso=new THREE.Mesh(new THREE.BoxGeometry(.4,1,.4),material),remote=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),material);remote.position.set(3,3,4);scene.add(torso,remote);
 const result=conformXwearGarmentToBody(new Float32Array([0,0,.1,0,0,.3]),scene,['skin']);
 expect(result[2]).toBeGreaterThan(.2);expect(result[5]).toBeCloseTo(.3);
});
import {applyGarmentClearancePlanes} from '../lib/xwearDress';
it('fits the upper back below original hair without moving the garment front or hem',()=>{
 const p=new Float32Array([0,1.3,.1,0,1.3,-.1,0,1,.1]);const r=applyGarmentClearancePlanes(p,[{normal:[0,0,1],offset:.04,fromY:1.15,toY:1.25}]);
 expect(r[2]).toBeCloseTo(.04);expect(r[5]).toBeCloseTo(-.1);expect(r[8]).toBeCloseTo(.1);expect(p[2]).toBeCloseTo(.1);
});
it('restricts hair clearance to the selected hood vertices so sleeves remain intact',()=>{
 const p=new Float32Array([0,1.4,.1,.4,1.4,.1]);const r=applyGarmentClearancePlanes(p,[{vertices:[0],normal:[0,1,0],offset:1.3,fromY:1.2,toY:1.3}]);
 expect(r[1]).toBeCloseTo(1.3);expect(r[4]).toBeCloseTo(1.4);
});
import {addGarmentPocketLinings} from '../lib/xwearDress';
it('closes explicit garment pocket openings with the existing garment vertices and skin bindings',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-2,-2,-.1,2,-2,-.1,2,2,-.1,-2,2,-.1,-1,-1,-.1,1,-1,-.1,1,1,-.1,-1,1,-.1],3));g.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);g.computeVertexNormals();g.addGroup(0,24,0);const positions=g.attributes.position;
 addGarmentPocketLinings(g,{vertexCount:8,loops:[[4,5,6,7]]});expect(g.index!.count).toBe(30);expect(g.attributes.position).toBe(positions);expect(g.groups.at(-1)).toEqual({start:24,count:6,materialIndex:0});
 for(const [a,b]of [[4,5],[5,6],[6,7],[7,4]]){let count=0;for(let t=0;t<g.index!.count;t+=3){const tri=[g.index!.getX(t),g.index!.getX(t+1),g.index!.getX(t+2)];if(tri.includes(a)&&tri.includes(b))count++;}expect(count).toBe(2);}
 expect(()=>addGarmentPocketLinings(g,{vertexCount:8,loops:[[4,5,6,7]]})).toThrow(/boundary/);
});
import {setVrmBaseClothingVisible} from '../lib/xwearDress';
it('hides only explicitly covered trouser sections beneath a replacement top and restores them on removal',()=>{
 const scene=new THREE.Group();scene.userData.sunnyWardrobe=true;const waist=new THREE.MeshBasicMaterial(),legs=new THREE.MeshBasicMaterial();waist.userData={sunnyClothingCategory:'bottom',sunnyCoveredByOutfit:'comet-hoodie'};legs.userData={sunnyClothingCategory:'bottom'};scene.add(new THREE.Mesh(new THREE.BufferGeometry(),[waist,legs]));setVrmBaseClothingVisible(scene,false,['top'],'constellation-blazer');expect(waist.visible).toBe(true);setVrmBaseClothingVisible(scene,false,['top'],'comet-hoodie');expect(waist.visible).toBe(false);expect(legs.visible).toBe(true);setVrmBaseClothingVisible(scene,true);expect(waist.visible).toBe(true);
});
import {readFileSync} from 'node:fs';
import fittedAssets from '../lib/wardrobeFitted.generated.json';
import {getXwearOutfitDefinition} from '../lib/xwearDress';
it('seals every pocket edge on the real nonplanar hoodie without introducing interior holes',()=>{
 const ref=fittedAssets.find(r=>r.companionId==='kefla'&&r.outfitId==='comet-hoodie')!,data=JSON.parse(readFileSync(`../.sunny-sandbox/wardrobe/prepared/${ref.url.split('/').at(-1)}`,'utf8'));
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices.slice(0,data.groups.at(-1).start));g.computeVertexNormals();const recipe=getXwearOutfitDefinition('comet-hoodie')!.pocketLining!;
 addGarmentPocketLinings(g,recipe);
 for(const loop of recipe.loops){const vertices=new Set(loop),edges=new Map<string,number>();
  for(let t=0;t<g.index!.count;t+=3)for(let k=0;k<3;k++){const a=g.index!.getX(t+k),b=g.index!.getX(t+(k+1)%3);if(!vertices.has(a)||!vertices.has(b))continue;const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
  for(const [edge,count]of edges)expect(count,`pocket edge ${edge}`).toBe(2);
 }
});
it('keeps Towa dress side panels outside her own covered torso',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='towa')!,source=readVrm(readFileSync(`public${r.sourceUrl}`)),body=source.json.meshes[1].primitives[0];
 const record=(fittedAssets as any[]).find(r=>r.companionId==='towa'&&r.outfitId==='sleeveless-dress');
 const data=JSON.parse(readFileSync(`../.sunny-sandbox/wardrobe/prepared/${record.url.split('/').at(-1)}`,'utf8'));
 const skin=new THREE.BufferGeometry();skin.setAttribute('position',new THREE.Float32BufferAttribute(readAccessor(source,body.attributes.POSITION).flat(),3));skin.setIndex(readAccessor(source,body.indices).flat());
 const cloth=new THREE.BufferGeometry();cloth.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));cloth.setIndex(data.indices.filter((_:number,i:number)=>data.indices.slice(i-i%3,i-i%3+3).every((v:number)=>v<419)));
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes=[skin,cloth].map(g=>new THREE.Mesh(g,material));
 for(const sign of [-1,1])for(const [x,y]of [[.11,1.15],[.10,1.10]]){
  const ray=new THREE.Raycaster(new THREE.Vector3(sign*x,y,-2),new THREE.Vector3(0,0,1));
  const hits=meshes.map(m=>ray.intersectObject(m).map(h=>h.point.z));
  expect(hits[0].length,'native torso sample').toBeGreaterThan(0);expect(hits[1].length,'missing dress side coverage').toBeGreaterThan(0);
  expect(Math.min(...hits[1]),'front penetration').toBeLessThanOrEqual(Math.min(...hits[0])-.002);
  expect(Math.max(...hits[1]),'back penetration').toBeGreaterThanOrEqual(Math.max(...hits[0])+.002);
 }
 skin.dispose();cloth.dispose();material.dispose();
});

import {WARDROBE_RECIPES,readVrm} from '../../../scripts/prepareWardrobe';
import {readAccessor} from '../../wardrobeBodyPreparation';
