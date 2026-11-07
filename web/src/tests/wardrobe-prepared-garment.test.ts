import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import bodies from '../lib/wardrobePrepared.generated.json';
import versions from '../lib/wardrobeAssetVersions.generated.json';
import {resolvePreparedGarment,bindPreparedGarment,loadPreparedGarment,type PreparedGarmentData,type PreparedGarmentReference} from '../lib/wardrobePreparedGarment';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import fitted from '../lib/wardrobeFitted.generated.json';
import {resolveLocalWardrobeAsset} from '../../wardrobeAssets';

const body=bodies[0];
const reference:PreparedGarmentReference={companionId:body.companionId,bodySha256:body.preparedSha256,outfitId:'sleeveless-dress',sourceVersion:versions['ribbon-dress'],url:'/__wardrobe-assets/prepared/elli-dress.json',sha256:'a'.repeat(64)};
const data=():PreparedGarmentData=>({schema:1,bodySha256:reference.bodySha256,outfitId:reference.outfitId,sourceVersion:reference.sourceVersion,positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,0,1],skinIndices:[0,0,0,0,0,0,0,0,0,0,0,0],skinWeights:[1,0,0,0,1,0,0,0,1,0,0,0],indices:[0,1,2],groups:[{start:0,count:3,materialIndex:0}],bones:[{name:'J_Bip_C_Hips',bindMatrix:new THREE.Matrix4().toArray()}],textures:['data:image/png;base64,fixture']});
const avatar=()=>{const scene=new THREE.Group(),bone=new THREE.Bone();bone.name='J_Bip_C_Hips';scene.add(bone);return {scene,bone};};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('requires an exact prepared body and garment version, with no fitting fallback for missing or stale data',()=>{
 expect(resolvePreparedGarment(body.modelUrl,'sleeveless-dress',[reference])).toEqual(reference);
 expect(()=>resolvePreparedGarment(body.modelUrl,'sleeveless-dress',[])).toThrow(/prepared garment unavailable/i);
 for(const changed of [{bodySha256:'changed'},{sourceVersion:'changed'}])expect(()=>resolvePreparedGarment(body.modelUrl,'sleeveless-dress',[{...reference,...changed}])).toThrow(/prepared garment unavailable/i);
 expect(resolvePreparedGarment('/companions/legacy.vrm','sleeveless-dress',[])).toBeNull();
 expect(()=>resolvePreparedGarment('/companions/elli-wardrobe-obsolete.vrm','sleeveless-dress',[])).toThrow(/unknown prepared body/i);
});

it('binds prepared coordinates without refitting, and follows the live rotated avatar',async()=>{
 const {scene,bone}=avatar();scene.rotation.y=Math.PI;scene.position.x=3;scene.updateMatrixWorld(true);
 vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(new THREE.Texture());
 const mesh=await bindPreparedGarment(scene,data(),reference,{id:'rose',tint:'#ff88aa'});
 expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(data().positions);
 expect(mesh.skeleton.bones).toEqual([bone]);
 mesh.skeleton.boneInverses[0].clone().invert().elements.forEach((n,i)=>expect(n).toBeCloseTo(scene.matrixWorld.elements[i],12));
 bone.position.x=.5;scene.updateMatrixWorld(true);mesh.skeleton.update();
 expect(mesh.applyBoneTransform(0,new THREE.Vector3()).x).toBeCloseTo(.5);
 expect((mesh.material as THREE.MeshBasicMaterial[])[0].color.getHexString()).toBe('ff88aa');
});

it.each(['body','joint','weights','geometry'])('rejects invalid %s before loading textures or attaching anything',async(problem)=>{
 const {scene}=avatar(),input=data();
 if(problem==='body')input.bodySha256='wrong';
 if(problem==='joint')input.bones[0].name='missing';
 if(problem==='weights')input.skinWeights[0]=0;
 if(problem==='geometry')input.positions[0]=NaN;
 const load=vi.spyOn(THREE.TextureLoader.prototype,'loadAsync');
 await expect(bindPreparedGarment(scene,input,reference)).rejects.toThrow();
 expect(scene.children).toHaveLength(1);expect(load).not.toHaveBeenCalled();
});

it('disposes successful texture loads when another texture fails',async()=>{
 const {scene}=avatar(),input=data();input.textures.push('data:image/png;base64,second');
 const texture=new THREE.Texture<HTMLImageElement>(),dispose=vi.spyOn(texture,'dispose');
 vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValueOnce(texture).mockRejectedValueOnce(new Error('bad texture'));
 await expect(bindPreparedGarment(scene,input,reference)).rejects.toThrow(/bad texture/);
 expect(dispose).toHaveBeenCalledTimes(1);expect(scene.children).toHaveLength(1);
});

it.each(['failed','corrupt'])('refuses a %s prepared download before revealing a mesh',async(mode)=>{
 const {scene}=avatar();vi.stubGlobal('crypto',webcrypto);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:mode==='failed'?503:200})));
 await expect(loadPreparedGarment(scene,reference)).rejects.toThrow(mode==='failed'?/load failed/:/fingerprint mismatch/);
 expect(scene.children).toHaveLength(1);
});

it.each(['empty','fractional','nonfinite','uncovered'])('rejects %s material groups before allocating textures',async(mode)=>{
 const {scene}=avatar(),input=data();
 if(mode==='empty')input.groups=[];
 if(mode==='fractional')input.groups[0].start=.5;
 if(mode==='nonfinite')input.groups[0].count=NaN;
 if(mode==='uncovered')input.groups[0].count=0;
 const load=vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(new THREE.Texture());
 await expect(bindPreparedGarment(scene,input,reference)).rejects.toThrow(/material groups/);
 expect(load).not.toHaveBeenCalled();expect(scene.children).toHaveLength(1);
});

it('has all eight native identities and their three real fits with matching fingerprints, explicit versions and distinct garment geometry',()=>{
 expect(bodies.map(b=>b.companionId).sort()).toEqual(['elli','kefla','matilda','melty','princess','tene','towa','yukari']);
 expect(fitted).toHaveLength(24);
 for(const body of bodies)expect(fitted.filter(f=>f.companionId===body.companionId).map(f=>f.outfitId).sort()).toEqual(['comet-hoodie','constellation-blazer','sleeveless-dress']);
 const counts=new Set<number>();
 for(const record of fitted){
  const body=bodies.find(b=>b.companionId===record.companionId)!;
  expect(resolvePreparedGarment(body.modelUrl,record.outfitId)).toEqual(record);
  const bytes=readFileSync(resolveLocalWardrobeAsset(record.url)!);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
  const input=JSON.parse(bytes.toString()) as PreparedGarmentData;
  expect(input.bodySha256).toBe(body.preparedSha256);expect(input.sourceVersion).toBe(record.sourceVersion);
  counts.add(input.positions.length/3);
  expect(input.positions.every(Number.isFinite)).toBe(true);
  for(let i=0;i<input.skinWeights.length;i+=4)expect(input.skinWeights.slice(i,i+4).reduce((a,b)=>a+b,0)).toBeCloseTo(1,5);
 }
 expect([...counts].sort((a,b)=>a-b)).toEqual([1754,4830,6282]);
});
