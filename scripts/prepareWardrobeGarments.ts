// Local asset preparation only. Licensed geometry/textures stay in the ignored wardrobe directory.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {unzipSync} from '../web/node_modules/three/examples/jsm/libs/fflate.module.js';
import bodies from '../web/src/lib/wardrobePrepared.generated.json';
import versions from '../web/src/lib/wardrobeAssetVersions.generated.json';
import {getXwearOutfitDefinition,resolveXwearArchiveFiles,resolveXwearMainTextureGuids} from '../web/src/lib/xwearDress';
import {resolveLocalWardrobeAsset} from '../web/wardrobeAssets';
import type {PreparedGarmentData,PreparedGarmentReference} from '../web/src/lib/wardrobePreparedGarment';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.sunny-sandbox/wardrobe/prepared');mkdirSync(output,{recursive:true});
async function main(){
const browser=await chromium.launch({headless:true,channel:'chrome'});
const records:PreparedGarmentReference[]=[];
try{
 const page=await browser.newPage();
 await page.route('**/wardrobe-prepare.html',route=>route.fulfill({contentType:'text/html',body:'<title>Local wardrobe preparation</title>'}));
 await page.goto('http://127.0.0.1:5197/wardrobe-prepare.html');
 for(const body of bodies)for(const outfitId of ['sleeveless-dress','comet-hoodie','constellation-blazer']){
  const geometry=await page.evaluate(`(async()=>{
   const {modelUrl,outfitId}=${JSON.stringify({modelUrl:body.modelUrl,outfitId})};
   const loaderPath='/src/utils/loadCompanionVrm.ts',fitPath='/src/lib/xwearDress.ts';
   const {loadCompanionVrm}=await import(loaderPath),{attachXwearOutfit,getXwearOutfitDefinition}=await import(fitPath);
   const vrm=await loadCompanionVrm(modelUrl,{webgpu:false});
   // No modelUrl argument: this explicit preparation invocation runs the source fitter once.
   const mesh=await attachXwearOutfit(vrm.scene,getXwearOutfitDefinition(outfitId));
   const array=name=>Array.from(mesh.geometry.getAttribute(name).array);
   const inverseRoot=vrm.scene.matrixWorld.clone().invert();
   const result={positions:array('position'),normals:array('normal'),uv:array('uv'),skinIndices:array('skinIndex'),skinWeights:array('skinWeight'),indices:Array.from(mesh.geometry.index.array),groups:mesh.geometry.groups.map(g=>({...g})),bones:mesh.skeleton.bones.map((bone,i)=>({name:bone.name,bindMatrix:inverseRoot.clone().multiply(mesh.skeleton.boneInverses[i].clone().invert()).toArray()}))};
   vrm.scene.traverse(object=>{object.geometry?.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){material?.map?.dispose();material?.dispose();}object.skeleton?.dispose();});
   return result;
  })()`) as Pick<PreparedGarmentData,'positions'|'normals'|'uv'|'skinIndices'|'skinWeights'|'indices'|'groups'|'bones'>;
  const outfit=getXwearOutfitDefinition(outfitId)!;
  const archive=resolveXwearArchiveFiles(unzipSync(readFileSync(resolveLocalWardrobeAsset(outfit.archiveUrl!)!)));
  const resource=JSON.parse(new TextDecoder().decode(archive.resource)),item=JSON.parse(new TextDecoder().decode(archive.item));
  const renderer=resource.Components.find((c:{$type?:string})=>c.$type?.includes('XResourceSkinnedMeshRenderer'));
  const textures=resolveXwearMainTextureGuids(item,renderer.RefMaterialGuids).map(guid=>{const bytes=archive.textures.get(guid);if(!bytes)throw new Error(`Missing preparation texture ${guid}`);return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;});
  const sourceVersion=versions[(outfitId==='sleeveless-dress'?'ribbon-dress':outfitId) as keyof typeof versions];
  const data:PreparedGarmentData={schema:1,bodySha256:body.preparedSha256,sourceVersion,outfitId,...geometry,textures};
  const bytes=Buffer.from(JSON.stringify(data)),sha256=createHash('sha256').update(bytes).digest('hex');
  const name=`${body.companionId}-${outfitId}-${sha256}.json`;
  writeFileSync(path.join(output,name),bytes);
  records.push({companionId:body.companionId,bodySha256:body.preparedSha256,outfitId,sourceVersion,url:`/__wardrobe-assets/prepared/${name}`,sha256});
  console.log(` 🎮 [wardrobe-prepare] garment companion=${body.companionId} outfit=${outfitId} vertices=${geometry.positions.length/3} sha256=${sha256}`);
 }
 // Only publish the index after every requested output succeeds.
 writeFileSync(path.join(root,'web/src/lib/wardrobeFitted.generated.json'),JSON.stringify(records,null,2)+'\n');
}catch(error){console.error(' 🎮 [wardrobe-prepare] garments failed',error);process.exitCode=1;}
finally{await browser.close();}
}
main().catch(error=>{console.error(' 🎮 [wardrobe-prepare] browser failed',error);process.exitCode=1;});
