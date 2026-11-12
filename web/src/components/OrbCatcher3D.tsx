import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { CapturedMonsterConfig } from "../../../src/shared/capturedMonsterCatalog";
import { decideCatch, decideDrillCatch } from "../../../src/shared/creatureEncounters";
import type { Season, SkyMood } from "../../../src/shared/skyClock";
import { SKY, buildMeadow } from "./orbMeadowScenery";
import { OrbAudio } from "./orbAudio";
import { loadCompanion } from "./orbCompanion";
import { MEADOW_PACK, type OrbThemePack } from "./orbThemePacks";

/**
 * Storybook prototype (owner, 2026-11-11): the orb catcher as a real 3D scene in Three.js, the engine the
 * Monster Math games use. Same rules underneath (her throws, the shake catch odds); only the stage is new:
 * a lit meadow that follows the sky clock and season, her companion standing in it, a glowing orb with a
 * real arc, an impact flash, the shakes, and a burst or a click.
 */

type Phase = "aim" | "flying" | "absorb" | "drop" | "shaking" | "caught" | "escape" | "away";

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

/** A question in a drill: answering it right loads one orb. */
export interface OrbQuestion {
  id: string;
  kind: "spelling" | "math";
  /** Spelling: the word she hears and types. Math: the problem she sees. */
  prompt: string;
  answer: string;
  choices?: string[];
}

export interface OrbCatcher3DProps {
  creature: CapturedMonsterConfig;
  throws: number;
  /** The child's theme pack (chosen from her chart); the plain meadow when absent. */
  theme?: OrbThemePack;
  /**
   * A drill the Planner calibrated: each right answer loads one orb, and the catch is scheduled for the
   * planned round, so the encounter repeats the concept as many times as the Planner wants.
   */
  drill?: { plannedRounds: number; questions: OrbQuestion[] };
  timeOfDay: SkyMood;
  season: Season;
  companionVrmUrl?: string;
  /** Demo control: fix the catch roll (0 always catches, 0.99 always breaks free). */
  roll?: () => number;
  onResult?: (outcome: "caught" | "escaped") => void;
}

