import {expect,it} from 'vitest';
import {isWardrobeReadyForHumanReview} from '../lib/wardrobeBodyProfiles';
import bodies from '../lib/wardrobePrepared.generated.json';
import fits from '../lib/wardrobeFitted.generated.json';
import versions from '../lib/wardrobeAssetVersions.generated.json';
const checks=['front:idle','back:idle','side:idle','face:idle','face:speak','face:head-turn','front:arms-up','front:elbows-bent'];
const body=bodies[0];
function verified(){return {...body,accessoryVersions:{crown:versions['royal-crown'],'cat-ears':versions['cat-ears'],halo:versions['star-halo']},presentationVersion:(versions as Record<string,string>).presentation,automated:'passed',supplemental:[{check:'face:blink',path:'artifacts/blink.png'},...['sleeveless-dress','comet-hoodie','constellation-blazer'].flatMap(outfit=>['crown','cat-ears','halo'].map(accessory=>({check:`${outfit}:${accessory}`,path:'artifacts/accessory.png'}))),...['plum','teal','rose'].map(color=>({check:`${color}-ribbon-dress`,path:'artifacts/color.png'}))],garments:fits.filter(f=>f.companionId===body.companionId).map(f=>({...f,visual:'passed',evidence:checks.map(check=>({check,path:`artifacts/${check}.png`}))}))};}
it('requires an explicit complete current engineering record before human review',()=>{
 expect(isWardrobeReadyForHumanReview(body.companionId,[])).toBe(false);
 expect(isWardrobeReadyForHumanReview(body.companionId,[verified()])).toBe(true);
});
it.each(['body','recipe','presentation','fit','source','missing-garment','missing-view','visual-failure','automated-failure'])('invalidates human-review readiness after %s changes',change=>{
 const record=verified();
 if(change==='body')record.preparedSha256='old';
 if(change==='recipe')record.recipeVersion='old';
 if(change==='presentation')record.presentationVersion='old';
 if(change==='fit')record.garments[0].sha256='old';
 if(change==='source')record.garments[0].sourceVersion='old';
 if(change==='missing-garment')record.garments.pop();
 if(change==='missing-view')record.garments[0].evidence.pop();
 if(change==='visual-failure')record.garments[0].visual='failed';
 if(change==='automated-failure')record.automated='failed';
 expect(isWardrobeReadyForHumanReview(body.companionId,[record])).toBe(false);
});

it.each(['back','blink','accessory','color'])('requires supplemental milestone coverage: %s',kind=>{const r=verified();if(kind==='back')r.garments[0].evidence=r.garments[0].evidence.filter(e=>e.check!=='back:idle');else r.supplemental=r.supplemental.filter(e=>kind==='blink'?e.check!=='face:blink':kind==='accessory'?e.check!=='comet-hoodie:crown':e.check!=='teal-ribbon-dress');expect(isWardrobeReadyForHumanReview(body.companionId,[r])).toBe(false);});

it('invalidates review after an accessory-only fit revision without changing body or garment hashes',()=>{const r=verified();r.accessoryVersions.crown='previous-fit';expect(isWardrobeReadyForHumanReview(body.companionId,[r])).toBe(false);});

import records from '../lib/wardrobeEngineeringReview.json';
import {existsSync} from 'node:fs';
it('delivers current verified evidence files for every native companion and garment',()=>{
 expect(records).toHaveLength(bodies.length);
 for(const body of bodies){expect(isWardrobeReadyForHumanReview(body.companionId),body.companionId).toBe(true);const r=records.find(r=>r.companionId===body.companionId)!;for(const e of [...r.supplemental,...r.garments.flatMap(g=>g.evidence)])expect(existsSync(`../${e.path}`),e.path).toBe(true);}
});
