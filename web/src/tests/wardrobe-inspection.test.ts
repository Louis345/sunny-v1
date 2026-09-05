import {it,expect} from 'vitest';
import * as THREE from 'three';
import type {VRM} from '@pixiv/three-vrm';
import {applyWardrobeInspection,DEFAULT_WARDROBE_INSPECTION} from '../lib/wardrobeInspection';
it('frames the normalized showroom front and lowers the arms for idle',()=>{
 const scene=new THREE.Group();const head=new THREE.Bone();head.position.y=1.5;const foot=new THREE.Bone();scene.add(head,foot);
 let pose:any;
 const vrm={scene,humanoid:{setNormalizedPose:(p:any)=>{pose=p;},update:()=>{},getRawBoneNode:(id:string)=>id==='head'?head:foot}} as unknown as VRM;
 const camera=new THREE.PerspectiveCamera(22,1,0.05,50);
 applyWardrobeInspection(vrm,camera,DEFAULT_WARDROBE_INSPECTION,0);
 expect(camera.position.z).toBeGreaterThan(0); // CompanionMotor normalizes both VRM versions to +Z.
 expect(new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(pose.leftUpperArm.rotation)).z).toBeGreaterThan(0);
 applyWardrobeInspection(vrm,camera,{...DEFAULT_WARDROBE_INSPECTION,view:'back'},0);
 expect(camera.position.z).toBeLessThan(0);
});
it('lowers idle arms for the opposite VRM1 normalized coordinate convention',()=>{
 const scene=new THREE.Group();const head=new THREE.Bone();head.position.y=1.5;const foot=new THREE.Bone();scene.add(head,foot);
 let pose:any;
 const vrm={meta:{metaVersion:'1'},scene,humanoid:{setNormalizedPose:(p:any)=>{pose=p;},update:()=>{},getRawBoneNode:(id:string)=>id==='head'?head:foot}} as unknown as VRM;
 applyWardrobeInspection(vrm,new THREE.PerspectiveCamera(),DEFAULT_WARDROBE_INSPECTION,0);
 expect(new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(pose.leftUpperArm.rotation)).z).toBeLessThan(0);
});
