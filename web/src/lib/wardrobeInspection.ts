import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { WardrobeAccessoryId } from './wardrobeStore';

export type WardrobeInspection = {
  view: 'front' | 'side' | 'back' | 'face';
  pose: 'idle' | 'blink' | 'speak' | 'head-turn' | 'arms-up' | 'elbows-bent' | 'leg-swing';
  accessory: WardrobeAccessoryId;
};
export const DEFAULT_WARDROBE_INSPECTION: WardrobeInspection = {view:'front',pose:'idle',accessory:'none'};

// A deterministic lab instrument, enabled only through candidate-preview props.
// Leg swing is explicitly synthetic; it is not certification of a production walking clip.
export function applyWardrobeInspection(vrm: VRM, camera: THREE.PerspectiveCamera, settings: WardrobeInspection, seconds: number, delta = 1 / 60) {
  const rotation = (x:number,y:number,z:number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)).toArray();
  const armSign = vrm.meta?.metaVersion === "1" ? -1 : 1;
  const swing = settings.pose === 'leg-swing' ? Math.sin(seconds * 3) * .45 : 0;
  vrm.humanoid.setNormalizedPose({
    head: {rotation:rotation(0,settings.pose==='head-turn' ? .6 : 0,0)},
    leftUpperArm:{rotation:rotation(-swing,0,armSign * (settings.pose==='arms-up' ? -.6 : 1.25))},
    rightUpperArm:{rotation:rotation(swing,0,armSign * (settings.pose==='arms-up' ? .6 : -1.25))},
    leftLowerArm:{rotation:rotation(0,settings.pose==='elbows-bent' ? -.95 : 0,0)}, rightLowerArm:{rotation:rotation(0,settings.pose==='elbows-bent' ? .95 : 0,0)},
    leftUpperLeg:{rotation:rotation(swing,0,0)}, rightUpperLeg:{rotation:rotation(-swing,0,0)},
    leftLowerLeg:{rotation:rotation(Math.max(0,-swing),0,0)}, rightLowerLeg:{rotation:rotation(Math.max(0,swing),0,0)},
  });
  vrm.expressionManager?.resetValues();
  vrm.expressionManager?.setValue('blink', settings.pose==='blink' ? 1 : 0);
  vrm.expressionManager?.setValue('aa', settings.pose==='speak' ? .7 : 0);
  vrm.humanoid.update(); vrm.nodeConstraintManager?.update(); vrm.expressionManager?.update();
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.update(Math.min(Math.max(delta,0),.05));
  vrm.scene.updateMatrixWorld(true);
  const head = vrm.humanoid.getRawBoneNode('head')!.getWorldPosition(new THREE.Vector3());
  const foot = vrm.humanoid.getRawBoneNode('leftFoot')!.getWorldPosition(new THREE.Vector3());
  const height = Math.max(.1,head.y-foot.y);
  const target = new THREE.Vector3(head.x,settings.view==='face' ? head.y + height*.04 : foot.y + height*.54,head.z);
  const distance = height * (settings.view==='face' ? 1.65 : 5.3);
  const angle = settings.view==='side' ? Math.PI/2 : settings.view==='back' ? Math.PI : 0;
  camera.position.set(target.x + Math.sin(angle)*distance,target.y,target.z+Math.cos(angle)*distance);
  camera.lookAt(target);camera.updateMatrixWorld(true);
}
