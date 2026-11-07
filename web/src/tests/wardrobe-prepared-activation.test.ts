import {afterEach,expect,it,vi} from 'vitest';
import * as certification from '../lib/wardrobeBodyProfiles';
import bodies from '../lib/wardrobePrepared.generated.json';
import {getXwearOutfitDefinition,isXwearOutfitApprovedForAvatar} from '../lib/xwearDress';
import {isWardrobeStoreItemCompatible,WARDROBE_STORE_CATALOG} from '../lib/wardrobeStore';
afterEach(()=>vi.restoreAllMocks());
it.each(bodies)('uses exact current certification to activate $companionId prepared fits',body=>{
 const approval=vi.spyOn(certification,'resolveWardrobeTemplateCertification');
 for(const id of ['sleeveless-dress','comet-hoodie','constellation-blazer']){
  const item=WARDROBE_STORE_CATALOG.find(i=>i.id===id)!;
  approval.mockReturnValue({companionId:body.companionId,templateId:item.templateId!,status:'approved',reason:'TEST ONLY: future explicit approval'});
  expect(isWardrobeStoreItemCompatible(item,body.modelUrl,body.companionId)).toBe(true);
  expect(isXwearOutfitApprovedForAvatar(getXwearOutfitDefinition(id)!,body.modelUrl)).toBe(true);
  approval.mockReturnValue({companionId:body.companionId,templateId:item.templateId!,status:'candidate',reason:'No approval'});
  expect(isXwearOutfitApprovedForAvatar(getXwearOutfitDefinition(id)!,body.modelUrl)).toBe(false);
 }
});
