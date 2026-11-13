import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const bodies=JSON.parse(await readFile(new URL('../web/src/lib/wardrobePrepared.generated.json',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try{
 for(const body of bodies){
  const page=await browser.newPage();
  await page.route('**/native-runtime.html',route=>route.fulfill({contentType:'text/html',body:'<title>Native rig verification</title>'}));
  await page.goto('http://127.0.0.1:5197/native-runtime.html');
  const pair=[];
  for(const modelUrl of [body.sourceUrl,body.modelUrl]){
   pair.push(await page.evaluate(async({modelUrl})=>{
    const {loadCompanionVrm}=await import('/src/utils/loadCompanionVrm.ts');
    const {applyWardrobeInspection}=await import('/src/lib/wardrobeInspection.ts');
    const T=await import('/node_modules/.vite/deps/three.js');
    const vrm=await loadCompanionVrm(modelUrl,{webgpu:false});vrm.scene.rotation.y=vrm.meta.metaVersion==='0'?Math.PI:0;
    const camera=new T.PerspectiveCamera(),point=id=>vrm.humanoid.getRawBoneNode(id).getWorldPosition(new T.Vector3());
    const poses={};
    for(const pose of ['idle','blink','speak','head-turn','arms-up','elbows-bent']){
     applyWardrobeInspection(vrm,camera,{view:'front',pose,accessory:'none'},0);
     const arms=['left','right'].map(side=>{const a=point(`${side}UpperArm`),b=point(`${side}LowerArm`),c=point(`${side}Hand`);return{angle:a.clone().sub(b).angleTo(c.clone().sub(b))*180/Math.PI,lengths:[a.distanceTo(b),b.distanceTo(c)],wrist:c.toArray()}});
     poses[pose]={arms,head:point('head').toArray(),expression:vrm.expressionManager?.getValue(pose==='blink'?'blink':'aa')??0};
    }
    return {modelUrl,poses,springs:vrm.springBoneManager?.joints.size??0};
   },{modelUrl}));
  }
  for(const sample of pair){
   for(let side=0;side<2;side++){
    const idle=sample.poses.idle.arms[side],bent=sample.poses['elbows-bent'].arms[side];
    assert.ok(idle.angle-bent.angle>40,`${body.companionId}: elbow must flex`);
    assert.ok(bent.wrist[2]-idle.wrist[2]>.08,`${body.companionId}: elbow must bend toward normalized front`);
    for(let k=0;k<2;k++)assert.ok(Math.abs(idle.lengths[k]-bent.lengths[k])<1e-5,'Limb length must remain unchanged');
   }
   assert.ok(sample.poses.blink.expression>.9&&sample.poses.speak.expression>.6,`${body.companionId}: expressions must respond`);
  }
  assert.equal(pair[0].springs,pair[1].springs,'Original hair/ear/tail spring count must be preserved');
  for(const pose of Object.keys(pair[0].poses))assert.deepEqual(pair[0].poses[pose],pair[1].poses[pose],`${body.companionId}: native rig and expressions must be identical`);
  results.push({companionId:body.companionId,preparedSha256:body.preparedSha256,status:'passed',source:pair[0],prepared:pair[1]});
  console.log(` 🎮 [wardrobe-native-runtime] verified companion=${body.companionId} poses=6`);await page.close();
 }
 await writeFile('/tmp/wardrobe-native-runtime.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
