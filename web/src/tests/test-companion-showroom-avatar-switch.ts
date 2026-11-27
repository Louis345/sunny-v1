import { describe, expect, it } from "vitest";
import { slotFrameStyle } from "../components/CompanionShowroom";

describe("Companion showroom avatar switching", () => {
  it("never leaves the previous companion visible during an identity change", () => {
    const previousCompanion = slotFrameStyle("prev", {
      instantAvatarSwitch: true,
    });
    const selectedCompanion = slotFrameStyle("current", {
      instantAvatarSwitch: true,
    });

    expect(previousCompanion.opacity).toBe(0);
    expect(previousCompanion.transition).toBe("none");
    expect(selectedCompanion.opacity).toBe(1);
    expect(selectedCompanion.transition).toBe("none");
  });

  it("preserves the normal carousel animation outside an identity change", () => {
    const previousCompanion = slotFrameStyle("prev");

    expect(previousCompanion.opacity).toBe(0.4);
    expect(previousCompanion.transition).toContain("left 620ms");
  });
});

import { shouldRevealWardrobeCompanionCanvas } from '../components/CompanionShowroom';
it('hides prepared identities until the complete current selection is ready', () => {
  const state = {requiresReady:true, requestedKey:'matilda:hoodie', settledKey:'matilda:dress', presentationState:'ready' as const};
  expect(shouldRevealWardrobeCompanionCanvas(state)).toBe(false);
  expect(shouldRevealWardrobeCompanionCanvas({...state,settledKey:state.requestedKey})).toBe(true);
  expect(shouldRevealWardrobeCompanionCanvas({...state,settledKey:state.requestedKey,presentationState:'loading'})).toBe(false);
  expect(shouldRevealWardrobeCompanionCanvas({...state,settledKey:state.requestedKey,presentationState:'failed'})).toBe(false);
});

import * as THREE from 'three';
import {vi} from 'vitest';
import {removeWardrobeAccessory,attachWardrobeAccessory} from '../components/CompanionShowroom';
it('releases a discarded garment skeleton texture along with geometry and material',()=>{
 const garment=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
 const bone=new THREE.Bone();garment.add(bone);garment.bind(new THREE.Skeleton([bone]));garment.skeleton.computeBoneTexture();
 const texture=garment.skeleton.boneTexture!;const disposed=vi.fn();texture.addEventListener('dispose',disposed);
 removeWardrobeAccessory(garment);
 expect(disposed).toHaveBeenCalledTimes(1);
 expect(garment.skeleton.boneTexture).toBeNull();
});
it('disposes an unattached accessory if its prepared fit is unavailable',()=>{
 const geometry=vi.spyOn(THREE.BufferGeometry.prototype,'dispose');
 try{
  expect(()=>attachWardrobeAccessory(new THREE.Bone(),'crown','/companions/elli-wardrobe-obsolete.vrm')).toThrow(/Unknown prepared accessory body/);
  expect(geometry).toHaveBeenCalledTimes(5);
 }finally{geometry.mockRestore();}
});
