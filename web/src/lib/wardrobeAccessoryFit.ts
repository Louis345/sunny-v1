import * as THREE from 'three';
import prepared from './wardrobePrepared.generated.json';

export function setIntrinsicAccessoriesVisible(scene:THREE.Object3D,visible:boolean){
 let changed=0;
 scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.userData.sunnyIntrinsicAccessory){material.visible=visible;changed++;}});
 if(changed)console.log(` 🎮 [wardrobe-accessory] intrinsic visibility=${visible} materials=${changed}`);
}

export function applyPreparedAccessoryFit(accessory:THREE.Group,head:THREE.Object3D,modelUrl:string,accessoryId:string){
 const body=prepared.find(b=>b.modelUrl===modelUrl);
 if(!body){if(modelUrl.includes('-wardrobe-'))throw new Error(`Unknown prepared accessory body ${modelUrl}`);return false;}
 const fit=(body.accessoryFits as Record<string,{baseY:number;scale:number;rotationY:number}>|undefined)?.[accessoryId];
 if(!fit)throw new Error(`Missing prepared accessory fit ${body.companionId}/${accessoryId}`);
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
