import {readFileSync,writeFileSync} from 'node:fs';
import {readVrm} from './prepareWardrobe';
import {readAccessor} from '../web/wardrobeBodyPreparation';
const donor=readVrm(readFileSync('web/public/companions/sample.vrm')),target=readVrm(readFileSync('web/public/companions/matilda-wardrobe-identity-preserved-v1.vrm'));
const primitive=target.json.meshes[1].primitives[0];
const pos=readAccessor(target,primitive.attributes.POSITION),norm=readAccessor(target,primitive.attributes.NORMAL),joints=readAccessor(target,primitive.attributes.JOINTS_0),weights=readAccessor(target,primitive.attributes.WEIGHTS_0),indices=readAccessor(target,primitive.indices).flat();
const original=readAccessor(donor,donor.json.meshes[0].primitives[0].attributes.POSITION);
const normlen=norm.map(v=>Math.hypot(...v));
const triangles=[];
for(let i=0;i<indices.length;i+=3){
 const v=indices.slice(i,i+3),p=v.map(n=>pos[n]);
 const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,k)=>x-b[k]));
 const edges=v.map((n,k)=>({length:distance(pos[n],pos[v[(k+1)%3]]),original:distance(original[n],original[v[(k+1)%3]])}));
 const ratio=Math.max(...edges.map(e=>e.length/Math.max(1e-8,e.original)));
 if(p.every(p=>p[1]>.9&&p[1]<1.4)&&p.some(p=>Math.abs(p[0])>.2))triangles.push({triangle:i/3,v,p,ratio,weights:v.map(n=>weights[n]),joints:v.map(n=>joints[n]),normals:v.map(n=>norm[n])});
}
triangles.sort((a,b)=>b.ratio-a.ratio);
const report={normalLength:{min:Math.min(...normlen),max:Math.max(...normlen)},largestShoulderStretch:triangles.slice(0,12)};
writeFileSync('artifacts/wardrobe-certification/repair-resume/geometry-diagnosis.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
