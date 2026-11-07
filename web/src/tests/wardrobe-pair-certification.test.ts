import {afterEach,expect,it,vi} from 'vitest';
import * as certification from '../lib/wardrobeBodyProfiles';
import {createInitialWardrobeStoreState,equipWardrobeItem,resolveEquippedWardrobeSelection,getWardrobePairVersion} from '../lib/wardrobeStore';
import bodies from '../lib/wardrobePrepared.generated.json';
import fits from '../lib/wardrobeFitted.generated.json';
const model=bodies[0].modelUrl;
afterEach(()=>vi.restoreAllMocks());
it('requires a reviewed exact pair even if each item has standalone approval',()=>{
 vi.spyOn(certification,'resolveWardrobeTemplateCertification').mockReturnValue({companionId:'elli',templateId:'fixture',status:'approved',reason:'TEST ONLY'});
 const state={...createInitialWardrobeStoreState(),ownedItemIds:['sleeveless-dress','royal-crown'],equippedByCompanion:{elli:{outfitItemId:'sleeveless-dress'}}};
 expect(equipWardrobeItem(state,'elli','royal-crown',model).status).toBe('incompatible');
 expect(resolveEquippedWardrobeSelection({...state,equippedByCompanion:{elli:{outfitItemId:'sleeveless-dress',accessoryItemId:'royal-crown'}}},'elli',model)).toEqual({outfitId:'none',accessoryId:'none'});
});
it('invalidates pair approval on garment, variant, companion or fitted-output changes',()=>{
 const version=getWardrobePairVersion('elli',model,'sleeveless-dress','royal-crown');
 const record={companionId:'elli',outfitItemId:'sleeveless-dress',accessoryItemId:'royal-crown',version,status:'approved' as const,humanReview:{reviewedBy:'fixture',reviewedAt:'2026-09-05',evidence:['fixture.png']}};
 expect(certification.isWardrobePairApproved('elli','sleeveless-dress','royal-crown',version,[record])).toBe(true);
 for(const changed of [getWardrobePairVersion('elli',model,'teal-ribbon-dress','royal-crown'),getWardrobePairVersion('elli',model,'comet-hoodie','royal-crown'),getWardrobePairVersion('matilda',bodies[1].modelUrl,'sleeveless-dress','royal-crown')])expect(certification.isWardrobePairApproved('elli','sleeveless-dress','royal-crown',changed,[record])).toBe(false);
 const fit=fits[0],original=fit.sha256;try{fit.sha256='changed';expect(getWardrobePairVersion('elli',model,'sleeveless-dress','royal-crown')).not.toBe(version);}finally{fit.sha256=original;}
 expect(certification.isWardrobePairApproved('elli','sleeveless-dress','royal-crown',version,[{...record,humanReview:undefined}])).toBe(false);
});
