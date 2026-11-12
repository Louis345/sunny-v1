import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { CapturedMonsterConfig } from "../../../src/shared/capturedMonsterCatalog";
import { eggReadyToHatch, proveEggItem, type CreatureEgg } from "../../../src/shared/creatureEncounters";
import type { Season, SkyMood } from "../../../src/shared/skyClock";
import { SKY, buildMeadow } from "./orbMeadowScenery";
import { OrbAudio } from "./orbAudio";
import { loadCompanion } from "./orbCompanion";
import { MEADOW_PACK, type OrbThemePack } from "./orbThemePacks";
import { MusicButton, QuestionCard, readMusicPref, type OrbQuestion } from "./OrbCatcher3D";

/**
 * Storybook prototype (owner, 2026-11-11): practice catches the creature, mastery hatches it. The caught
 * creature waits in her den as an egg holding the items she drilled. On a later day she answers them with no
 * help; each one she still knows cracks the shell and lets light out. When every item is proven the egg
 * hatches and the creature becomes her pet. A miss never hurts the egg: it just has not cracked yet.
 */

type Phase = "waiting" | "hatching" | "pet";

export interface EggHatch3DProps {
  creature: CapturedMonsterConfig;
  /** The drilled items the egg holds (the same questions the orb drill used). */
  items: OrbQuestion[];
  /** The day the drill happened (YYYY-MM-DD). */
  drilledOn: string;
  /** Items already proven on an earlier check. */
  proven?: string[];
  /** The day of the check she is doing now (YYYY-MM-DD). The Storybook control stands in for tomorrow. */
  today: string;
  theme?: OrbThemePack;
  timeOfDay: SkyMood;
  season: Season;
  companionVrmUrl?: string;
  onHatched?: () => void;
}