export function OrbCatcher3D({ creature, throws, theme = MEADOW_PACK, drill, timeOfDay, season, companionVrmUrl, roll, onResult }: OrbCatcher3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [throwsLeft, setThrowsLeft] = useState(throws);
  const [banner, setBanner] = useState<string | null>(drill ? "Answer to load your orb!" : "Pull the orb back and let go!");
  const [webgl, setWebgl] = useState(true);
  const throwsRef = useRef(throws);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const rollRef = useRef(roll);
  rollRef.current = roll;
  const audioRef = useRef<OrbAudio | null>(null);
  const drillRef = useRef(drill);
  drillRef.current = drill;
  const roundRef = useRef(0);
  const loadedRef = useRef(!drill);
  const [needQuestion, setNeedQuestion] = useState(Boolean(drill));
  const [round, setRound] = useState(0);
  const [shakeLabel, setShakeLabel] = useState<string | null>(null);
  // The drill's questions cycle: a right answer moves on, a wrong one comes back later in the round.
  const [queue, setQueue] = useState<OrbQuestion[]>(drill?.questions ?? []);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Elli is the hint button: tap her while a question is open. A hinted answer is logged as hinted.
  const [hintFor, setHintFor] = useState<string | null>(null);
  const needQuestionRef = useRef(needQuestion);
  needQuestionRef.current = needQuestion;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const hintRef = useRef(hintFor);
  hintRef.current = hintFor;
  const musicOnRef = useRef(readMusicPref());

  const answer = (question: OrbQuestion, given: string) => {
    const audio = audioRef.current;
    const right = given.trim().toLowerCase() === question.answer.trim().toLowerCase();
    const hinted = hintFor === question.id;
    console.log(` 🎮 [orb-3d] [question] [${right ? "right" : "try-again"}] id=${question.id} round=${roundRef.current + 1} hinted=${hinted}`);
    setQueue((current) => [...current.slice(1), current[0]]);
    setHintFor(null);
    if (!right) {
      audio?.say(theme.wrongLine.text, theme.wrongLine.lang);
      setFeedback(theme.wrongLine.text);
      return;
    }
    audio?.play(theme.cues.correct, { volume: 0.7 });
    audio?.say(theme.cues.ready.text, theme.cues.ready.lang);
    setFeedback(null);
    loadedRef.current = true;
    setNeedQuestion(false);
    setBanner("Ready? Go! Pull the orb back and let go!");
  };

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
    const audio = new OrbAudio(theme.sounds);
    audioRef.current = audio;
    audio.setMusic(musicOnRef.current);
    void audio.load().then(() => theme.beds.forEach((bed) => audio.loop(bed.key, bed.volume)));
    const say = (line: { text: string; lang?: "en" | "ja" }) => audio.say(line.text, line.lang);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    const cameraHome = new THREE.Vector3(0, 2.1, 7.4);
    camera.position.copy(cameraHome);
    camera.lookAt(0, 1.1, 0);

    const meadow = buildMeadow(scene, { timeOfDay, season });
    scene.add(new THREE.HemisphereLight(new THREE.Color(sky.top), new THREE.Color("#4f7a3a"), sky.hemi));
    const sun = new THREE.DirectionalLight(new THREE.Color(sky.sun), sky.sunIntensity);
    sun.position.set(-6, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);

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
    const decorUpdate = theme.decorate(scene, creatureHome);

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

    // Her companion: alive (blinks, watches the orb, shows how she feels) and she answers a tap.
    const elli = loadCompanion(scene, companionVrmUrl, { position: new THREE.Vector3(-2.3, 0, 0.9), rotationY: 0.45 });
    const playAction = (name: string, loop = false) => elli.play(name, loop);
    const raycaster = new THREE.Raycaster();
    let creatureSquish = 0;
    // A tap on Elli: a hint while a question is open, otherwise a hello.
    const tapElli = () => {
      const open = drillRef.current && needQuestionRef.current ? queueRef.current[0] : undefined;
      if (open) {
        elli.play("think");
        elli.feel("relaxed");
        if (open.kind === "spelling") {
          audio.say("Listen.", "en");
          audio.say(open.prompt, "en", 0.6);
        } else {
          audio.say("Let's knock one out.", "en");
        }
        setHintFor(open.id);
        console.log(` 🎮 [orb-3d] [hint] [given] id=${open.id}`);
        return;
      }
      if (elli.react()) audio.play("giggle" in theme.sounds ? "giggle" : "pop", { volume: 0.5 });
    };
    const tapCreature = () => {
      creatureSquish = 1;
      audio.play("jump", { volume: 0.5, rate: 1.4 });
      elli.feel("happy", 0.7);
    };

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
      audio.resume();
      const orbScreen = toScreen(orb.position);
      const onOrb = Math.hypot(event.clientX - orbScreen.x, event.clientY - orbScreen.y) <= 110;
      if (!onOrb || !loadedRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
        if (elli.hit(raycaster)) tapElli();
        else if (creatureSprite.visible && raycaster.intersectObject(creatureSprite).length > 0 && (phase === "aim" || phase === "escape")) tapCreature();
        return;
      }
      if (phase !== "aim") return;
      aiming = true;
      pointerStart = new THREE.Vector2(event.clientX, event.clientY);
      pull.set(0, 0);
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the browser no longer tracks cannot be captured; aiming still works.
      }
      audio.play("pop", { volume: 0.4, rate: 1.3 });
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
      roundRef.current += 1;
      setRound(roundRef.current);
      const plan = drillRef.current;
      const hitQuality = flight.direct ? "direct" : "near";
      verdict = plan
        ? decideDrillCatch({ round: roundRef.current, plannedRounds: plan.plannedRounds, rarity: creature.rarity, hitQuality, roll: rollRef.current })
        : decideCatch({ rarity: creature.rarity, hitQuality, roll: rollRef.current });
      if (plan) loadedRef.current = false;
      console.log(` 🎮 [orb-3d] [throw] [released] round=${roundRef.current} strength=${strength.toFixed(2)} direct=${flight.direct} caught=${verdict.caught} shakes=${verdict.shakes}`);
      trailPoints.length = 0;
      audio.play(theme.cues.throw, { volume: 0.7 });
      setBanner(null);
      orb.visible = true;
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
      // Elli watches what matters: the orb in her hand or in the air, the shaking orb, otherwise the creature.
      if (phase === "aim") elli.watch(aiming ? orb.position : needQuestionRef.current ? camera.position : creatureSprite.position);
      else if (phase === "flying" || phase === "shaking" || phase === "drop") elli.watch(orb.position);
      else elli.watch(creatureSprite.visible ? creatureSprite.position : orb.position);
      elli.update(dt, time);

      meadow.update(dt, time);
      decorUpdate(time);

      // Creature idle life: bob and breathe while she is out.
      if (phase === "aim" || phase === "flying") {
        const bob = Math.sin(time * 2.2) * 0.08;
        creatureSprite.position.set(creatureHome.x, creatureHome.y + bob, creatureHome.z);
        // A tap makes it squish and hop.
        creatureSquish = Math.max(0, creatureSquish - dt * 2.2);
        const squish = Math.sin(creatureSquish * Math.PI * 3) * creatureSquish * 0.18;
        creatureSprite.position.y += Math.sin(creatureSquish * Math.PI) * 0.5;
        creatureSprite.scale.set(creatureSize * (1 + Math.sin(time * 2.2 + 1.6) * 0.03 + squish), creatureSize * (1 - Math.sin(time * 2.2 + 1.6) * 0.03 - squish), 1);
        aura.material.opacity = 0.22 + Math.sin(time * 1.6) * 0.08;
      }

      if (phase === "aim") {
        // In a drill the orb appears only once she has answered right ("Ready? Go!").
        orb.visible = loadedRef.current;
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
          theme.cues.impact.forEach((key) => audio.play(key, { volume: 0.8 }));
          if (flight.direct) {
            audio.play("combo", { volume: 0.6 });
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
          audio.play("coin", { volume: 0.4, rate: 1.4 });
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
            theme.cues.caught.forEach((key, index) => window.setTimeout(() => audio.play(key, { volume: 0.8, jitter: 0 }), index * 250));
            theme.caughtLine.forEach((line, index) => window.setTimeout(() => say(line), 500 + index * 1100));
            setShakeLabel(null);
            setBanner(`Gotcha! ${creature.speciesName} joined your den!`);
            elli.dance();
            setPhase("caught");
          } else {
            creatureSprite.visible = true;
            creatureMaterial.opacity = 1;
            burst(orb.position, "#ffffff", 3.6);
            flash.intensity = 12;
            cameraKick = 0.25;
            audio.play(theme.cues.breakFree, { volume: 0.7 });
            say(theme.breakFreeLine(roundRef.current));
            setShakeLabel(null);
            playAction("shrug", false);
            elli.feel("surprised");
            setPhase("escape");
          }
        } else {
          if (shakeIndex >= shakeDone) {
            shakeDone = shakeIndex + 1;
            // Each shake is a beat she counts along to: a referee's count, spirit bells...
            audio.play(theme.cues.shake, { volume: 0.7, rate: 1 + shakeIndex * 0.18, jitter: 0 });
            elli.feel("surprised", 0.4 + shakeIndex * 0.25);
            if (theme.id === "championship") audio.play("pop", { volume: 0.6, rate: 0.7 });
            setShakeLabel(theme.shakeLabels[Math.min(2, shakeIndex)]);
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
          if (!drillRef.current) {
            throwsRef.current -= 1;
            setThrowsLeft(throwsRef.current);
          }
          if (!drillRef.current && throwsRef.current <= 0) {
            setBanner(`${creature.speciesName} got away!`);
            audio.play("pop", { volume: 0.5, rate: 0.6 });
            playAction("defeated", false);
            elli.feel("sad", 0.6);
            setPhase("away");
          } else {
            setBanner(drillRef.current ? "Answer to load your next orb!" : "It broke free! Try again!");
            if (drillRef.current) setNeedQuestion(true);
            orb.scale.setScalar(1);
            orb.rotation.set(0, 0, 0);
            orb.position.copy(orbRest);
            orbGlow.scale.setScalar(1.3);
            trailPoints.length = 0;
            playAction("idle", true);
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
      cancelAnimationFrame(raf);
      elli.dispose();
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      meadow.dispose();
      audio.dispose();
      audioRef.current = null;
      composer.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      console.log(" 🎮 [orb-3d] [scene] [disposed]");
    };
  }, [creature, timeOfDay, season, companionVrmUrl, theme]);

  const rarityName = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" }[creature.rarity];
  return (
    <div data-testid="orb-catcher-3d" style={{ position: "relative", width: "100%", height: "100%", minHeight: 520, overflow: "hidden", background: "#0b0820", fontFamily: "Lexend, system-ui, sans-serif" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {!webgl ? <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "white", fontWeight: 800 }}>3D is not available on this screen.</p> : null}
      <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", textAlign: "center", color: "white", pointerEvents: "none", textShadow: "0 2px 10px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 32, fontWeight: 950 }}>{creature.speciesName}</div>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".18em" }}>{rarityName.toUpperCase()}</div>
      </div>
      <MusicButton audioRef={audioRef} musicOnRef={musicOnRef} />
      {shakeLabel ? (
        <div data-testid="orb-3d-shake" style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%,-50%)", color: "white", fontSize: 64, fontWeight: 950, textShadow: "0 4px 20px rgba(0,0,0,.6)", pointerEvents: "none" }}>
          {shakeLabel}
        </div>
      ) : null}
      {drill && needQuestion && queue[0] ? (
        <QuestionCard key={`${queue[0].id}:${round}:${feedback ?? ""}`} question={queue[0]} feedback={feedback} hinted={hintFor === queue[0].id} audio={audioRef.current} onAnswer={answer} />
      ) : null}
      {drill ? (
        <div data-testid="orb-3d-round" style={{ position: "absolute", bottom: 18, left: 18, color: "white", fontWeight: 900, pointerEvents: "none" }}>
          {round ? `Round ${round}` : "Answer to load your orb!"}
        </div>
      ) : null}
      <div data-testid="orb-3d-throws" style={{ position: "absolute", bottom: 18, left: 18, display: drill ? "none" : "flex", gap: 6, pointerEvents: "none" }}>
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

