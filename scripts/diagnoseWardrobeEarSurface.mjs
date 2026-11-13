import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';
const bodies=JSON.parse(await readFile(new URL('../web/src/lib/wardrobePrepared.generated.json',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try{
 const page=await browser.newPage();await page.route('**/ear-surface.html',route=>route.fulfill({contentType:'text/html',body:'<title>Ear surface diagnostic</title>'}));await page.goto('http://127.0.0.1:5197/ear-surface.html');
 for(const body of bodies)results.push(await page.evaluate(async body=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');const {loadCompanionVrm}=await import('/src/utils/loadCompanionVrm.ts');
  const vrm=await loadCompanionVrm(body.modelUrl,{webgpu:false});vrm.scene.rotation.y=vrm.meta.metaVersion==='0'?Math.PI:0;vrm.scene.updateMatrixWorld(true);
  const hair=[];vrm.scene.traverse(o=>{o.skeleton?.update();if(o.isMesh)hair.push(o);});
  const head=vrm.humanoid.getRawBoneNode('head').getWorldPosition(new THREE.Vector3());const accessory=new THREE.Group();accessory.scale.setScalar(.7);accessory.rotation.y=Math.PI;
  const samples=[];
  for(const side of [-1,1]){
   const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.15,3));ear.position.set(side*.085,.175,0);ear.rotation.z=side*-.12;accessory.add(ear);accessory.updateMatrixWorld(true);
   const positions=ear.geometry.getAttribute('position');const seen=new Set();
   for(let i=0;i<positions.count;i++){
    if(Math.abs(positions.getY(i)+.075)>1e-6)continue;
    const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(ear.matrixWorld);const key=vertex.toArray().join(',');if(seen.has(key))continue;seen.add(key);
    const ray=new THREE.Raycaster(new THREE.Vector3(head.x+vertex.x,head.y+1,head.z+vertex.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(hair,false).find(hit=>{const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;return material.name?.includes('HAIR')&&!material.userData.sunnyIntrinsicAccessory;});
    if(!hit||hit.point.y<head.y+.12)throw new Error(`No scalp surface below ear base ${key}`);
    samples.push({vertex:vertex.toArray(),surfaceY:hit.point.y-head.y,translationY:hit.point.y-head.y-vertex.y});
   }
  }
  const minY=new THREE.Box3().setFromObject(accessory).min.y;
  return {companionId:body.companionId,bodySha256:body.preparedSha256,samples,baseY:Math.min(...samples.map(s=>s.translationY))+minY-.003};
 },body));
}finally{await browser.close();}
await writeFile(new URL('../artifacts/wardrobe-certification/repair-resume/ear-surface.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
