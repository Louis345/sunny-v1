import * as THREE from 'three';
import {VRMSpringBoneCollider,VRMSpringBoneColliderShapeSphere,VRMSpringBoneColliderShapePlane,type VRM} from '@pixiv/three-vrm';
export type WardrobeGarmentCollider={bone:string;center:[number,number,number];radius?:number;normal?:[number,number,number];hairRoots?:string[]};
// Added garment volumes participate in the existing hair simulation. Identity
// geometry, original colliders, spring settings and intrinsic ear physics remain owned by the VRM.
export function attachWardrobeHairCollisions(vrm:VRM,outfitId:string):()=>void{
 const recipes=vrm.scene.userData.sunnyGarmentColliders?.[outfitId]as WardrobeGarmentCollider[]|undefined;
 if(!recipes?.length)return()=>{};
 if(!vrm.springBoneManager)throw new Error('Garment hair clearance requires the original spring-bone manager');
 const nodes=new Map<string,THREE.Object3D>();vrm.scene.traverse(node=>nodes.set(node.name,node));
 const hairNodes=new Set<THREE.Object3D>();
 for(const name of vrm.scene.userData.sunnyWardrobeHairRoots??[]){const root=nodes.get(THREE.PropertyBinding.sanitizeNodeName(name));if(!root)throw new Error(`Original hair root missing: ${name}`);root.traverse(node=>hairNodes.add(node));}
 const springs=[...vrm.springBoneManager.joints].filter(joint=>hairNodes.has(joint.bone));
 if(!springs.length)throw new Error('No original hair springs selected for garment clearance');
 const bindings=recipes.map(recipe=>{const selected=new Set<THREE.Object3D>();for(const name of recipe.hairRoots??[]){const root=nodes.get(THREE.PropertyBinding.sanitizeNodeName(name));if(!root||!hairNodes.has(root))throw new Error(`Invalid garment hair selection: ${name}`);root.traverse(node=>selected.add(node));}const bone=nodes.get(THREE.PropertyBinding.sanitizeNodeName(recipe.bone));if(!bone||(recipe.normal?recipe.normal.some(n=>!Number.isFinite(n))||new THREE.Vector3(...recipe.normal).lengthSq()===0:!(Number.isFinite(recipe.radius)&&recipe.radius!>0))||recipe.center.some(n=>!Number.isFinite(n)))throw new Error('Invalid native garment collider');return{recipe,bone,selected};});
 const colliders:VRMSpringBoneCollider[]=[];
 vrm.scene.updateMatrixWorld(true);
 for(const {recipe,bone} of bindings){const collider=new VRMSpringBoneCollider(recipe.normal?new VRMSpringBoneColliderShapePlane({normal:new THREE.Vector3(...recipe.normal).normalize()}):new VRMSpringBoneColliderShapeSphere({radius:recipe.radius}));collider.name='sunny-garment-hair-clearance';vrm.scene.add(collider);collider.position.fromArray(recipe.center);collider.updateMatrixWorld(true);bone.attach(collider);colliders.push(collider);}
 const originals=springs.map(spring=>spring.colliderGroups);springs.forEach((spring,i)=>{const selected=colliders.filter((_,k)=>!bindings[k].recipe.hairRoots||bindings[k].selected.has(spring.bone));if(selected.length){spring.colliderGroups=[...originals[i],{name:`sunny-garment-${outfitId}`,colliders:selected}];vrm.springBoneManager!.addJoint(spring);}});
 console.log(` 🎮 [wardrobe-physics] attached outfit=${outfitId} colliders=${colliders.length} hair_springs=${springs.length}`);
 return()=>{springs.forEach((spring,i)=>{spring.colliderGroups=originals[i];vrm.springBoneManager!.addJoint(spring);});for(const collider of colliders)collider.removeFromParent();console.log(` 🎮 [wardrobe-physics] removed outfit=${outfitId}`);};
}
