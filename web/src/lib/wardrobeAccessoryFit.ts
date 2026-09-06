import * as THREE from 'three';
import prepared from './wardrobePrepared.generated.json';

export function isPreparedAccessoryAvailable(modelUrl:string,accessoryId:string){
 if(accessoryId==='none')return true;
 const body=prepared.find(b=>b.modelUrl===modelUrl);
 return Boolean(body&&(Object.values(body.intrinsicAccessoryMaterials??{}).includes(accessoryId)||Object.hasOwn(body.accessoryFits??{},accessoryId)));
}

export function retainIntrinsicAccessories(scene:THREE.Object3D,selectedAccessoryId:string){
 let restored=0,provided=false;
 scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const material of Array.isArray(object.material)?object.material:[object.material]){
  const intrinsic=material.userData.sunnyIntrinsicAccessory;if(!intrinsic)continue;
  if(!material.visible){material.visible=true;restored++;}
  if(intrinsic===selectedAccessoryId)provided=true;
 }});
 if(restored||provided)console.log(` 🎮 [wardrobe-accessory] intrinsic retained=${restored} reused=${provided} selection=${selectedAccessoryId}`);
 return provided;
}

export function applyPreparedAccessoryFit(accessory:THREE.Group,head:THREE.Object3D,modelUrl:string,accessoryId:string){
 const body=prepared.find(b=>b.modelUrl===modelUrl);
 if(!body){if(modelUrl.includes('-wardrobe-'))throw new Error(`Unknown prepared accessory body ${modelUrl}`);return false;}
 const fit=(body.accessoryFits as Record<string,{baseY:number;scale:number;rotationY:number;lateralTilt?:number}>|undefined)?.[accessoryId];
 if(!fit)throw new Error(`Missing prepared accessory fit ${body.companionId}/${accessoryId}`);
 if(fit.lateralTilt!==undefined)for(const component of accessory.children)component.rotation.z=-Math.sign(component.position.x)*fit.lateralTilt;
 accessory.scale.setScalar(fit.scale);
 accessory.updateMatrixWorld(true);const localBounds=new THREE.Box3().setFromObject(accessory);
 head.updateWorldMatrix(true,false);
 const scale=head.getWorldScale(new THREE.Vector3()).y;
 const target=head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,(fit.baseY-localBounds.min.y)*scale,0));
 accessory.position.copy(head.worldToLocal(target));
 accessory.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),fit.rotationY));
 console.log(` 🎮 [wardrobe-accessory] fit companion=${body.companionId} accessory=${accessoryId} body=${body.preparedSha256}`);
 return true;
}
