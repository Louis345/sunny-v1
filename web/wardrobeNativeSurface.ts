import * as THREE from 'three';
import {readAccessor} from './wardrobeBodyPreparation';
import type {GltfJson} from '../scripts/prepareWardrobe';
export type NativeSurfacePatch={mesh:number;material:number;axis:'x'|'y';uv:[number,number];sourceRing?:{primitive:number;vertices:number[];uvVertices?:number[];uvU?:number;uvV?:number;center:[number,number,number];radius:number};rings:{center:[number,number,number];radius:number;bone:string;uvV?:number;sourceVertices?:number[];weights?:{bone:string;weight:number}[]}[]};
// Reconstruct only explicitly selected covered sections against the character's own
// measured limb boundaries. No other character or external geometry is read.
export function appendNativeSurfacePatches(asset:{json:GltfJson;binary:Buffer},patches:NativeSurfacePatch[]){
 const {json}=asset,chunks=[asset.binary.subarray(8)];let length=chunks[0].length;
 const append=(values:number[],type:string,size:number,componentType=5126)=>{
  const bytes=Buffer.from((componentType===5126?new Float32Array(values):componentType===5123?new Uint16Array(values):new Uint32Array(values)).buffer),pad=(4-length%4)%4;chunks.push(Buffer.alloc(pad));length+=pad;
  const view=json.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length})-1;chunks.push(bytes);length+=bytes.length;
  const a:GltfJson={bufferView:view,componentType,type,count:values.length/size};
  if(type==='VEC3'){a.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}
  return json.accessors.push(a)-1;
 };
 const remappedUvs=new Map<GltfJson,number[][]>();
 for(const patch of patches){
  const finiteVector=(v:number[],length:number)=>v.length===length&&v.every(Number.isFinite);
  const validRadius=(radius:number)=>Number.isFinite(radius)&&radius>0;
  if(!finiteVector(patch.uv,2)||patch.rings.length<2||patch.rings.length>10||patch.rings.some(r=>!validRadius(r.radius)||!finiteVector(r.center,3)||(r.uvV!==undefined&&!Number.isFinite(r.uvV))))throw new Error('Invalid native surface ring recipe');
  if(patch.sourceRing&&(!validRadius(patch.sourceRing.radius)||!finiteVector(patch.sourceRing.center,3)||(patch.sourceRing.uvV!==undefined&&!Number.isFinite(patch.sourceRing.uvV))||(patch.sourceRing.uvU!==undefined&&!Number.isFinite(patch.sourceRing.uvU))))throw new Error('Invalid native source ring');
  const node=json.nodes.find((n:GltfJson)=>n.mesh===patch.mesh),skin=json.skins[node.skin];
  const names=skin.joints.map((n:number)=>json.nodes[n].name),pos:number[]=[],norm:number[]=[],uv:number[]=[],joints:number[]=[],weights:number[]=[],indices:number[]=[];
  const source=patch.sourceRing;
  const sourcePrimitive=source?json.meshes[patch.mesh].primitives[source.primitive]:null;
  const sourcePositions=sourcePrimitive?readAccessor(asset,sourcePrimitive.attributes.POSITION):null;
  const sourceUvs=sourcePrimitive?(remappedUvs.get(sourcePrimitive)??readAccessor(asset,sourcePrimitive.attributes.TEXCOORD_0)):null;
  const sourceJoints=sourcePrimitive?readAccessor(asset,sourcePrimitive.attributes.JOINTS_0):null,sourceWeights=sourcePrimitive?readAccessor(asset,sourcePrimitive.attributes.WEIGHTS_0):null;
  if(source&&(source.vertices.length<3||source.vertices.length>64||new Set(source.vertices).size!==source.vertices.length||source.vertices.some(v=>!Number.isInteger(v)||v<0||v>=sourcePositions!.length)))throw new Error('Invalid native source vertices');
  if(source&&(source.uvV!==undefined||source.uvU!==undefined)){
   const selected=source.uvVertices??source.vertices;
   if(selected.length>64||selected.some(v=>!Number.isInteger(v)||v<0||v>=sourceUvs!.length))throw new Error('Invalid native UV selection');
   for(const vertex of selected){if(source.uvV!==undefined)sourceUvs![vertex][1]=source.uvV;if(source.uvU!==undefined)sourceUvs![vertex][0]=source.uvU;}
   remappedUvs.set(sourcePrimitive!,sourceUvs!);
  }
  const segments=source?.vertices.length??16;
  for(const ring of patch.rings){
   const influences=ring.weights??[{bone:ring.bone,weight:1}];
   const bindings=influences.map(influence=>({joint:names.indexOf(influence.bone),weight:influence.weight}));
   if(bindings.length>4||bindings.some(b=>b.joint<0||!(b.weight>0))||Math.abs(bindings.reduce((sum,b)=>sum+b.weight,0)-1)>1e-6)throw new Error('Invalid native ring skin weights');
   if(ring.sourceVertices&&(!source||ring.sourceVertices.length!==segments||ring.sourceVertices.some(v=>!Number.isInteger(v)||v<0||v>=sourcePositions!.length)))throw new Error('Invalid native ring boundary');
   for(let k=0;k<segments;k++){
    const exactVertex=ring.sourceVertices?.[k];
    const angle=k/segments*Math.PI*2;
    const normal=patch.axis==='x'?new THREE.Vector3(0,Math.cos(angle),Math.sin(angle)):new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const offset=source?new THREE.Vector3().fromArray(sourcePositions![source.vertices[k]]).sub(new THREE.Vector3(...source.center)).multiplyScalar(ring.radius/source.radius):normal.clone().multiplyScalar(ring.radius);
    pos.push(...(exactVertex!==undefined?sourcePositions![exactVertex]:offset.add(new THREE.Vector3(...ring.center)).toArray()));
    norm.push(...normal.toArray());
    const tex=source?[...sourceUvs![exactVertex??source.vertices[k]]]:[...patch.uv];
    if(ring.uvV!==undefined)tex[1]=ring.uvV;
    uv.push(...tex);
    const endpoint=exactVertex??(source&&ring.radius===source.radius&&ring.center.every((n,i)=>Math.abs(n-source.center[i])<1e-8)?source.vertices[k]:undefined);
    if(endpoint!==undefined){joints.push(...sourceJoints![endpoint]);weights.push(...sourceWeights![endpoint]);}
    else{joints.push(...Array.from({length:4},(_,i)=>bindings[i]?.joint??0));weights.push(...Array.from({length:4},(_,i)=>bindings[i]?.weight??0));}
   }
  }
  for(let r=0;r<patch.rings.length-1;r++)for(let k=0;k<segments;k++){const a=r*segments+k,b=r*segments+(k+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);}
  // Source boundaries may be mirrored or ordered differently. Orient each face
  // away from its own ring center, then derive smooth normals from those faces.
  for(let t=0;t<indices.length;t+=3){
   const ids=indices.slice(t,t+3),vertices=ids.map(id=>new THREE.Vector3().fromArray(pos,id*3));
   const face=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
   const radial=new THREE.Vector3();ids.forEach((id,k)=>radial.add(vertices[k].clone().sub(new THREE.Vector3(...patch.rings[Math.floor(id/segments)].center))));
   if(face.dot(radial)<0)[indices[t+1],indices[t+2]]=[indices[t+2],indices[t+1]];
  }
  const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));surface.setIndex(indices);surface.computeVertexNormals();
  norm.splice(0,norm.length,...surface.getAttribute('normal').array);surface.dispose();
  const primitive:GltfJson={material:patch.material,attributes:{POSITION:append(pos,'VEC3',3),NORMAL:append(norm,'VEC3',3),TEXCOORD_0:append(uv,'VEC2',2),JOINTS_0:append(joints,'VEC4',4,5123),WEIGHTS_0:append(weights,'VEC4',4)},indices:append(indices,'SCALAR',1,5125)};
  // Existing expression indices apply to every primitive of a mesh. New covered
  // limb surfaces have zero facial deltas, leaving all original targets intact.
  const targetCount=json.meshes[patch.mesh].primitives[0].targets?.length??0;
  if(targetCount){const zero=append(pos.map(()=>0),'VEC3',3);primitive.targets=Array.from({length:targetCount},()=>({POSITION:zero}));}
  json.meshes[patch.mesh].primitives.push(primitive);
 }
 for(const [primitive,values] of remappedUvs)primitive.attributes.TEXCOORD_0=append(values.flat(),'VEC2',2);
 const payload=Buffer.concat(chunks);json.buffers[0].byteLength=payload.length;const header=Buffer.alloc(8);header.writeUInt32LE(payload.length,0);header.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,payload]);
}
