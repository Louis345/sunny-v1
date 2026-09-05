import {readFileSync,writeFileSync} from 'node:fs';
import {readVrm} from './prepareWardrobe';import {readAccessor} from '../web/wardrobeBodyPreparation';
const d=readVrm(readFileSync('web/public/companions/sample.vrm')),t=readVrm(readFileSync('web/public/companions/673852811403133503.vrm'));
const p=d.json.meshes[0].primitives[0],skin=d.json.skins[d.json.nodes.find((n:any)=>n.mesh===0).skin];
const target=new Set(t.json.nodes.map((n:any)=>n.name)),indices=new Set(readAccessor(d,p.indices).flat()),joints=readAccessor(d,p.attributes.JOINTS_0),weights=readAccessor(d,p.attributes.WEIGHTS_0),byBone=new Map<number,number>();
for(const i of indices)for(let k=0;k<4;k++)if(weights[i][k]>0)byBone.set(joints[i][k],(byBone.get(joints[i][k])??0)+1);
const report=[...byBone].filter(([i])=>!target.has(d.json.nodes[skin.joints[i]].name)).map(([i,count])=>({name:d.json.nodes[skin.joints[i]].name,count,constraint:d.json.nodes[skin.joints[i]].extensions?.VRMC_node_constraint}));
writeFileSync('artifacts/wardrobe-certification/repair-resume/missing-body-joints.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
