import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{const page=await browser.newPage();await page.route('**/hair-clearance.html',r=>r.fulfill({contentType:'text/html',body:'<title>Hair clearance regression</title>'}));await page.goto('http://127.0.0.1:5197/hair-clearance.html');
 const results=[];for(const outfitId of ['sleeveless-dress','constellation-blazer','comet-hoodie'])for(const pose of ['arms-up','head-turn']){
 const result=await page.evaluate(async({pose,outfitId})=>{
  const T=await import('/node_modules/.vite/deps/three.js');const {loadCompanionVrm}=await import('/src/utils/loadCompanionVrm.ts');const {attachXwearOutfit,getXwearOutfitDefinition}=await import('/src/lib/xwearDress.ts');const {attachWardrobeHairCollisions}=await import('/src/lib/wardrobeHairCollision.ts');const {applyWardrobeInspection}=await import('/src/lib/wardrobeInspection.ts');
  const url='/companions/elli-wardrobe-identity-preserved-v1.vrm',vrm=await loadCompanionVrm(url,{webgpu:false}),cloth=await attachXwearOutfit(vrm.scene,getXwearOutfitDefinition(outfitId),undefined,url);attachWardrobeHairCollisions(vrm,outfitId);
  const camera=new T.PerspectiveCamera();for(let i=0;i<90;i++)applyWardrobeInspection(vrm,camera,{pose:'idle',view:'side',accessory:'none'},i/60);
  const hairTips=[];vrm.scene.traverse(node=>{if(/J_Sec_Hair4_(11|12)_end/.test(node.name)){const p=node.getWorldPosition(new T.Vector3());hairTips.push(p.toArray());}});
  for(let i=0;i<90;i++)applyWardrobeInspection(vrm,camera,{pose,view:'front',accessory:'none'},i/60);
  cloth.computeBoundingBox();cloth.computeBoundingSphere();const ray=new T.Raycaster(),points=[];let tested=0;
  vrm.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh||mesh===cloth)return;const g=mesh.geometry,joints=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight');if(!joints||!weights)return;
   for(let i=0;i<g.getAttribute('position').count;i++){
    let frontWeight=0;for(let k=0;k<4;k++)if(/J_Sec_Hair\d+_(11|12)/.test(mesh.skeleton.bones[joints.array[i*4+k]].name))frontWeight+=weights.array[i*4+k];if(frontWeight<.8)continue;
    const v=new T.Vector3().fromBufferAttribute(g.getAttribute('position'),i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);if(v.y<1.13||v.y>1.34)continue;
    ray.set(new T.Vector3(v.x,v.y,2),new T.Vector3(0,0,-1));const hit=ray.intersectObject(cloth,false)[0];if(!hit)continue;tested++;if(v.z<hit.point.z-.006)points.push({vertex:i,y:v.y,penetration:hit.point.z-v.z});
   }
  });return{outfitId,pose,hairTips,tested,intersections:points.length,worst:points.sort((a,b)=>b.penetration-a.penetration).slice(0,5)};
 },{pose,outfitId});results.push(result);console.log(result);
 }
 for(const result of results){assert.equal(result.hairTips.length,2);assert.ok(result.hairTips.every(p=>p[1]<1.22&&Math.abs(p[2])<.24),'Garment clearance must preserve hanging front hair rather than projecting it horizontally');assert.ok(result.tested>20,'Must exercise real front-hair vertices against the posed garment');assert.equal(result.intersections,0,'Front hair must not disappear inside the posed garment');
 }
}finally{await browser.close();}
