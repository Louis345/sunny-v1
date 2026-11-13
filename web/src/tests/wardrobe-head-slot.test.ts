import {expect,it} from 'vitest';
import * as THREE from 'three';
import {retainIntrinsicAccessories} from '../lib/wardrobeAccessoryFit';

// Bug 2026-11-10 evening (BUGS.md "Head accessories stack").
// Why the human caught it: Ila put new ears on her companion in FaceTime and the
//   halo stayed on top of the head, so two head items were worn at once.
// Why logs did not: the store held a single accessoryItemId and the showroom only
//   logged "intrinsic retained=… reused=false", which reads as normal.
// Why the lab missed it: the lab asserted the store state (one accessory) and the
//   old test pinned "halo stays visible for every selection" as the contract; no
//   test looked at what is actually rendered on the head.
function headWithNativeHalo(){
 const scene=new THREE.Group(),halo=new THREE.MeshBasicMaterial(),hair=new THREE.MeshBasicMaterial();
 halo.userData={sunnyIntrinsicAccessory:'halo'};
 scene.add(new THREE.Mesh(new THREE.BufferGeometry(),[halo,hair]));
 return {scene,halo,hair};
}

it.each(['cat-ears','crown'])('a %s on the head takes the native halo off (one item per head slot)',selection=>{
 const {scene,halo,hair}=headWithNativeHalo();
 expect(retainIntrinsicAccessories(scene,selection)).toBe(false);
 expect(halo.visible).toBe(false);
 expect(hair.visible).toBe(true);
});

it('the native halo comes back when the head accessory is removed or the halo is chosen',()=>{
 const {scene,halo}=headWithNativeHalo();
 retainIntrinsicAccessories(scene,'cat-ears');expect(halo.visible).toBe(false);
 expect(retainIntrinsicAccessories(scene,'none')).toBe(false);expect(halo.visible).toBe(true);
 retainIntrinsicAccessories(scene,'crown');
 expect(retainIntrinsicAccessories(scene,'halo')).toBe(true);expect(halo.visible).toBe(true);
});