/** Music on or off, remembered on this device (a per-viewer convenience). */
export function readMusicPref(): boolean {
  try {
    return window.localStorage.getItem("sunny.orb.music") !== "off";
  } catch {
    return true;
  }
}

export function MusicButton({ audioRef, musicOnRef }: { audioRef: { current: OrbAudio | null }; musicOnRef: { current: boolean } }) {
  const [musicOn, setMusicOn] = useState(musicOnRef.current);
  const toggle = () => {
    const next = !musicOn;
    setMusicOn(next);
    musicOnRef.current = next;
    audioRef.current?.setMusic(next);
    try {
      window.localStorage.setItem("sunny.orb.music", next ? "on" : "off");
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  };
  return (
    <button
      type="button"
      data-testid="orb-3d-music"
      aria-pressed={musicOn}
      aria-label={musicOn ? "Music on" : "Music off"}
      onClick={toggle}
      style={{ position: "absolute", top: 16, left: 16, zIndex: 3, border: 0, borderRadius: 999, padding: "8px 14px", background: "rgba(15,23,42,.7)", color: "white", font: "900 15px Lexend, system-ui, sans-serif", cursor: "pointer" }}
    >
      {musicOn ? "🎵 Music on" : "🔇 Music off"}
    </button>
  );
}

/** The partial overlay: one question at a time; a right answer loads one orb (or, in a check, proves it). */
export function QuestionCard({
  question,
  feedback,
  hinted,
  hintable = true,
  title = "LOAD YOUR ORB",
  submitLabel = "Load it!",
  audio,
  onAnswer,
}: {
  question: OrbQuestion;
  feedback: string | null;
  hinted: boolean;
  hintable?: boolean;
  title?: string;
  submitLabel?: string;
  audio: OrbAudio | null;
  onAnswer: (question: OrbQuestion, given: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const hear = () => audio?.say(question.prompt);
  useEffect(() => {
    if (question.kind === "spelling") hear();
    // Say the word once when the card opens; she can tap to hear it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);
  const button = { border: 0, borderRadius: 14, padding: "12px 18px", font: "900 20px Lexend, system-ui, sans-serif", cursor: "pointer" } as const;
  return (
    <div
      data-testid="orb-3d-question"
      style={{ position: "absolute", right: 18, top: 90, width: "min(340px, calc(100% - 36px))", padding: 18, borderRadius: 22, background: "rgba(15,23,42,.82)", color: "white", boxShadow: "0 18px 40px rgba(0,0,0,.4)", display: "grid", gap: 12, backdropFilter: "blur(6px)" }}
    >
      <strong style={{ fontSize: 13, letterSpacing: ".14em", color: "#ffe680" }}>{title}</strong>
      {hintable && !hinted ? <span style={{ fontSize: 13, opacity: 0.75 }}>Stuck? Tap Elli 👈</span> : null}
      {question.kind === "spelling" ? (
        <>
          <button type="button" onClick={hear} style={{ ...button, background: "#ffffff22", color: "white" }}>🔊 Hear the word</button>
          {hinted ? (
            <div data-testid="orb-3d-hint" aria-label="Hint" style={{ textAlign: "center", font: "900 26px Lexend, system-ui, sans-serif", letterSpacing: ".3em", color: "#ffe680" }}>
              {question.answer[0]}{" _".repeat(Math.max(0, question.answer.length - 1))}
            </div>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) onAnswer(question, typed);
            }}
            style={{ display: "grid", gap: 8 }}
          >
            <input aria-label="Spell the word" autoFocus value={typed} onChange={(event) => setTyped(event.currentTarget.value)} autoComplete="off" autoCapitalize="off" spellCheck={false}
              style={{ padding: "12px 14px", borderRadius: 14, border: "2px solid #ffffff44", background: "#ffffff14", color: "white", font: "800 24px Lexend, system-ui, sans-serif", letterSpacing: ".06em" }} />
            <button type="submit" style={{ ...button, background: "linear-gradient(180deg,#ffe680,#ffc21a)", color: "#231400" }}>{submitLabel}</button>
          </form>
        </>
      ) : (
        <>
          <div style={{ fontSize: 34, fontWeight: 950, textAlign: "center" }}>{question.prompt}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {(question.choices ?? [question.answer]).filter((choice) => !hinted || choice !== (question.choices ?? []).find((option) => option !== question.answer)).map((choice) => (
              <button key={choice} type="button" aria-label={choice} onClick={() => onAnswer(question, choice)} style={{ ...button, background: "#ffffff1f", color: "white" }}>{choice}</button>
            ))}
          </div>
        </>
      )}
      {feedback ? <p style={{ margin: 0, fontWeight: 800, color: "#ffd1e1" }}>{feedback}</p> : null}
    </div>
  );
}
