import {expect,it} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {readVrm,prepareWardrobeVrm,WARDROBE_RECIPES} from '../../../scripts/prepareWardrobe';
import {applyPreparedAccessoryFit,setIntrinsicAccessoriesVisible} from '../lib/wardrobeAccessoryFit';
import bodies from '../lib/wardrobePrepared.generated.json';

it('separates Matilda’s native halo without changing hair geometry, expressions or the rig',()=>{
 const recipe=WARDROBE_RECIPES.find(r=>r.id==='matilda')!,bytes=readFileSync(`public${recipe.sourceUrl}`),source=readVrm(bytes);
 const output=readVrm(prepareWardrobeVrm(bytes,recipe,readFileSync('public/companions/sample.vrm')).bytes);
 expect(output.json.materials[25].extras.sunnyIntrinsicAccessory).toBe('halo');
 expect(output.json.meshes[2]).toEqual(source.json.meshes[2]);expect(output.json.nodes).toEqual(source.json.nodes);
 for(const index of [23,24])expect(output.json.materials[index].extras?.sunnyIntrinsicAccessory).toBeUndefined();
 const scene=new THREE.Group();const halo=new THREE.MeshBasicMaterial(),hair=new THREE.MeshBasicMaterial();halo.userData=output.json.materials[25].extras;
 scene.add(new THREE.Mesh(new THREE.BufferGeometry(),[halo,hair]));
 setIntrinsicAccessoriesVisible(scene,false);expect(halo.visible).toBe(false);expect(hair.visible).toBe(true);
 setIntrinsicAccessoriesVisible(scene,true);expect(halo.visible).toBe(true);
});

it.each(bodies)('places $companionId cat ears against the measured ear-base scalp surface and follows head movement',body=>{
 const scene=new THREE.Group(),head=new THREE.Bone();head.position.y=1.38;scene.rotation.y=Math.PI;scene.add(head);scene.updateMatrixWorld(true);
 const accessory=new THREE.Group();const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.15,3));ear.position.set(.085,.175,0);ear.rotation.z=-.12;accessory.add(ear);
 expect(applyPreparedAccessoryFit(accessory,head,body.modelUrl,'cat-ears')).toBe(true);head.add(accessory);scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(accessory),headPosition=head.getWorldPosition(new THREE.Vector3());
 const baseOffset=body.companionId==='elli' ? .16611450626131796 : .1425854455302632;
 expect(bounds.min.y-headPosition.y).toBeCloseTo(baseOffset,5);
 expect(accessory.scale.x).toBe(.7);
 const local=accessory.position.clone();head.rotation.y=.6;scene.updateMatrixWorld(true);expect(accessory.position.equals(local)).toBe(true);
});

it.each([.5,2])('keeps attachment at the scaled scalp for avatar scale %s',scale=>{
 const scene=new THREE.Group(),head=new THREE.Bone();scene.scale.setScalar(scale);head.position.y=1.38;scene.add(head);scene.updateMatrixWorld(true);
 const accessory=new THREE.Group();const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.15,3));ear.position.y=.175;accessory.add(ear);
 applyPreparedAccessoryFit(accessory,head,bodies[0].modelUrl,'cat-ears');head.add(accessory);scene.updateMatrixWorld(true);
 expect(new THREE.Box3().setFromObject(accessory).min.y-head.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(.16611450626131796*scale,5);
});
