import * as THREE from 'three';
import bodies from './wardrobePrepared.generated.json';
import versions from './wardrobeAssetVersions.generated.json';
import fitted from './wardrobeFitted.generated.json';

export type PreparedGarmentReference={companionId:string;bodySha256:string;outfitId:string;sourceVersion:string;url:string;sha256:string};
export type PreparedGarmentData={schema:1;bodySha256:string;outfitId:string;sourceVersion:string;positions:number[];normals:number[];uv:number[];skinIndices:number[];skinWeights:number[];indices:number[];groups:{start:number;count:number;materialIndex:number}[];bones:{name:string;bindMatrix:number[]}[];textures:string[]};

export function resolvePreparedGarment(modelUrl:string,outfitId:string,records:readonly PreparedGarmentReference[]=fitted){
 const body=bodies.find(b=>b.modelUrl===modelUrl);
 if(!body){if(modelUrl.includes('-wardrobe-'))throw new Error(`Unknown prepared body ${modelUrl}`);return null;}
 const key=outfitId==='sleeveless-dress'?'ribbon-dress':outfitId;
 const sourceVersion=versions[key as keyof typeof versions];
 const record=records.find(r=>r.companionId===body.companionId&&r.outfitId===outfitId&&r.bodySha256===body.preparedSha256&&r.sourceVersion===sourceVersion);
 if(!record)throw new Error(`Prepared garment unavailable: ${body.companionId}/${outfitId}; rerun garment preparation`);
 return record;
}

export async function loadPreparedGarment(scene:THREE.Object3D,reference:PreparedGarmentReference,variant?:{id:string;tint:string}|null){
 const response=await fetch(reference.url);
 if(!response.ok)throw new Error(`Prepared garment load failed (${response.status}): ${reference.url}`);
 const bytes=await response.arrayBuffer();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==reference.sha256)throw new Error(`Prepared garment fingerprint mismatch: ${reference.url}`);
 return bindPreparedGarment(scene,JSON.parse(new TextDecoder().decode(bytes)) as PreparedGarmentData,reference,variant);
}

export async function bindPreparedGarment(scene:THREE.Object3D,data:PreparedGarmentData,reference:PreparedGarmentReference,variant?:{id:string;tint:string}|null){
 if(data.schema!==1||data.bodySha256!==reference.bodySha256||data.outfitId!==reference.outfitId||data.sourceVersion!==reference.sourceVersion)throw new Error('Prepared garment identity/version mismatch');
 const count=data.positions.length/3;
 const vectors=[data.positions,data.normals,data.uv,data.skinIndices,data.skinWeights,data.indices,...data.bones.map(b=>b.bindMatrix)];
 if(!Number.isInteger(count)||count<3||data.normals.length!==count*3||data.uv.length!==count*2||data.skinIndices.length!==count*4||data.skinWeights.length!==count*4||vectors.some(v=>v.some(n=>!Number.isFinite(n)))||data.bones.some(b=>b.bindMatrix.length!==16)||data.indices.length%3!==0||data.indices.some(n=>!Number.isInteger(n)||n<0||n>=count))throw new Error('Invalid prepared garment geometry');
 for(let vertex=0;vertex<count;vertex++){
  let sum=0;
  for(let i=0;i<4;i++){const j=vertex*4+i,index=data.skinIndices[j],weight=data.skinWeights[j];if(!Number.isInteger(index)||index<0||index>=data.bones.length||weight<0)throw new Error('Invalid prepared garment skin influence');sum+=weight;}
  if(Math.abs(sum-1)>1e-5)throw new Error('Invalid prepared garment weight sum');
 }
 let covered=0;
 const validGroups=data.groups.length>0&&data.groups.every(g=>{
  const valid=Number.isInteger(g.start)&&Number.isInteger(g.count)&&g.start===covered&&g.count>0&&g.count%3===0&&Number.isInteger(g.materialIndex)&&g.materialIndex>=0&&g.materialIndex<data.textures.length;
  covered+=g.count;return valid;
 });
 if(!data.textures.length||data.textures.some(t=>!t.startsWith('data:image/png;base64,'))||!validGroups||covered!==data.indices.length)throw new Error('Invalid prepared garment material groups');
 const available=new Map<string,THREE.Bone>();scene.traverse(object=>{if(object instanceof THREE.Bone)available.set(object.name,object);});
 const bones=data.bones.map(b=>{const bone=available.get(b.name);if(!bone)throw new Error(`Prepared garment joint unavailable: ${b.name}`);return bone;});
 // allSettled ensures every successful texture is owned and disposed if a sibling fails.
 const results=await Promise.allSettled(data.textures.map(url=>new THREE.TextureLoader().loadAsync(url)));
 const textures=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),failure=results.find(r=>r.status==='rejected');
 if(failure?.status==='rejected'){textures.forEach(t=>t.dispose());throw failure.reason;}
 const geometry=new THREE.BufferGeometry();let materials:THREE.MeshBasicMaterial[]=[];let skeleton:THREE.Skeleton|undefined;
 try{
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(data.skinIndices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(data.skinWeights,4));geometry.setIndex(data.indices);
  for(const g of data.groups)geometry.addGroup(g.start,g.count,g.materialIndex);geometry.computeBoundingSphere();
  materials=textures.map(map=>{map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return new THREE.MeshBasicMaterial({map,alphaTest:.5,side:THREE.DoubleSide,color:variant?.tint??'#ffffff'});});
  scene.updateMatrixWorld(true);skeleton=new THREE.Skeleton(bones,data.bones.map(b=>scene.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(b.bindMatrix)).invert()));
  const mesh=new THREE.SkinnedMesh(geometry,materials);mesh.name=`sunny-wardrobe-downloaded-${reference.outfitId}`;mesh.frustumCulled=false;scene.add(mesh);scene.updateMatrixWorld(true);mesh.bind(skeleton,mesh.matrixWorld.clone());
  console.log(` 🎮 [wardrobe-prepared] attached companion=${reference.companionId} outfit=${reference.outfitId} sha256=${reference.sha256}`);
  return mesh;
 }catch(error){geometry.dispose();materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeleton?.dispose();throw error;}
}
