import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../web/node_modules/three/build/three.module.js';
import { unzipSync } from '../web/node_modules/three/examples/jsm/libs/fflate.module.js';
import { readVrm, type GltfJson } from '../scripts/prepareWardrobe';
import { readAccessor } from '../web/wardrobeBodyPreparation';
import { parseXwearMesh } from '../web/src/lib/xwearMesh';
import { resolveXwearArchiveFiles } from '../web/src/lib/xwearDress';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'artifacts/wardrobe-certification');mkdirSync(directory,{recursive:true});
const companions: Record<string,string>={elli:'sample',matilda:'673852811403133503',kefla:'Kefla',melty:'4573661938486170180',princess:'princess',tene:'1537416846714225126',towa:'7339187387832391139',yukari:'3852603318431396015'};
const report=Object.entries(companions).map(([id,file])=>{
 const bytes=readFileSync(path.join(root,'web/public/companions',`${file}.vrm`));const asset=readVrm(bytes);const j=asset.json;
 const human=j.extensions.VRM?.humanoid.humanBones ?? Object.entries(j.extensions.VRMC_vrm.humanoid.humanBones).map(([bone,value])=>({bone,...value as object}));
 const head=human.find((entry:GltfJson)=>entry.bone==='head').node;
 const heads=new Set<number>([head]);for(let pass=0;pass<10;pass++)for(const node of [...heads])for(const child of j.nodes[node].children??[])heads.add(child);
 const meshes=j.meshes.map((mesh:GltfJson,meshIndex:number)=>{
  const skin=j.skins[j.nodes.find((node:GltfJson)=>node.mesh===meshIndex).skin];
  return {name:mesh.name,primitives:mesh.primitives.map((p:GltfJson)=>{
   const indices=readAccessor(asset,p.indices).flat();const joints=readAccessor(asset,p.attributes.JOINTS_0);const weights=readAccessor(asset,p.attributes.WEIGHTS_0);
   let kept=0;for(let i=0;i<indices.length;i+=3){let sum=0;for(const vertex of indices.slice(i,i+3))for(let c=0;c<4;c++)if(heads.has(skin.joints[joints[vertex][c]]))sum+=weights[vertex][c];if(sum/3>=.9)kept++;}
   return {material:p.material,name:j.materials[p.material].name,triangles:indices.length/3,usedVertices:new Set(indices).size,morphTargets:p.targets?.length??0,headMaskTriangles:kept,headMaskReturnsFalse:kept===0||kept===indices.length/3};
  })};
 });
 return {id,file:`${file}.vrm`,sha256:createHash('sha256').update(bytes).digest('hex'),version:j.extensions.VRM?'0':'1',meshes,materials:j.materials,images:j.images,textures:j.textures,humanoid:human,skins:j.skins.map((s:GltfJson)=>({bones:s.joints.map((n:number)=>j.nodes[n].name),inverseBindMatrices:s.inverseBindMatrices})),expressions:j.extensions.VRM?.blendShapeMaster??j.extensions.VRMC_vrm.expressions,springBones:j.extensions.VRM?.secondaryAnimation??j.extensions.VRMC_springBone};
});
writeFileSync(path.join(directory,'asset-audit.json'),JSON.stringify(report,null,2)+'\n');
const archives:Record<string,string>={'ribbon-dress':'sleeveless-dress/sleeveless_dress_Free.xwear','comet-hoodie':'vroid-hoodie/sunny-hoodie-neutral.xwear','constellation-blazer':'vroid-blazer/sunny-blazer.xwear'};
const garments=Object.entries(archives).map(([id,file])=>{
 const bytes=readFileSync(path.join(root,'.sunny-sandbox/wardrobe',file));const files=resolveXwearArchiveFiles(unzipSync(bytes));const resource=JSON.parse(new TextDecoder().decode(files.resource));
 const mesh=parseXwearMesh(files.mesh.slice().buffer);const objects=new Map<string,GltfJson>();const pending=[resource.RootGameObject];
 for(let i=0;i<pending.length;i++){if(i>10000)throw new Error('Garment hierarchy exceeds 10000 nodes');const obj=pending[i];objects.set(obj.Guid,obj);pending.push(...obj.Children??[]);}
 const renderer=resource.Components.find((c:GltfJson)=>c.$type?.includes('XResourceSkinnedMeshRenderer'));
 const bones=renderer.Bones.map((b:GltfJson)=>({name:objects.get(b.BoneGuid)?.Name,index:b.Index,position:new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(mesh.bindPoses[b.Index]).invert()).toArray()}));
 return {id,file,sha256:createHash('sha256').update(bytes).digest('hex'),vertices:mesh.vertexCount,triangles:mesh.submeshes.map(s=>s.indices.length/3),bones,textures:[...files.textures.keys()]};
});
writeFileSync(path.join(directory,'garment-audit.json'),JSON.stringify(garments,null,2)+'\n');
console.log(JSON.stringify(garments.map(g=>({id:g.id,bones:g.bones.filter((b:GltfJson)=>['J_Bip_C_Hips','J_Bip_C_Neck','J_Bip_L_UpperArm'].includes(b.name))})),null,2));
