// Diagnostic material ablations only; never writes prepared assets or approval records.
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const source=await readFile(new URL('../web/public/companions/matilda-wardrobe-identity-preserved-v1.vrm',import.meta.url));
const original=JSON.parse(source.toString('utf8',20,20+source.readUInt32LE(12)));
const binary=source.subarray(20+source.readUInt32LE(12));
const root=new URL('../artifacts/wardrobe-certification/repair-resume/',import.meta.url);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 for(const mode of ['body-unlit','body-no-outline','body-no-normal']) {
  const json=structuredClone(original), material=json.materials[8], mtoon=json.extensions.VRM.materialProperties[8];
  if(mode==='body-unlit'){
   json.materials[8]={name:material.name,pbrMetallicRoughness:{baseColorFactor:[.8,.55,.4,1],metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}},alphaMode:'OPAQUE',doubleSided:false};
   mtoon.shader='VRM_USE_GLTFSHADER';
  }
  if(mode==='body-no-outline'){mtoon.floatProperties._OutlineWidth=0;mtoon.floatProperties._OutlineWidthMode=0;}
  if(mode==='body-no-normal'){delete mtoon.textureProperties._BumpMap;delete material.normalTexture;mtoon.keywordMap._NORMALMAP=false;}
  const j=Buffer.from(JSON.stringify(json)),n=Math.ceil(j.length/4)*4,b=Buffer.alloc(20+n+binary.length,0x20);
  b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(n,12);b.writeUInt32LE(0x4e4f534a,16);j.copy(b,20);binary.copy(b,20+n);
  const page=await browser.newPage({viewport:{width:1600,height:1100}});
  await page.route('**/matilda-wardrobe-*.vrm',route=>route.fulfill({body:b,contentType:'model/gltf-binary'}));
  await page.goto('http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false');
  await page.getByRole('button',{name:'Review Matilda prepared identity',exact:true}).click();
  await page.getByLabel('Inspection view',{exact:true}).selectOption('face');
  await page.waitForFunction(()=>{const p=[...document.querySelectorAll('[data-wardrobe-state]')];return p.length===2&&p.every(e=>e.dataset.wardrobeState==='ready')},{},{timeout:25000});
  await page.waitForTimeout(500);await page.screenshot({path:new URL(`${mode}.png`,root).pathname});await page.close();
  console.log(`Diagnostic capture ${mode}`);
 }
} finally {await browser.close();}