/** A soft egg outline turned on a lathe: wider at the bottom, rounder at the top. */
function eggGeometry(): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [];
  for (let index = 0; index <= 40; index += 1) {
    const t = index / 40;
    const y = -Math.cos(Math.PI * t) * 0.72;
    const radius = Math.sin(Math.PI * t) * 0.56 * (1 - 0.16 * Math.max(0, y / 0.72));
    points.push(new THREE.Vector2(Math.max(0.0001, radius), y));
  }
  return new THREE.LatheGeometry(points, 48);
}

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/** Shell colour, spots, and the cracks (also drawn into the glow map so light leaks out of them). */
function paintEgg(base: HTMLCanvasElement, glow: HTMLCanvasElement, hue: number, cracks: number) {
  const ctx = base.getContext("2d")!;
  const { width, height } = base;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `hsl(${hue} 70% 92%)`);
  gradient.addColorStop(1, `hsl(${hue} 55% 74%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const spots = seeded(hue + 7);
  for (let index = 0; index < 26; index += 1) {
    ctx.fillStyle = `hsla(${(hue + 40) % 360} 65% 60% / .55)`;
    ctx.beginPath();
    ctx.ellipse(spots() * width, height * 0.2 + spots() * height * 0.65, 10 + spots() * 26, 8 + spots() * 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const glowCtx = glow.getContext("2d")!;
  glowCtx.fillStyle = "#000";
  glowCtx.fillRect(0, 0, width, height);
  for (let crack = 0; crack < cracks; crack += 1) {
    const random = seeded(crack * 131 + 17);
    // Each crack starts near the middle band and zigzags; drawn twice so it wraps around the egg.
    const startX = ((crack * 0.37 + 0.1) % 1) * width;
    const path: Array<[number, number]> = [[startX, height * (0.38 + random() * 0.2)]];
    for (let step = 0; step < 9; step += 1) {
      const [x, y] = path[path.length - 1];
      path.push([x + 14 + random() * 22, y + (random() - 0.5) * 46]);
    }
    for (const offset of [0, -width]) {
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 5;
      glowCtx.strokeStyle = "#ffe9a8";
      glowCtx.lineWidth = 9;
      for (const context of [ctx, glowCtx]) {
        context.beginPath();
        path.forEach(([x, y], index) => (index ? context.lineTo(x + offset, y) : context.moveTo(x + offset, y)));
        context.stroke();
      }
    }
  }
}

export function EggHatch3D({ creature, items, drilledOn, proven = [], today, theme = MEADOW_PACK, timeOfDay, season, companionVrmUrl, onHatched }: EggHatch3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [egg, setEgg] = useState<CreatureEgg>({ itemIds: items.map((item) => item.id), drilledOn, proven });
  const eggRef = useRef(egg);
  eggRef.current = egg;
  const [checking, setChecking] = useState<OrbQuestion[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [phase, setPhaseState] = useState<Phase>(eggReadyToHatch(egg) ? "hatching" : "waiting");
  const [banner, setBanner] = useState<string | null>(null);
  const [webgl, setWebgl] = useState(true);
  const audioRef = useRef<OrbAudio | null>(null);
  const musicOnRef = useRef(readMusicPref());
  // The scene reads these each frame.
  const cracksRef = useRef(egg.proven.length);
  cracksRef.current = egg.proven.length;
  const wobbleRef = useRef(0);
  const hatchRef = useRef(false);
  const elliRef = useRef<ReturnType<typeof loadCompanion> | null>(null);
  const onHatchedRef = useRef(onHatched);
  onHatchedRef.current = onHatched;

  const startCheck = () => {
    const open = items.filter((item) => !egg.proven.includes(item.id));
    console.log(` 🎮 [egg] [check] [started] items=${open.length} today=${today} drilledOn=${drilledOn}`);
    if (today <= drilledOn) setBanner("The egg needs a day to rest. Come back tomorrow!");
    setChecking(open);
    setFeedback(null);
    audioRef.current?.say("This one is just you. Ready? Go!");
  };

  const answerCheck = (question: OrbQuestion, given: string) => {
    const audio = audioRef.current;
    const right = given.trim().toLowerCase() === question.answer.trim().toLowerCase();
    const result = proveEggItem(eggRef.current, { itemId: question.id, right, hinted: false, on: today });
    console.log(` 🎮 [egg] [check] [${result.reason}] id=${question.id}`);
    if (result.counted) {
      setEgg(result.egg);
      wobbleRef.current = 1;
      audio?.play("takedown", { volume: 0.55, rate: 1.4 });
      audio?.play(theme.cues.correct, { volume: 0.6 });
      elliRef.current?.feel("happy");
      setFeedback(null);
    } else {
      // A miss never hurts the egg. It just stays as it is, and the word goes back into practice.
      wobbleRef.current = 0.3;
      elliRef.current?.feel("relaxed");
      if (result.reason === "not-yet") audio?.say("Not yet. We'll practice that one more.");
      setFeedback(result.reason === "not-yet" ? "Not yet. More practice!" : null);
    }
    const rest = (checking ?? []).slice(1);
    if (rest.length) {
      setChecking(rest);
      return;
    }
    setChecking(null);
    if (eggReadyToHatch(result.egg)) {
      hatchRef.current = true;
      setPhaseState("hatching");
      setBanner(null);
    } else {
      setBanner(null);
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (error) {
      console.warn(" 🎮 [egg] [webgl] [unavailable]", error);
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
    const audio = new OrbAudio(theme.sounds);
    audioRef.current = audio;
    audio.setMusic(musicOnRef.current);
    void audio.load().then(() => theme.beds.forEach((bed) => audio.loop(bed.key, bed.volume * 0.8)));
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    const cameraHome = new THREE.Vector3(0, 2.1, 6.4);
    const meadow = buildMeadow(scene, { timeOfDay, season });
    scene.add(new THREE.HemisphereLight(new THREE.Color(sky.top), new THREE.Color("#4f7a3a"), sky.hemi));
    const sun = new THREE.DirectionalLight(new THREE.Color(sky.sun), sky.sunIntensity);
    sun.position.set(-6, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const nestAt = new THREE.Vector3(0.3, 0, -0.4);
    const decorUpdate = theme.decorate(scene, nestAt.clone().setY(1.2));

    // The nest: a ring of straw with soft moss inside.
    const nest = new THREE.Group();
    const straw = new THREE.MeshStandardMaterial({ color: "#c79a52", roughness: 0.9 });
    nest.add(new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.22, 12, 40), straw).rotateX(Math.PI / 2));
    const strands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), new THREE.MeshStandardMaterial({ color: "#e0b768", roughness: 0.9 }), 160);
    const strandMatrix = new THREE.Matrix4();
    const strandRandom = seeded(5);
    for (let index = 0; index < 160; index += 1) {
      const angle = strandRandom() * Math.PI * 2;
      const radius = 0.62 + strandRandom() * 0.34;
      strandMatrix.compose(
        new THREE.Vector3(Math.cos(angle) * radius, 0.1 + strandRandom() * 0.15, Math.sin(angle) * radius),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (strandRandom() - 0.5) * 0.8, 0, angle + Math.PI / 2 + (strandRandom() - 0.5) * 0.6)),
        new THREE.Vector3(1, 1, 1),
      );
      strands.setMatrixAt(index, strandMatrix);
    }
    nest.add(strands);
    const moss = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), new THREE.MeshStandardMaterial({ color: "#5d8a3c", roughness: 1 }));
    moss.rotation.x = -Math.PI / 2;
    moss.position.y = 0.04;
    nest.add(moss);
    nest.position.copy(nestAt);
    nest.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) child.receiveShadow = true;
    });
    scene.add(nest);

    // The egg, painted in the creature's colours; cracks glow from inside as she proves each item.
    const hue = creature.placeholderHue ?? { common: 35, rare: 210, epic: 275, legendary: 45 }[creature.rarity];
    const baseCanvas = document.createElement("canvas");
    const glowCanvas = document.createElement("canvas");
    baseCanvas.width = glowCanvas.width = 512;
    baseCanvas.height = glowCanvas.height = 256;
    const baseTexture = new THREE.CanvasTexture(baseCanvas);
    baseTexture.colorSpace = THREE.SRGBColorSpace;
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    let paintedCracks = -1;
    const repaint = (cracks: number) => {
      paintEgg(baseCanvas, glowCanvas, hue, cracks);
      baseTexture.needsUpdate = true;
      glowTexture.needsUpdate = true;
      paintedCracks = cracks;
    };
    const eggMaterial = new THREE.MeshStandardMaterial({ map: baseTexture, emissiveMap: glowTexture, emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 0, roughness: 0.45 });
    const eggMesh = new THREE.Mesh(eggGeometry(), eggMaterial);
    eggMesh.castShadow = true;
    const eggPivot = new THREE.Group();
    eggMesh.position.y = 0.72;
    eggPivot.add(eggMesh);
    eggPivot.position.copy(nestAt).setY(0.06);
    scene.add(eggPivot);
    const eggLight = new THREE.PointLight("#ffd27a", 0, 4);
    eggLight.position.set(0, 0.8, 0.4);
    eggPivot.add(eggLight);

    // Light shafts that grow out of the egg as it hatches.
    const beams = new THREE.Group();
    const beamMaterial = new THREE.MeshBasicMaterial({ color: "#fff2b8", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let index = 0; index < 8; index += 1) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.18, 3.2, 8, 1, true), beamMaterial);
      beam.position.y = 1.6;
      beam.rotation.z = (index / 8) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.add(beam);
      holder.rotation.y = (index / 8) * Math.PI;
      beams.add(holder);
    }
    beams.position.copy(nestAt).setY(0.8);
    beams.scale.setScalar(0.01);
    scene.add(beams);

    // Shell pieces that fly when it breaks open.
    const shards: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; spin: THREE.Vector3 }> = [];
    for (let index = 0; index < 18; index += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4, 0, 1.4, 0, 1.2), new THREE.MeshStandardMaterial({ map: baseTexture, side: THREE.DoubleSide, roughness: 0.5 }));
      mesh.visible = false;
      scene.add(mesh);
      shards.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3() });
    }

    // Sparkles for the hatch and for petting.
    const sparkleCount = 120;
    const sparkleGeometry = new THREE.BufferGeometry();
    const sparklePositions = new Float32Array(sparkleCount * 3);
    const sparkleVelocities = Array.from({ length: sparkleCount }, () => new THREE.Vector3());
    sparkleGeometry.setAttribute("position", new THREE.BufferAttribute(sparklePositions, 3));
    const sparkleCanvas = document.createElement("canvas");
    sparkleCanvas.width = sparkleCanvas.height = 64;
    const sparkleCtx = sparkleCanvas.getContext("2d")!;
    const sparkleGradient = sparkleCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sparkleGradient.addColorStop(0, "rgba(255,255,255,1)");
    sparkleGradient.addColorStop(1, "rgba(255,255,255,0)");
    sparkleCtx.fillStyle = sparkleGradient;
    sparkleCtx.fillRect(0, 0, 64, 64);
    const sparkleMaterial = new THREE.PointsMaterial({ size: 0.16, map: new THREE.CanvasTexture(sparkleCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    scene.add(new THREE.Points(sparkleGeometry, sparkleMaterial));
    let sparkleAge = 99;
    const sparkle = (at: THREE.Vector3, color: string, speed: number, count = sparkleCount) => {
      sparkleMaterial.color.set(color);
      sparkleAge = 0;
      for (let index = 0; index < sparkleCount; index += 1) {
        sparklePositions.set(index < count ? [at.x, at.y, at.z] : [0, -50, 0], index * 3);
        sparkleVelocities[index].set(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      }
    };

    // The creature, hidden until it hatches, then her pet: it hops around the nest and loves a tap.
    const petMaterial = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    if (creature.placeholderHue) petMaterial.color.setHSL(creature.placeholderHue / 360, 0.55, 0.78);
    new THREE.TextureLoader().load(creature.imageSrc, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      petMaterial.map = texture;
      petMaterial.needsUpdate = true;
    });
    const pet = new THREE.Sprite(petMaterial);
    const petSize = 1.7;
    pet.visible = false;
    scene.add(pet);
    const petShadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.2, depthWrite: false }));
    petShadow.rotation.x = -Math.PI / 2;
    petShadow.visible = false;
    scene.add(petShadow);
    let petHop = 0;
    let petAngle = 0;

    const elli = loadCompanion(scene, companionVrmUrl, { position: new THREE.Vector3(-2.2, 0, 0.9), rotationY: 0.5 });
    elliRef.current = elli;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), night ? 0.9 : 0.4, 0.5, night ? 0.6 : 0.88);
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

    let phase: Phase = hatchRef.current ? "hatching" : eggReadyToHatch(eggRef.current) ? "hatching" : "waiting";
    let phaseTime = 0;
    let cameraKick = 0;
    const setPhase = (next: Phase) => {
      phase = next;
      phaseTime = 0;
      setPhaseState(next);
    };

    const raycaster = new THREE.Raycaster();
    const onDown = (event: PointerEvent) => {
      audio.resume();
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
      if (elli.hit(raycaster)) {
        if (elli.react()) audio.play("giggle" in theme.sounds ? "giggle" : "pop", { volume: 0.5 });
        return;
      }
      if (phase === "waiting" && raycaster.intersectObject(eggMesh).length > 0) {
        // A tap on the egg: it wiggles and something inside answers.
        wobbleRef.current = 0.6;
        audio.play("pop", { volume: 0.5, rate: 0.8 + Math.random() * 0.4 });
        elli.feel("happy", 0.6);
        return;
      }
      if (phase === "pet" && pet.visible && raycaster.intersectObject(pet).length > 0) {
        petHop = 1;
        audio.play("jump", { volume: 0.55, rate: 1.3 + Math.random() * 0.3 });
        sparkle(pet.position.clone().add(new THREE.Vector3(0, 0.5, 0)), "#ff9ecb", 1.4, 30);
        elli.feel("happy");
        console.log(" 🎮 [egg] [pet] [tapped]");
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      phaseTime += dt;
      meadow.update(dt, time);
      decorUpdate(time);
      if (hatchRef.current && phase === "waiting") setPhase("hatching");

      if (paintedCracks !== cracksRef.current) {
        if (paintedCracks >= 0 && cracksRef.current > paintedCracks) sparkle(eggPivot.position.clone().setY(0.9), "#ffe9a8", 1.2, 40);
        repaint(cracksRef.current);
      }
      const progress = eggRef.current.itemIds.length ? cracksRef.current / eggRef.current.itemIds.length : 0;

      if (phase === "waiting") {
        // Alive inside: a slow breath, a glow that grows with every proven item, a wobble when it is touched.
        wobbleRef.current = Math.max(0, wobbleRef.current - dt * 1.4);
        const idleRock = Math.sin(time * 1.3) * 0.03 * (0.4 + progress);
        const nudge = Math.sin(time * 22) * wobbleRef.current * 0.18;
        eggPivot.rotation.z = idleRock + nudge;
        eggPivot.rotation.x = Math.sin(time * 0.9) * 0.015;
        eggMaterial.emissiveIntensity = progress * (1.3 + Math.sin(time * 2.4) * 0.35);
        eggLight.intensity = progress * 3;
        elli.watch(eggPivot.position.clone().setY(0.9));
      } else if (phase === "hatching") {
        // The build: shaking harder, light pouring out of the cracks, shafts of light; then it breaks.
        const k = Math.min(1, phaseTime / 2.6);
        if (phaseTime - dt <= 0) {
          audio.play("riser", { volume: 0.8 });
          elli.feel("surprised");
          setBanner("Something's happening...");
        }
        eggPivot.rotation.z = Math.sin(time * (18 + k * 30)) * (0.05 + k * 0.2);
        eggPivot.position.y = 0.06 + Math.abs(Math.sin(time * 14)) * k * 0.12;
        eggMaterial.emissiveIntensity = 1.6 + k * 4;
        eggLight.intensity = 3 + k * 10;
        beamMaterial.opacity = k * 0.5;
        beams.scale.setScalar(0.01 + k);
        beams.rotation.y += dt * (0.5 + k * 2);
        cameraKick = k * 0.12;
        elli.watch(eggPivot.position.clone().setY(1));
        if (k >= 1) {
          // Crack open: shell flies, a flash, the creature pops out.
          eggMesh.visible = false;
          beamMaterial.opacity = 0;
          const center = eggPivot.position.clone().setY(0.8);
          shards.forEach((shard) => {
            shard.mesh.visible = true;
            shard.mesh.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.6, (Math.random() - 0.5) * 0.5));
            shard.velocity.set((Math.random() - 0.5) * 5, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 4 + 1);
            shard.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
          });
          sparkle(center, "#fff3b0", 3.4);
          cameraKick = 0.5;
          audio.play("boom", { volume: 0.8 });
          audio.play("fanfare", { volume: 0.8, jitter: 0 });
          window.setTimeout(() => audio.play("legendary", { volume: 0.7, jitter: 0 }), 400);
          theme.caughtLine.forEach((line, index) => window.setTimeout(() => audio.say(line.text, line.lang), 900 + index * 1100));
          pet.visible = true;
          petShadow.visible = true;
          elli.dance();
          setBanner(`${creature.speciesName} hatched!`);
          console.log(` 🎮 [egg] [hatch] [done] creature=${creature.id}`);
          window.setTimeout(() => onHatchedRef.current?.(), 2500);
          setPhase("pet");
        }
      } else if (phase === "pet") {
        // Pop out with a bounce, then hop around the nest as her pet.
        const grow = Math.min(1, phaseTime / 0.7);
        const overshoot = grow < 1 ? Math.sin(grow * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1;
        petHop = Math.max(0, petHop - dt * 2);
        if (phaseTime > 2.5) petAngle += dt * 0.35;
        const wander = phaseTime > 2.5 ? 1.25 : 0;
        const base = nestAt.clone().add(new THREE.Vector3(Math.sin(petAngle) * wander, 0, Math.cos(petAngle) * wander * 0.6 + (wander ? 0.6 : 0)));
        const bounce = Math.abs(Math.sin(time * 4)) * 0.12 + Math.sin(petHop * Math.PI) * 0.8;
        pet.position.set(base.x, petSize * 0.5 + 0.1 + bounce + (phaseTime < 0.7 ? 0.6 * (1 - grow) : 0), base.z);
        const squash = 1 + Math.sin(time * 8) * 0.03;
        pet.scale.set(petSize * overshoot * squash, petSize * overshoot / squash, 1);
        petShadow.position.set(base.x, 0.02, base.z);
        // The glow left in the nest fades back to night.
        eggLight.intensity = Math.max(0, eggLight.intensity - dt * 6);
        elli.watch(pet.position);
        if (phaseTime > 6 && phaseTime - dt <= 6) elli.play("idle", true);
      }

      shards.forEach((shard) => {
        if (!shard.mesh.visible) return;
        shard.velocity.y -= dt * 9;
        shard.mesh.position.addScaledVector(shard.velocity, dt);
        shard.mesh.rotation.x += shard.spin.x * dt;
        shard.mesh.rotation.y += shard.spin.y * dt;
        if (shard.mesh.position.y < 0.05) {
          shard.mesh.position.y = 0.05;
          shard.velocity.set(shard.velocity.x * 0.4, Math.abs(shard.velocity.y) * 0.25, shard.velocity.z * 0.4);
          shard.spin.multiplyScalar(0.5);
        }
      });
      if (sparkleAge < 1.6) {
        sparkleAge += dt;
        for (let index = 0; index < sparkleCount; index += 1) {
          sparkleVelocities[index].y -= dt * 1.6;
          sparklePositions[index * 3] += sparkleVelocities[index].x * dt;
          sparklePositions[index * 3 + 1] += sparkleVelocities[index].y * dt;
          sparklePositions[index * 3 + 2] += sparkleVelocities[index].z * dt;
        }
        sparkleGeometry.attributes.position.needsUpdate = true;
        sparkleMaterial.opacity = Math.max(0, 1 - sparkleAge / 1.6);
      }
      elli.update(dt, time);
      cameraKick = Math.max(0, cameraKick - dt * 0.8);
      camera.position.copy(cameraHome).add(new THREE.Vector3((Math.random() - 0.5) * cameraKick * 0.3, (Math.random() - 0.5) * cameraKick * 0.3, 0));
      camera.lookAt(0, 1, -0.4);
      composer.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    console.log(` 🎮 [egg] [scene] [ready] creature=${creature.id} items=${eggRef.current.itemIds.length} proven=${eggRef.current.proven.length}`);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      elli.dispose();
      elliRef.current = null;
      meadow.dispose();
      audio.dispose();
      audioRef.current = null;
      composer.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      console.log(" 🎮 [egg] [scene] [disposed]");
    };
  }, [creature, timeOfDay, season, companionVrmUrl, theme]);

  const total = egg.itemIds.length;
  return (
    <div data-testid="egg-hatch-3d" style={{ position: "relative", width: "100%", height: "100%", minHeight: 520, overflow: "hidden", background: "#0b0820", fontFamily: "Lexend, system-ui, sans-serif" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {!webgl ? <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "white", fontWeight: 800 }}>3D is not available on this screen.</p> : null}
      <MusicButton audioRef={audioRef} musicOnRef={musicOnRef} />
      {/* One light per drilled item: lit when she has proven it. Pictures, not words. */}
      {phase === "waiting" ? (
        <div data-testid="egg-pips" aria-label={`${egg.proven.length} of ${total} proven`} style={{ position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12, pointerEvents: "none" }}>
          {egg.itemIds.map((id) => {
            const lit = egg.proven.includes(id);
            return <span key={id} style={{ width: 26, height: 26, borderRadius: "50%", background: lit ? "radial-gradient(circle at 35% 35%, #fff7c2, #ffb800)" : "rgba(255,255,255,.18)", boxShadow: lit ? "0 0 16px #ffd24a" : "inset 0 0 0 2px rgba(255,255,255,.35)", transition: "all .4s" }} />;
          })}
        </div>
      ) : null}
      {phase === "waiting" && !checking ? (
        <button
          type="button"
          data-testid="egg-check"
          onClick={startCheck}
          title="Storybook stands in for tomorrow: in Sunny this check opens on a later day"
          style={{ position: "absolute", top: 16, right: 16, zIndex: 3, border: "2px dashed #ffffff88", borderRadius: 14, padding: "8px 14px", background: "rgba(15,23,42,.7)", color: "white", font: "900 14px Lexend, system-ui, sans-serif", cursor: "pointer" }}
        >
          🌙 Next-day check
        </button>
      ) : null}
      {checking && checking[0] ? (
        <QuestionCard key={checking[0].id} question={checking[0]} feedback={feedback} hinted={false} hintable={false} title="CRACK THE EGG" submitLabel="Crack it!" audio={audioRef.current} onAnswer={answerCheck} />
      ) : null}
      {banner ? (
        <div data-testid="egg-banner" style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 999, background: "rgba(15,23,42,.72)", color: "#ffe680", fontWeight: 900, fontSize: 18, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {banner}
        </div>
      ) : null}
    </div>
  );
}
