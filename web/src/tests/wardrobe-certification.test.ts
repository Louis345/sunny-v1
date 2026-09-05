import { describe, expect, it } from 'vitest';
import { resolveWardrobeTemplateCertification, validateWardrobeCertification } from '../lib/wardrobeBodyProfiles';
import { WARDROBE_STORE_CATALOG, getCompatibleWardrobeItems } from '../lib/wardrobeStore';

describe('versioned wardrobe certification', () => {
  it('quarantines migrated assets, including accessories previously labelled universal', () => {
    for (const companion of ['elli','matilda']) {
      expect(resolveWardrobeTemplateCertification(companion,'ribbon-dress').status).toBe('candidate');
      expect(getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, `/companions/${companion}-wardrobe-identity-preserved-${companion === "matilda" ? "v2" : "v1"}.vrm`, companion)).toEqual([]);
    }
  });
  const current = {modelUrl:'/prepared.vrm', preparedSha256:'body-v1', assetVersion:'garment-v1', recipeVersion:'recipe-v1'};
  const approved = {companionId:'fixture',templateId:'fixture',status:'approved' as const, reason:'Fixture human review',...current,humanReview:{reviewedBy:'test reviewer',reviewedAt:'2026-09-05',evidence:['fixture-front.png','fixture-motion.webm']}};
  it('accepts an explicit human review for matching versions', () => expect(validateWardrobeCertification(approved,current).status).toBe('approved'));
  it.each(['modelUrl','preparedSha256','assetVersion','recipeVersion'] as const)('invalidates approval when %s changes', key => {
    expect(validateWardrobeCertification(approved,{...current,[key]:'changed'}).status).toBe('candidate');
  });
  it('cannot substitute automated success for human review', () => {
    expect(validateWardrobeCertification({...approved,humanReview:undefined},current).status).toBe('candidate');
    expect(validateWardrobeCertification({...approved,humanReview:{...approved.humanReview,evidence:[]}},current).status).toBe('candidate');
  });
});

import {WARDROBE_BODY_PROFILES} from '../lib/wardrobeBodyProfiles';
it('does not present a shared body profile as garment approval',()=>{
 expect(JSON.stringify(WARDROBE_BODY_PROFILES)).not.toContain('visually approved');
});
