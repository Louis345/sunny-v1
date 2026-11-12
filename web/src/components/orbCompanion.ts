import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { loadMixamoFbxRoot, retargetMixamoClipToVrm } from "../utils/mixamoRetarget";

/**
 * Her companion as a living character in the 3D scenes (owner, 2026-11-11): she blinks, her eyes and head
 * follow what matters (the orb in flight, the creature, the egg), her face shows how she feels, and she
 * answers a tap. Shared by the orb catcher and the egg nest so both stages have the same Elli.
 */

export type CompanionFeeling = "happy" | "surprised" | "sad" | "relaxed";

/** What a tap on her does when nothing else is going on: a little hello, never the same twice in a row. */
const TAP_REACTIONS = ["wave", "silly_laugh", "blow_a_kiss"] as const;
const DANCES = ["dance_victory", "hip_hop_dancing", "silly_dancing", "salsa_dancing"] as const;
const BASE_CLIPS = ["idle", "shrug", "defeated", "think", ...TAP_REACTIONS, ...DANCES];

export interface Companion {
  readonly ready: boolean;
  update(dt: number, time: number): void;
  /** Plays a clip once (then back to idle) or on a loop. */
  play(name: string, loop?: boolean): void;
  /** A tap hello; returns the clip it chose. */
  react(): string | null;
  /** A different celebration dance each time. */
  dance(): string | null;
  feel(feeling: CompanionFeeling, amount?: number): void;
  /** Where she looks (eyes, and her head a little). */
  watch(point: THREE.Vector3): void;
  /** Did this ray hit her? */
  hit(raycaster: THREE.Raycaster): boolean;
  dispose(): void;
}

export function loadCompanion(
  scene: THREE.Scene,
  url: string | undefined,
  placement: { position: THREE.Vector3; rotationY: number },
): Companion {
  let vrm: VRM | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let disposed = false;
  const actions: Record<string, THREE.AnimationAction> = {};
  let current: string | null = null;
  const feelings: Record<CompanionFeeling, number> = { happy: 0, surprised: 0, sad: 0, relaxed: 0 };
  const lookTarget = new THREE.Object3D();
  const desiredLook = new THREE.Vector3(0, 1.4, 7);
  lookTarget.position.copy(desiredLook);
  scene.add(lookTarget);
  let nextBlink = 2;
  let blink = 0;
  let lastReaction = "";
  let danceIndex = Math.floor(Math.random() * DANCES.length);
  let headYaw = 0;
  let headPitch = 0;

  const play = (name: string, loop = false) => {
    const next = actions[name];
    if (!next || !mixer) return;
    Object.values(actions).forEach((action) => action !== next && action.fadeOut(0.3));
    next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    // The very first pose is applied at full weight: fading in from nothing would flash a T-pose.
    if (current) next.fadeIn(0.3);
    next.play();
    next.clampWhenFinished = !loop;
    current = name;
  };

  if (url) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader
      .loadAsync(url)
      .then(async (gltf) => {
        if (disposed) return;
        const loaded = gltf.userData.vrm as VRM | undefined;
        if (!loaded) return;
        VRMUtils.rotateVRM0(loaded);
        loaded.scene.position.copy(placement.position);
        loaded.scene.rotation.y = placement.rotationY;
        loaded.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) child.castShadow = true;
        });
        if (loaded.lookAt) {
          loaded.lookAt.target = lookTarget;
          loaded.lookAt.autoUpdate = true;
        }
        mixer = new THREE.AnimationMixer(loaded.scene);
        // A one-shot clip hands back to idle when it ends.
        mixer.addEventListener("finished", () => {
          if (current && current !== "defeated" && !DANCES.includes(current as (typeof DANCES)[number])) play("idle", true);
        });
        const loadClip = async (name: string) => {
          try {
            const root = await loadMixamoFbxRoot(`/animations/${name}.fbx`);
            const raw = root.animations.find((clip) => clip.tracks.length > 0);
            const clip = raw ? retargetMixamoClipToVrm(raw, root, loaded) : null;
            if (clip && mixer) actions[name] = mixer.clipAction(clip);
          } catch (error) {
            console.warn(` 🎮 [companion] [animation] [skipped] name=${name}`, error);
          }
        };
        // She steps in only once her idle is ready (never a T-pose); the rest of her moves load behind.
        await loadClip("idle");
        if (disposed) return;
        play("idle", true);
        mixer.update(0);
        loaded.update(0);
        scene.add(loaded.scene);
        vrm = loaded;
        await Promise.all(BASE_CLIPS.filter((name) => name !== "idle").map(loadClip));
        if (disposed) return;
        console.log(` 🎮 [companion] [ready] clips=${Object.keys(actions).length}`);
      })
      .catch((error: unknown) => console.warn(" 🎮 [companion] [unavailable]", error));
  }

  return {
    get ready() {
      return vrm !== null;
    },
    update(dt, time) {
      mixer?.update(dt);
      if (vrm) {
        // Eyes glide toward what she is watching.
        lookTarget.position.lerp(desiredLook, Math.min(1, dt * 6));
        // Her head turns a little too (layered on top of the animation, so it never fights the clip).
        const head = vrm.humanoid?.getNormalizedBoneNode("head");
        if (head) {
          const local = vrm.scene.worldToLocal(lookTarget.position.clone());
          const headHeight = 1.4;
          const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
          const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - headHeight, Math.hypot(local.x, local.z)), -0.35, 0.35);
          headYaw = THREE.MathUtils.lerp(headYaw, yaw * 0.6, Math.min(1, dt * 5));
          headPitch = THREE.MathUtils.lerp(headPitch, pitch * 0.5, Math.min(1, dt * 5));
          head.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(headPitch, headYaw, 0, "YXZ")));
        }
        // Blink every few seconds.
        if (time > nextBlink) {
          blink = 1;
          nextBlink = time + 2.5 + Math.random() * 3;
        }
        blink = Math.max(0, blink - dt * 7);
        const manager = vrm.expressionManager;
        if (manager) {
          (Object.keys(feelings) as CompanionFeeling[]).forEach((feeling) => {
            feelings[feeling] = Math.max(0, feelings[feeling] - dt * 0.35);
            manager.setValue(feeling, feelings[feeling]);
          });
          manager.setValue("blink", feelings.happy > 0.5 ? 0 : Math.sin(blink * Math.PI));
        }
        vrm.update(dt);
      }
    },
    play,
    react() {
      const options = TAP_REACTIONS.filter((name) => name !== lastReaction && actions[name]);
      const choice = options[Math.floor(Math.random() * options.length)];
      if (!choice) return null;
      lastReaction = choice;
      play(choice);
      feelings.happy = 1;
      console.log(` 🎮 [companion] [tap] [${choice}]`);
      return choice;
    },
    dance() {
      for (let step = 0; step < DANCES.length; step += 1) {
        const name = DANCES[(danceIndex + step) % DANCES.length];
        if (actions[name]) {
          danceIndex = (danceIndex + step + 1) % DANCES.length;
          play(name, true);
          feelings.happy = 1;
          return name;
        }
      }
      return null;
    },
    feel(feeling, amount = 1) {
      (Object.keys(feelings) as CompanionFeeling[]).forEach((other) => {
        if (other !== feeling) feelings[other] = Math.min(feelings[other], 0.2);
      });
      feelings[feeling] = amount;
    },
    watch(point) {
      desiredLook.copy(point);
    },
    hit(raycaster) {
      return vrm ? raycaster.intersectObject(vrm.scene, true).length > 0 : false;
    },
    dispose() {
      disposed = true;
      scene.remove(lookTarget);
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
    },
  };
}
