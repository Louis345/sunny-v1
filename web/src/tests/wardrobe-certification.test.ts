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
  const current = {modelUrl:'/prepared.vrm', preparedSha256:'body-v1', assetVersion:'garment-v1', recipeVersion:'recipe-v1',fittedSha256:'exact-fit-v1'};
  const approved = {companionId:'fixture',templateId:'fixture',status:'approved' as const, reason:'Fixture human review',...current,humanReview:{reviewedBy:'test reviewer',reviewedAt:'2026-09-05',evidence:['fixture-front.png','fixture-motion.webm']}};
  it('accepts an explicit human review for matching versions', () => expect(validateWardrobeCertification(approved,current).status).toBe('approved'));
  it.each(['modelUrl','preparedSha256','assetVersion','recipeVersion','fittedSha256'] as const)('invalidates approval when %s changes', key => {
    expect(validateWardrobeCertification(approved,{...current,[key]:'changed'}).status).toBe('candidate');
  });
  it('cannot substitute automated success for human review', () => {
    expect(validateWardrobeCertification({...approved,humanReview:undefined},current).status).toBe('candidate');
    expect(validateWardrobeCertification({...approved,humanReview:{...approved.humanReview,evidence:[]}},current).status).toBe('candidate');
  });
});

import fitted from '../lib/wardrobeFitted.generated.json';
import {WARDROBE_TEMPLATE_CERTIFICATIONS} from '../lib/wardrobeBodyProfiles';
import bodies from '../lib/wardrobePrepared.generated.json';
import versions from '../lib/wardrobeAssetVersions.generated.json';
it('binds approval to the fitted output hash even when source code and body versions are unchanged',()=>{
 const body=bodies[0],fit=fitted.find(f=>f.companionId===body.companionId&&f.outfitId==='sleeveless-dress')!;
 const record=WARDROBE_TEMPLATE_CERTIFICATIONS.find(r=>r.companionId===body.companionId&&r.templateId==='ribbon-dress')!;
 const original={...record};
 try{
  Object.assign(record,{modelUrl:body.modelUrl,preparedSha256:body.preparedSha256,assetVersion:versions['ribbon-dress'],recipeVersion:body.recipeVersion,fittedSha256:fit.sha256,humanReview:{reviewedBy:'test fixture only',reviewedAt:'2026-09-05',evidence:['fixture.png']}});
  expect(resolveWardrobeTemplateCertification(body.companionId,'ribbon-dress').status).toBe('approved');
  Object.assign(record,{fittedSha256:'different fitted bytes'});
  expect(resolveWardrobeTemplateCertification(body.companionId,'ribbon-dress').status).toBe('candidate');
 }finally{for(const key of Object.keys(record))delete (record as unknown as Record<string,unknown>)[key];Object.assign(record,original);}
});

import {WARDROBE_BODY_PROFILES} from '../lib/wardrobeBodyProfiles';
it('does not present a shared body profile as garment approval',()=>{
 expect(JSON.stringify(WARDROBE_BODY_PROFILES)).not.toContain('visually approved');
});
