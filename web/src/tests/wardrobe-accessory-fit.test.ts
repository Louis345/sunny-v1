import {expect,it} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {readVrm,prepareWardrobeVrm,WARDROBE_RECIPES} from '../../../scripts/prepareWardrobe';
import {applyPreparedAccessoryFit,retainIntrinsicAccessories} from '../lib/wardrobeAccessoryFit';
import bodies from '../lib/wardrobePrepared.generated.json';

it('separates Matilda’s native halo without changing hair geometry, expressions or the rig',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='matilda')!,bytes=readFileSync(`public${recipe.sourceUrl}`),source=readVrm(bytes);
 const output=readVrm(prepareWardrobeVrm(bytes,recipe).bytes);
 expect(output.json.materials[25].extras.sunnyIntrinsicAccessory).toBe('halo');
 expect(output.json.meshes[2]).toEqual(source.json.meshes[2]);expect(output.json.nodes).toEqual(source.json.nodes);
 for(const index of [23,24])expect(output.json.materials[index].extras?.sunnyIntrinsicAccessory).toBeUndefined();
 const scene=new THREE.Group();const halo=new THREE.MeshBasicMaterial(),hair=new THREE.MeshBasicMaterial();halo.userData=output.json.materials[25].extras;
 scene.add(new THREE.Mesh(new THREE.BufferGeometry(),[halo,hair]));
 for(const selection of ['none','crown','cat-ears','halo']){expect(retainIntrinsicAccessories(scene,selection)).toBe(selection==='halo');expect(halo.visible).toBe(true);expect(hair.visible).toBe(true);}
});

it.each(bodies.filter(body=>['elli','matilda'].includes(body.companionId)))('places $companionId cat ears against the measured ear-base scalp surface and follows head movement',body=>{
 const scene=new THREE.Group(),head=new THREE.Bone();head.position.y=1.38;scene.rotation.y=Math.PI;scene.add(head);scene.updateMatrixWorld(true);
 const accessory=new THREE.Group();const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.15,3));ear.position.set(.085,.175,0);ear.rotation.z=-.12;accessory.add(ear);
 expect(applyPreparedAccessoryFit(accessory,head,body.modelUrl,'cat-ears')).toBe(true);head.add(accessory);scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(accessory),headPosition=head.getWorldPosition(new THREE.Vector3());
 const baseOffset=body.companionId==='elli' ? .178 : .1425854455302632;
 expect(bounds.min.y-headPosition.y).toBeCloseTo(baseOffset,5);
 expect(accessory.scale.x).toBe(.7);
 const local=accessory.position.clone();head.rotation.y=.6;scene.updateMatrixWorld(true);expect(accessory.position.equals(local)).toBe(true);
});

it.each([.5,2])('keeps attachment at the scaled scalp for avatar scale %s',scale=>{
 const scene=new THREE.Group(),head=new THREE.Bone();scene.scale.setScalar(scale);head.position.y=1.38;scene.add(head);scene.updateMatrixWorld(true);
 const accessory=new THREE.Group();const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.15,3));ear.position.y=.175;accessory.add(ear);
 applyPreparedAccessoryFit(accessory,head,bodies[0].modelUrl,'cat-ears');head.add(accessory);scene.updateMatrixWorld(true);
 expect(new THREE.Box3().setFromObject(accessory).min.y-head.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(.178*scale,5);
});

it.each(bodies.filter(body=>!['elli','matilda'].includes(body.companionId)))('rejects unfitted external accessories for $companionId',body=>{
 expect(()=>applyPreparedAccessoryFit(new THREE.Group(),new THREE.Bone(),body.modelUrl,'crown')).toThrow(/Missing prepared accessory fit/);
});
it('reuses Yukari native cat ears without hiding them or adding substitute ears',()=>{
 const r=WARDROBE_RECIPES.find(r=>r.id==='yukari')!,a=readVrm(prepareWardrobeVrm(readFileSync(`public${r.sourceUrl}`),r).bytes);
 expect(a.json.materials[11].extras.sunnyIntrinsicAccessory).toBe('cat-ears');
 const scene=new THREE.Group(),ears=new THREE.MeshBasicMaterial();ears.userData=a.json.materials[11].extras;scene.add(new THREE.Mesh(new THREE.BufferGeometry(),ears));
 expect(retainIntrinsicAccessories(scene,'cat-ears')).toBe(true);expect(retainIntrinsicAccessories(scene,'halo')).toBe(false);expect(ears.visible).toBe(true);
});
it('applies versioned lateral component tilt before seating an accessory',()=>{
 const fit=bodies[0].accessoryFits!['cat-ears'] as {lateralTilt?:number};const previous=fit.lateralTilt;fit.lateralTilt=.6;
 try{const scene=new THREE.Group(),head=new THREE.Bone(),accessory=new THREE.Group();scene.add(head);for(const side of [-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.15,3));ear.position.set(side*.085,.175,0);ear.rotation.z=side*-.12;accessory.add(ear);}applyPreparedAccessoryFit(accessory,head,bodies[0].modelUrl,'cat-ears');expect(accessory.children.map(c=>c.rotation.z)).toEqual([.6,-.6]);}finally{if(previous===undefined)delete fit.lateralTilt;else fit.lateralTilt=previous;}
});
