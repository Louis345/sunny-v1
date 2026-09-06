import {it,expect} from 'vitest';import * as THREE from 'three';
import {VRMSpringBoneJoint,VRMSpringBoneManager,type VRM} from '@pixiv/three-vrm';
import {attachWardrobeHairCollisions} from '../lib/wardrobeHairCollision';
it('adds garment collisions only to original hair springs and restores their exact groups on removal',()=>{
 const scene=new THREE.Group(),chest=new THREE.Bone(),hair=new THREE.Bone(),hairTip=new THREE.Bone(),ear=new THREE.Bone(),earTip=new THREE.Bone();chest.name='chest';hair.name='original-hair';hair.add(hairTip);ear.add(earTip);scene.add(chest,hair,ear);hairTip.position.y=earTip.position.y=.1;
 const original={name:'original',colliders:[]},shared=[original],h=new VRMSpringBoneJoint(hair,hairTip,{},shared),e=new VRMSpringBoneJoint(ear,earTip,{},shared),manager=new VRMSpringBoneManager();manager.addJoint(h);manager.addJoint(e);
 const back=new THREE.Bone(),backTip=new THREE.Bone();back.name='back-hair';back.add(backTip);backTip.position.y=.1;scene.add(back);const backJoint=new VRMSpringBoneJoint(back,backTip,{},shared);manager.addJoint(backJoint);
 scene.userData.sunnyWardrobeHairRoots=['original-hair','back-hair'];scene.userData.sunnyGarmentColliders={hoodie:[{bone:'chest',center:[0,1,0],radius:.1,hairRoots:['original-hair']}]};
 manager.setInitState();manager.update(1/60);
 const vrm={scene,springBoneManager:manager}as unknown as VRM,cleanup=attachWardrobeHairCollisions(vrm,'hoodie');
 expect(h.colliderGroups).toHaveLength(2);expect(h.colliderGroups[0]).toBe(original);expect(e.colliderGroups).toEqual([original]);
 expect(backJoint.colliderGroups).toBe(shared);expect(chest.children).toHaveLength(1);chest.position.x=1;scene.updateMatrixWorld(true);manager.update(1/60);expect(h.colliderGroups[1].colliders[0].colliderMatrix.elements[12]).toBe(1);
 cleanup();expect(h.colliderGroups).toEqual([original]);expect(e.colliderGroups).toEqual([original]);expect(chest.children).toHaveLength(0);
});
it('uses a garment front plane to push hair outward without the vertical displacement of a broad sphere',()=>{
 const scene=new THREE.Group(),chest=new THREE.Bone(),hair=new THREE.Bone(),tip=new THREE.Bone();chest.name='chest';hair.name='hair';tip.position.y=-.1;hair.add(tip);scene.add(chest,hair);
 const manager=new VRMSpringBoneManager(),joint=new VRMSpringBoneJoint(hair,tip,{},[]);manager.addJoint(joint);scene.userData.sunnyWardrobeHairRoots=['hair'];scene.userData.sunnyGarmentColliders={hoodie:[{bone:'chest',center:[0,1.2,.11],normal:[0,0,1]}]};manager.setInitState();
 const cleanup=attachWardrobeHairCollisions({scene,springBoneManager:manager}as unknown as VRM,'hoodie');scene.updateMatrixWorld(true);manager.update(1/60);
 const collider=joint.colliderGroups[0].colliders[0],normal=new THREE.Vector3();expect(collider.shape.type).toBe('plane');expect(collider.shape.calculateCollision(collider.colliderMatrix,new THREE.Vector3(0,1.25,.05),.01,normal)).toBeCloseTo(-.07);expect(normal.toArray()).toEqual([0,0,1]);cleanup();expect(joint.colliderGroups).toEqual([]);
});

it.each([[0,0,0],[NaN,0,1]])('rejects invalid plane normals %j before modifying spring groups',(...normal)=>{
 const scene=new THREE.Group(),chest=new THREE.Bone(),hair=new THREE.Bone(),tip=new THREE.Bone();chest.name='chest';hair.name='hair';tip.position.y=-.1;hair.add(tip);scene.add(chest,hair);const manager=new VRMSpringBoneManager(),joint=new VRMSpringBoneJoint(hair,tip,{},[]);manager.addJoint(joint);scene.userData.sunnyWardrobeHairRoots=['hair'];scene.userData.sunnyGarmentColliders={hoodie:[{bone:'chest',center:[0,1.2,.11],normal}]};manager.setInitState();expect(()=>attachWardrobeHairCollisions({scene,springBoneManager:manager}as unknown as VRM,'hoodie')).toThrow('Invalid native garment collider');expect(joint.colliderGroups).toEqual([]);expect(chest.children).toHaveLength(0);
});
