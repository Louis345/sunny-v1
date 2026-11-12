import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { CapturedMonsterConfig } from "../../../src/shared/capturedMonsterCatalog";
import { decideCatch } from "../../../src/shared/creatureEncounters";
import type { Season, SkyMood } from "../../../src/shared/skyClock";
import { loadMixamoFbxRoot, retargetMixamoClipToVrm } from "../utils/mixamoRetarget";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

/**
 * Storybook prototype (owner, 2026-11-11): the orb catcher as a real 3D scene in Three.js, the engine the
 * Monster Math games use. Same rules underneath (her throws, the shake catch odds); only the stage is new:
 * a lit meadow that follows the sky clock and season, her companion standing in it, a glowing orb with a
 * real arc, an impact flash, the shakes, and a burst or a click.
 */

type Phase = "aim" | "flying" | "absorb" | "drop" | "shaking" | "caught" | "escape" | "away";

const SKY: Record<SkyMood, { top: string; bottom: string; sun: string; sunIntensity: number; hemi: number }> = {
  sunrise: { top: "#8fa8e8", bottom: "#ffc9a8", sun: "#ffb27a", sunIntensity: 1.6, hemi: 0.75 },
  day: { top: "#5fa7f2", bottom: "#cfe9ff", sun: "#fff6e0", sunIntensity: 2.4, hemi: 1 },
  golden: { top: "#7d8fd6", bottom: "#ffcf8a", sun: "#ffbf6b", sunIntensity: 1.9, hemi: 0.8 },
  twilight: { top: "#2b2d63", bottom: "#c56f8f", sun: "#ff9a8a", sunIntensity: 0.9, hemi: 0.5 },
  night: { top: "#070b22", bottom: "#24275a", sun: "#9fb2ff", sunIntensity: 0.55, hemi: 0.35 },
};
const GRASS: Record<Season, string> = {
  spring: "#6fbf5a", summer: "#5aae48", autumn: "#a7a24a", halloween: "#7f8a3f", holiday: "#e9eef5", winter: "#e3e9f2",
};
const LEAVES: Record<Season, string[]> = {
  spring: ["#ff9ec7", "#7ccf6a", "#5fbf5a"], summer: ["#3f9e3c", "#58b04a", "#2f8a3a"],
  autumn: ["#e07b2a", "#c9481f", "#f2b33d"], halloween: ["#e0662a", "#8a3fb0", "#c9481f"],
  holiday: ["#2f7a4a", "#e9eef5", "#2f6a40"], winter: ["#dfe8f2", "#c8d6e6", "#2f6a40"],
};
const FLIGHT_S = 0.85;
const SHAKE_S = 0.7;
const MAX_TRAIL = 22;

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function orbTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const top = ctx.createLinearGradient(0, 0, 0, 64);
  top.addColorStop(0, "#ff7a6b");
  top.addColorStop(1, "#ff3d6e");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#e9fbff";
  ctx.fillRect(0, 64, 256, 64);
  ctx.fillStyle = "#1b1f3a";
  ctx.fillRect(0, 58, 256, 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface OrbCatcher3DProps {
  creature: CapturedMonsterConfig;
  throws: number;
  timeOfDay: SkyMood;
  season: Season;
  companionVrmUrl?: string;
  /** Demo control: fix the catch roll (0 always catches, 0.99 always breaks free). */
  roll?: () => number;
  onResult?: (outcome: "caught" | "escaped") => void;
}

export function OrbCatcher3D({ creature, throws, timeOfDay, season, companionVrmUrl, roll, onResult }: OrbCatcher3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [throwsLeft, setThrowsLeft] = useState(throws);
  const [banner, setBanner] = useState<string | null>("Pull the orb back and let go!");
  const [webgl, setWebgl] = useState(true);
  const throwsRef = useRef(throws);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const rollRef = useRef(roll);
  rollRef.current = roll;

  useEffect(() => {
    throwsRef.current = throws;
    setThrowsLeft(throws);
  }, [throws]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (error) {
      console.warn(" 🎮 [orb-3d] [webgl] [unavailable]", error);
      setWebgl(false);
      return;
    }
    const sky = SKY[timeOfDay];
    const night = timeOfDay === "night" || timeOfDay === "twilight";
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color(sky.bottom), 18, 60);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    const cameraHome = new THREE.Vector3(0, 2.1, 7.4);
    camera.position.copy(cameraHome);
    camera.lookAt(0, 1.1, 0);

    // Sky dome: a gradient that follows the shared sky clock.
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(sky.top) }, bottom: { value: new THREE.Color(sky.bottom) } },
      vertexShader: "varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y * 1.4 + 0.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }",
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMaterial));
    if (night) {
      const starGeometry = new THREE.BufferGeometry();
      const starPositions = new Float32Array(600 * 3);
      for (let index = 0; index < 600; index += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.45;
        starPositions.set([80 * Math.sin(phi) * Math.cos(theta), 80 * Math.cos(phi), 80 * Math.sin(phi) * Math.sin(theta)], index * 3);
      }
      starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#ffffff", size: 0.35, fog: false })));
    }

    scene.add(new THREE.HemisphereLight(new THREE.Color(sky.top), new THREE.Color(GRASS[season]), sky.hemi));
    const sun = new THREE.DirectionalLight(new THREE.Color(sky.sun), sky.sunIntensity);
    sun.position.set(-6, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);

    // Meadow: ground, soft hills, trees in the season's colours, flowers.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshStandardMaterial({ color: GRASS[season], roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const hillMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(GRASS[season]).offsetHSL(0, 0, -0.06), roughness: 1 });
    [[-14, -22, 9], [10, -26, 12], [26, -18, 8], [-28, -16, 7]].forEach(([x, z, r]) => {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), hillMaterial);
      hill.scale.y = 0.35;
      hill.position.set(x, 0, z);
      scene.add(hill);
    });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 1 });
    const leafMaterials = LEAVES[season].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }));
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 1.3 - Math.PI * 1.15;
      const radius = 9 + (index % 4) * 3.5;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 8), trunkMaterial);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(
        index % 3 === 0 ? new THREE.ConeGeometry(1.2, 2.8, 8) : new THREE.IcosahedronGeometry(1.25, 0),
        leafMaterials[index % leafMaterials.length],
      );
      crown.position.y = index % 3 === 0 ? 2.6 : 2.2;
      crown.castShadow = true;
      tree.add(trunk, crown);
      tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 3);
      tree.scale.setScalar(0.8 + (index % 5) * 0.12);
      scene.add(tree);
    }
    const flowerColors = ["#ff8fb8", "#ffd84d", "#ffffff", "#b58cff"];
    for (let index = 0; index < 60; index += 1) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: flowerColors[index % 4], emissive: night ? flowerColors[index % 4] : "#000000", emissiveIntensity: night ? 0.4 : 0 }));
      flower.position.set((Math.random() - 0.5) * 16, 0.06, (Math.random() - 0.5) * 10 - 1);
      scene.add(flower);
    }

    // Weather that matches the season (and fireflies on summer nights).
    const weatherCount = season === "summer" && !night ? 0 : 140;
    const weatherGeometry = new THREE.BufferGeometry();
    const weatherPositions = new Float32Array(weatherCount * 3);
    for (let index = 0; index < weatherCount; index += 1) weatherPositions.set([(Math.random() - 0.5) * 20, Math.random() * 9, (Math.random() - 0.5) * 12 - 1], index * 3);
    weatherGeometry.setAttribute("position", new THREE.BufferAttribute(weatherPositions, 3));
    const weatherColor = season === "winter" || season === "holiday" ? "#ffffff" : season === "spring" ? "#ffc3d8" : season === "summer" ? "#fff59a" : "#e07b2a";
    const weather = new THREE.Points(weatherGeometry, new THREE.PointsMaterial({ color: weatherColor, size: season === "summer" ? 0.14 : 0.1, transparent: true, opacity: 0.9, map: radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), depthWrite: false, blending: season === "summer" ? THREE.AdditiveBlending : THREE.NormalBlending }));
    scene.add(weather);

    // The creature: her art as a lit billboard (until each species has a 3D model).
    const creatureHome = new THREE.Vector3(0.4, 1.25, -1.2);
    const creatureMaterial = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    if (creature.placeholderHue) creatureMaterial.color.setHSL(creature.placeholderHue / 360, 0.55, 0.78);
    new THREE.TextureLoader().load(creature.imageSrc, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      creatureMaterial.map = texture;
      creatureMaterial.needsUpdate = true;
    });
    const creatureSprite = new THREE.Sprite(creatureMaterial);
    creatureSprite.position.copy(creatureHome);
    const creatureSize = 2.3;
    creatureSprite.scale.set(creatureSize, creatureSize, 1);
    scene.add(creatureSprite);
    const creatureShadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false }));
    creatureShadow.rotation.x = -Math.PI / 2;
    creatureShadow.position.set(creatureHome.x, 0.01, creatureHome.z);
    scene.add(creatureShadow);
    const auraColor = { common: "#d8c3a5", rare: "#4fa3ff", epic: "#b46bff", legendary: "#ffc93c" }[creature.rarity];
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(auraColor, "rgba(0,0,0,0)"), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.copy(creatureHome).add(new THREE.Vector3(0, 0, -0.3));
    aura.scale.set(3.4, 3.4, 1);
    scene.add(aura);

    // The orb: a glowing two-tone ball with its own light and a trail.
    const orbRest = new THREE.Vector3(0, 0.9, 3.9);
    const orb = new THREE.Group();
    const orbBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), new THREE.MeshStandardMaterial({ map: orbTexture(), roughness: 0.25, metalness: 0.1, emissive: new THREE.Color("#ff6a8a"), emissiveIntensity: 0.25 }));
    orbBall.castShadow = true;
    const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture("rgba(255,214,120,1)", "rgba(255,214,120,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    orbGlow.scale.set(0.9, 0.9, 1);
    const orbLight = new THREE.PointLight("#ffd27a", 2, 4);
    orb.add(orbBall, orbGlow, orbLight);
    orb.position.copy(orbRest);
    scene.add(orb);
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(MAX_TRAIL * 3);
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    const trail = new THREE.Points(trailGeometry, new THREE.PointsMaterial({ color: "#ffe28a", size: 0.22, map: radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(trail);
    const trailPoints: THREE.Vector3[] = [];

    // Aim preview: dots along the predicted arc while she pulls back.
    const previewGeometry = new THREE.BufferGeometry();
    previewGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    const preview = new THREE.Points(previewGeometry, new THREE.PointsMaterial({ color: "#ffffff", size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
    preview.visible = false;
    scene.add(preview);

    // Bursts: one shared particle cloud reused for the impact, the break-free and the click.
    const burstCount = 90;
    const burstGeometry = new THREE.BufferGeometry();
    const burstPositions = new Float32Array(burstCount * 3);
    const burstVelocities: THREE.Vector3[] = Array.from({ length: burstCount }, () => new THREE.Vector3());
    burstGeometry.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));
    const burstMaterial = new THREE.PointsMaterial({ color: "#ffffff", size: 0.16, map: radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    scene.add(new THREE.Points(burstGeometry, burstMaterial));
    let burstAge = 99;
    const burst = (at: THREE.Vector3, color: string, speed: number) => {
      burstMaterial.color.set(color);
      burstAge = 0;
      for (let index = 0; index < burstCount; index += 1) {
        burstPositions.set([at.x, at.y, at.z], index * 3);
        burstVelocities[index].set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      }
    };
    const flash = new THREE.PointLight("#ffffff", 0, 9);
    scene.add(flash);

    // Her companion standing in the meadow, with her real idle, cheer and groan.
    let vrm: VRM | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions: Record<string, THREE.AnimationAction> = {};
    const playAction = (name: string, loop = true) => {
      const next = actions[name];
      if (!next || !mixer) return;
      Object.values(actions).forEach((action) => action !== next && action.fadeOut(0.3));
      next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).fadeIn(0.3).play();
      next.clampWhenFinished = !loop;
    };
    let disposed = false;
    if (companionVrmUrl) {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      loader
        .loadAsync(companionVrmUrl)
        .then(async (gltf) => {
          if (disposed) return;
          const loaded = gltf.userData.vrm as VRM | undefined;
          if (!loaded) return;
          VRMUtils.rotateVRM0(loaded);
          vrm = loaded;
          loaded.scene.position.set(-2.3, 0, 0.9);
          loaded.scene.rotation.y = 0.45; // faces her, turned toward the creature
          loaded.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) child.castShadow = true;
          });
          scene.add(loaded.scene);
          mixer = new THREE.AnimationMixer(loaded.scene);
          for (const name of ["idle", "dance_victory", "defeated", "shrug"]) {
            try {
              const root = await loadMixamoFbxRoot(`/animations/${name}.fbx`);
              const raw = root.animations.find((clip) => clip.tracks.length > 0);
              const clip = raw ? retargetMixamoClipToVrm(raw, root, loaded) : null;
              if (clip && mixer) actions[name] = mixer.clipAction(clip);
            } catch (error) {
              console.warn(` 🎮 [orb-3d] [companion-animation] [skipped] name=${name}`, error);
            }
          }
          playAction("idle");
          console.log(" 🎮 [orb-3d] [companion] [ready]");
        })
        .catch((error: unknown) => console.warn(" 🎮 [orb-3d] [companion] [unavailable]", error));
    }

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), night ? 0.9 : 0.35, 0.5, night ? 0.6 : 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const width = mount.clientWidth || 800;
      const height = mount.clientHeight || 600;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloom.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // ---------------- play ----------------
    let phase: Phase = "aim";
    let phaseTime = 0;
    let aiming = false;
    const pull = new THREE.Vector2();
    let pointerStart = new THREE.Vector2();
    let flight = { start: orbRest.clone(), end: creatureHome.clone(), peak: 2.4, swing: 0, spin: 10, duration: FLIGHT_S, direct: false };
    let verdict = { caught: true, shakes: 3 as 1 | 2 | 3 };
    let shakeDone = 0;
    let cameraKick = 0;

    const toScreen = (point: THREE.Vector3) => {
      const projected = point.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((projected.x + 1) / 2) * rect.width + rect.left, ((1 - projected.y) / 2) * rect.height + rect.top);
    };
    const setPhase = (next: Phase) => {
      phase = next;
      phaseTime = 0;
    };
    const flightFor = (strength: number, side: number) => {
      const clamped = Math.max(0, Math.min(1.3, strength));
      return {
        start: orbRest.clone(),
        end: creatureHome.clone().add(new THREE.Vector3(0, -0.15, 0.2)),
        peak: 1.6 + clamped * 1.6,
        swing: Math.max(-2.2, Math.min(2.2, side * 2.4)),
        spin: 8 + clamped * 10,
        duration: FLIGHT_S * (1.15 - 0.3 * clamped),
        direct: clamped > 0.55 && Math.abs(side) < 0.18,
      };
    };
    const arcPoint = (plan: typeof flight, u: number, out: THREE.Vector3) =>
      out.copy(plan.start).lerp(plan.end, u).add(new THREE.Vector3(plan.swing * Math.sin(Math.PI * u), plan.peak * 4 * u * (1 - u), 0));

    const onDown = (event: PointerEvent) => {
      if (phase !== "aim") return;
      const orbScreen = toScreen(orb.position);
      if (Math.hypot(event.clientX - orbScreen.x, event.clientY - orbScreen.y) > 110) return;
      aiming = true;
      pointerStart = new THREE.Vector2(event.clientX, event.clientY);
      pull.set(0, 0);
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the browser no longer tracks cannot be captured; aiming still works.
      }
      playSparkOrbSfx("grab");
    };
    const onMove = (event: PointerEvent) => {
      if (!aiming) return;
      pull.set(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    };
    const onUp = () => {
      if (!aiming) return;
      aiming = false;
      preview.visible = false;
      // Pulling back (down) or flicking up both throw; any tap still throws.
      const strength = Math.max(0.35, Math.abs(pull.y) / 180);
      const side = -pull.x / 260;
      flight = flightFor(strength, side);
      verdict = decideCatch({ rarity: creature.rarity, hitQuality: flight.direct ? "direct" : "near", roll: rollRef.current });
      console.log(` 🎮 [orb-3d] [throw] [released] strength=${strength.toFixed(2)} direct=${flight.direct} caught=${verdict.caught} shakes=${verdict.shakes}`);
      trailPoints.length = 0;
      playSparkOrbSfx("launch");
      setBanner(null);
      setPhase("flying");
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    const clock = new THREE.Clock();
    const scratch = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      phaseTime += dt;
      mixer?.update(dt);
      vrm?.update(dt);

      // Weather drifts down (fireflies wander).
      for (let index = 0; index < weatherCount; index += 1) {
        const y = weatherPositions[index * 3 + 1] - dt * (season === "summer" ? 0.05 : 0.6);
        weatherPositions[index * 3] += Math.sin(time + index) * dt * 0.25;
        weatherPositions[index * 3 + 1] = y < 0 ? 9 : y;
      }
      weatherGeometry.attributes.position.needsUpdate = true;

      // Creature idle life: bob and breathe while she is out.
      if (phase === "aim" || phase === "flying") {
        const bob = Math.sin(time * 2.2) * 0.08;
        creatureSprite.position.set(creatureHome.x, creatureHome.y + bob, creatureHome.z);
        creatureSprite.scale.set(creatureSize * (1 + Math.sin(time * 2.2 + 1.6) * 0.03), creatureSize * (1 - Math.sin(time * 2.2 + 1.6) * 0.03), 1);
        aura.material.opacity = 0.22 + Math.sin(time * 1.6) * 0.08;
      }

      if (phase === "aim") {
        orb.position.copy(orbRest).add(new THREE.Vector3(Math.sin(time * 1.8) * 0.02, Math.sin(time * 2.6) * 0.04, 0));
        if (aiming) {
          orb.position.add(new THREE.Vector3(Math.max(-0.6, Math.min(0.6, pull.x / 300)), Math.max(-0.4, Math.min(0.4, -pull.y / 400)), Math.min(0.6, Math.abs(pull.y) / 300)));
          const plan = flightFor(Math.max(0.35, Math.abs(pull.y) / 180), -pull.x / 260);
          const positions = previewGeometry.attributes.position.array as Float32Array;
          for (let index = 0; index < 16; index += 1) {
            arcPoint(plan, index / 15, scratch);
            positions.set([scratch.x, scratch.y, scratch.z], index * 3);
          }
          previewGeometry.attributes.position.needsUpdate = true;
          preview.visible = true;
        }
        orbBall.rotation.y += dt * 0.8;
      } else if (phase === "flying") {
        const u = Math.min(1, phaseTime / flight.duration);
        arcPoint(flight, u, orb.position);
        orbBall.rotation.x -= dt * flight.spin;
        orb.scale.setScalar(1 - u * 0.35);
        trailPoints.unshift(orb.position.clone());
        if (trailPoints.length > MAX_TRAIL) trailPoints.pop();
        if (u >= 1) {
          flash.position.copy(orb.position);
          flash.intensity = 40;
          cameraKick = 0.35;
          burst(orb.position, "#fff3b0", 3.2);
          playSparkOrbSfx("impact");
          if (flight.direct) {
            playSparkOrbSfx("perfect");
            setBanner("Perfect!");
          }
          setPhase("absorb");
        }
      } else if (phase === "absorb") {
        const k = Math.min(1, phaseTime / 0.6);
        creatureSprite.position.lerpVectors(creatureHome, orb.position, k);
        creatureSprite.scale.set(creatureSize * (1 - k), creatureSize * (1 - k), 1);
        creatureMaterial.opacity = 1 - k * 0.3;
        aura.material.opacity = 0.6 * (1 - k);
        orbGlow.scale.setScalar(1.3 + k * 1.2);
        if (k >= 1) {
          creatureSprite.visible = false;
          playSparkOrbSfx("captureShrink");
          setPhase("drop");
        }
      } else if (phase === "drop") {
        const k = Math.min(1, phaseTime / 0.45);
        orb.position.y = THREE.MathUtils.lerp(orb.position.y, 0.2, k);
        orbGlow.scale.setScalar(1.3);
        if (k >= 1) {
          orb.position.y = 0.2;
          shakeDone = 0;
          setPhase("shaking");
        }
      } else if (phase === "shaking") {
        const shakeIndex = Math.floor(phaseTime / SHAKE_S);
        const within = (phaseTime % SHAKE_S) / SHAKE_S;
        if (shakeIndex >= verdict.shakes) {
          orb.rotation.z = 0;
          if (verdict.caught) {
            burst(orb.position, auraColor, 2.4);
            flash.intensity = 25;
            playSparkOrbSfx("captureLock");
            playSparkOrbSfx("collected");
            setBanner(`Gotcha! ${creature.speciesName} joined your den!`);
            playAction("dance_victory", false);
            setPhase("caught");
          } else {
            creatureSprite.visible = true;
            creatureMaterial.opacity = 1;
            burst(orb.position, "#ffffff", 3.6);
            flash.intensity = 12;
            cameraKick = 0.25;
            playSparkOrbSfx("chirp");
            playAction("shrug", false);
            setPhase("escape");
          }
        } else {
          if (shakeIndex >= shakeDone) {
            shakeDone = shakeIndex + 1;
            playSparkOrbSfx("grab");
          }
          orb.rotation.z = Math.sin(within * Math.PI * 2) * 0.45 * (1 - within);
          orbLight.intensity = 2 + Math.sin(within * Math.PI) * 3;
        }
      } else if (phase === "escape") {
        const k = Math.min(1, phaseTime / 0.6);
        const pop = k < 0.7 ? k / 0.7 : 1 + 0.15 * Math.sin((k - 0.7) * Math.PI * 3);
        creatureSprite.position.lerpVectors(orb.position, creatureHome, Math.min(1, k * 1.4));
        creatureSprite.scale.set(creatureSize * pop, creatureSize * pop, 1);
        orb.scale.setScalar(Math.max(0.01, 0.65 * (1 - k)));
        if (k >= 1) {
          throwsRef.current -= 1;
          setThrowsLeft(throwsRef.current);
          if (throwsRef.current <= 0) {
            setBanner(`${creature.speciesName} got away!`);
            playSparkOrbSfx("miss");
            playAction("defeated", false);
            setPhase("away");
          } else {
            setBanner("It broke free! Try again!");
            orb.scale.setScalar(1);
            orb.rotation.set(0, 0, 0);
            orb.position.copy(orbRest);
            orbGlow.scale.setScalar(1.3);
            trailPoints.length = 0;
            playAction("idle");
            setPhase("aim");
          }
        }
      } else if (phase === "caught") {
        orb.position.y = 0.2 + Math.abs(Math.sin(phaseTime * 3)) * 0.12 * Math.max(0, 1 - phaseTime / 2);
        orbLight.intensity = 3 + Math.sin(phaseTime * 6) * 1.5;
        if (phaseTime > 2.2 && phaseTime - dt <= 2.2) onResultRef.current?.("caught");
      } else if (phase === "away") {
        creatureSprite.position.x += dt * 4;
        creatureSprite.position.z -= dt * 3;
        creatureMaterial.opacity = Math.max(0, 1 - phaseTime / 1.2);
        aura.material.opacity = 0;
        if (phaseTime > 1.4 && phaseTime - dt <= 1.4) onResultRef.current?.("escaped");
      }

      // Trail, bursts, flash and the camera kick.
      for (let index = 0; index < MAX_TRAIL; index += 1) {
        const point = trailPoints[index] ?? orb.position;
        trailPositions.set([point.x, point.y, point.z], index * 3);
      }
      trailGeometry.attributes.position.needsUpdate = true;
      (trail.material as THREE.PointsMaterial).opacity = phase === "flying" ? 0.9 : Math.max(0, (trail.material as THREE.PointsMaterial).opacity - dt * 2);
      if (burstAge < 1.2) {
        burstAge += dt;
        for (let index = 0; index < burstCount; index += 1) {
          burstVelocities[index].y -= dt * 2.5;
          burstPositions[index * 3] += burstVelocities[index].x * dt;
          burstPositions[index * 3 + 1] += burstVelocities[index].y * dt;
          burstPositions[index * 3 + 2] += burstVelocities[index].z * dt;
        }
        burstGeometry.attributes.position.needsUpdate = true;
        burstMaterial.opacity = Math.max(0, 1 - burstAge / 1.2);
      }
      flash.intensity = Math.max(0, flash.intensity - dt * 90);
      cameraKick = Math.max(0, cameraKick - dt);
      camera.position.copy(cameraHome).add(new THREE.Vector3((Math.random() - 0.5) * cameraKick * 0.3, (Math.random() - 0.5) * cameraKick * 0.3, 0));
      camera.lookAt(0, 1.1, 0);

      composer.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    console.log(` 🎮 [orb-3d] [scene] [ready] creature=${creature.id} sky=${timeOfDay} season=${season}`);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      composer.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      console.log(" 🎮 [orb-3d] [scene] [disposed]");
    };
  }, [creature, timeOfDay, season, companionVrmUrl]);

  const rarityName = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" }[creature.rarity];
  return (
    <div data-testid="orb-catcher-3d" style={{ position: "relative", width: "100%", height: "100%", minHeight: 520, overflow: "hidden", background: "#0b0820", fontFamily: "Lexend, system-ui, sans-serif" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {!webgl ? <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "white", fontWeight: 800 }}>3D is not available on this screen.</p> : null}
      <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", textAlign: "center", color: "white", pointerEvents: "none", textShadow: "0 2px 10px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 32, fontWeight: 950 }}>{creature.speciesName}</div>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".18em" }}>{rarityName.toUpperCase()}</div>
      </div>
      <div data-testid="orb-3d-throws" style={{ position: "absolute", bottom: 18, left: 18, display: "flex", gap: 6, pointerEvents: "none" }}>
        {Array.from({ length: throws }, (_, index) => (
          <span key={index} style={{ width: 18, height: 18, borderRadius: "50%", background: index < throwsLeft ? "radial-gradient(circle at 35% 35%, #ffd2a8, #ff3d6e)" : "rgba(255,255,255,.2)", boxShadow: index < throwsLeft ? "0 0 10px #ff7a6b" : "none" }} />
        ))}
      </div>
      {banner ? (
        <div style={{ position: "absolute", bottom: 64, left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 999, background: "rgba(15,23,42,.72)", color: "#ffe680", fontWeight: 900, fontSize: 18, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {banner}
        </div>
      ) : null}
    </div>
  );
}
