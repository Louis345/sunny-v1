import {readFileSync,writeFileSync} from 'node:fs';import {readVrm} from './prepareWardrobe';import {readAccessor} from '../web/wardrobeBodyPreparation';
const asset=readVrm(readFileSync('web/public/companions/673852811403133503.vrm'));
const results=[];
for(const [primitiveIndex,p] of asset.json.meshes[1].primitives.entries()){
 if(![9,14,16,17].includes(p.material))continue;
 const positions=readAccessor(asset,p.attributes.POSITION),indices=readAccessor(asset,p.indices).flat();
 const key=(v:number)=>positions[v].map(c=>c.toFixed(6)).join(',');const neighbors=new Map<string,Set<string>>();
 for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3).map(key);for(const v of tri){if(!neighbors.has(v))neighbors.set(v,new Set());for(const n of tri)neighbors.get(v)!.add(n);}}
 const components=new Map<string,number>();let next=0;
 for(const vertex of neighbors.keys()){
  if(components.has(vertex))continue;const stack=[vertex];components.set(vertex,next);
  for(let i=0;i<stack.length;i++){if(i>positions.length)throw new Error('Component traversal exceeded vertex count');for(const n of neighbors.get(stack[i])!)if(!components.has(n)){components.set(n,next);stack.push(n);}}
  next++;
 }
 const parts=Array.from({length:next},(_,id)=>{const triangles=[] as number[];for(let i=0;i<indices.length;i+=3)if(components.get(key(indices[i]))===id)triangles.push(i/3);const verts=new Set(triangles.flatMap(t=>indices.slice(t*3,t*3+3)));return{id,triangleCount:triangles.length,triangles,bounds:{min:[0,1,2].map(a=>Math.min(...[...verts].map(v=>positions[v][a]))),max:[0,1,2].map(a=>Math.max(...[...verts].map(v=>positions[v][a])))}};});
 results.push({material:p.material,primitiveIndex,parts});
}
writeFileSync('artifacts/wardrobe-certification/repair-resume/skirt-components.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({...r,parts:r.parts.map(({triangles,...p})=>p)})),null,2));
