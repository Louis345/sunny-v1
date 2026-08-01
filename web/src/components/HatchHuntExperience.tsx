import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import * as THREE from "three";
import type { CapturedMonsterConfig } from "./capturedMonsterCatalog";
import {
  answerHatchQuestion,
  createHatchHuntSession,
  expireHatchTimer,
  selectHatchEgg,
  type HatchHuntEvent,
  type HatchHuntQuestion,
  type HatchHuntState,
} from "./HatchHuntEngine";
import {
  hatchHuntMotionFrame,
  hatchSoundForEvent,
  mossyCaptureMotionFrame,
  mossyEscapeMotionFrame,
  playHatchHuntSfx,
  type MossyCaptureStage,
  type MossyEscapeStage,
} from "./HatchHuntPolish";

export interface HatchHuntExperienceProps {
  encounterId: string;
  childId: string;
  creature: CapturedMonsterConfig;
  questions: HatchHuntQuestion[];
  hatchRevealMs?: number;
  continuationPhase?: "hatch" | "escape" | "chase" | "capturing" | "retreated";
  chaseTargetOffsetX?: number;
  animationOnly?: boolean;
  animationPreview?: "hatch" | "escape" | "capture";
  animationStage?: MossyEscapeStage | MossyCaptureStage;
  onEvent?: (event: HatchHuntEvent) => void;
  onDiscovered?: (state: HatchHuntState) => void;
}

const eggIds = ["fern", "moon", "ember"];
const eggColors = [0x8dd6a8, 0xa8b9e6, 0xe9a56f];

export const HATCH_HUNT_THEME = {
  sky: "#84d5f3",
  cyanEnergy: "#7cfff1",
  goldEnergy: "#ffe46b",
  creamSurface: "#fffdf2",
  ink: "#10202d",
  lavenderDepth: "#b9b6ef",
  mossAccent: "#5f9d50",
} as const;

function createMossyModel(): THREE.Group {
  const mossy = new THREE.Group();
  mossy.name = "mossy-hatchling";
  const mint = new THREE.MeshStandardMaterial({ color: 0x8fd8a4, roughness: 0.72 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xffedc8, roughness: 0.8 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x345f35, roughness: 0.9 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x5f9d50, roughness: 1 });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffb84d,
    emissive: 0x8a4200,
    emissiveIntensity: 1.4,
    roughness: 0.38,
  });
  const eye = new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.35 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), mint);
  body.scale.set(1, 0.82, 1.15);
  body.position.y = 0.66;
  mossy.add(body);

  const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(0.78, 28, 20), shell);
  shellMesh.scale.set(1.08, 0.92, 0.72);
  shellMesh.position.set(0, 0.9, -0.28);
  mossy.add(shellMesh);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 18), mint);
  head.scale.set(1, 0.95, 0.9);
  head.position.set(0, 0.92, 0.68);
  mossy.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), cream);
  muzzle.scale.set(1.2, 0.72, 0.45);
  muzzle.position.set(0, 0.77, 1.05);
  mossy.add(muzzle);

  for (const x of [-0.18, 0.18]) {
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), eye);
    eyeball.position.set(x, 1.04, 1.03);
    mossy.add(eyeball);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), cream);
    glint.position.set(x - 0.018, 1.07, 1.095);
    mossy.add(glint);
  }

  for (const x of [-0.43, 0.43]) {
    for (const z of [-0.38, 0.46]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), mint);
      foot.scale.set(1.2, 0.55, 1.15);
      foot.position.set(x, 0.23, z);
      mossy.add(foot);
    }
  }

  for (const [x, y, z, scale] of [
    [-0.35, 1.46, -0.23, 0.3],
    [0.05, 1.58, -0.32, 0.35],
    [0.38, 1.42, -0.18, 0.28],
  ] as const) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(scale, 16, 12), foliage);
    tuft.scale.y = 0.55;
    tuft.position.set(x, y, z);
    mossy.add(tuft);
  }

  const emblem = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 10, 32, Math.PI * 1.65), amber);
  emblem.position.set(0.38, 0.98, 0.28);
  emblem.rotation.set(0.1, -0.75, 0.15);
  mossy.add(emblem);

  for (const x of [-0.11, 0.11]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), foliage);
    leaf.scale.set(0.48, 1.35, 0.32);
    leaf.rotation.z = x < 0 ? 0.55 : -0.55;
    leaf.position.set(x, 1.48, 0.72);
    mossy.add(leaf);
  }

  mossy.scale.setScalar(0.82);
  mossy.position.y = 0.1;
  return mossy;
}

function addForest(scene: THREE.Scene): void {
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x75bd78,
    roughness: 1,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 64), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x76533d, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x5f9d50, roughness: 1 });
  for (const [x, z, scale] of [
    [-5.2, -2.2, 1.4],
    [5.1, -2.6, 1.55],
    [-4.4, 1.4, 1.1],
    [4.7, 1.1, 1.2],
  ] as const) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.42 * scale, 4.4 * scale, 10), trunkMaterial);
    trunk.position.set(x, 2.1 * scale, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 * scale, 1), leafMaterial);
    crown.position.set(x, 4.4 * scale, z);
    crown.castShadow = true;
    scene.add(crown);
  }

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b6d8, roughness: 0.95 });
  for (const [x, z, scale] of [
    [-3.3, 0.7, 0.45],
    [3.5, 0.5, 0.52],
    [-1.5, -1.25, 0.32],
    [1.7, -1.4, 0.28],
  ] as const) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), stoneMaterial);
    stone.scale.y = 0.52;
    stone.position.set(x, scale * 0.42, z);
    stone.rotation.y = x;
    scene.add(stone);
  }
}

function addCracks(egg: THREE.Group, crackCount: number): void {
  const paths = [
    [-0.05, 0.72, 0.7, 0.08, 0.47, 0.77, -0.02, 0.22, 0.82],
    [0.08, 0.47, 0.77, 0.33, 0.31, 0.72, 0.16, 0.02, 0.84],
    [-0.02, 0.22, 0.82, -0.3, 0.07, 0.76, -0.18, -0.24, 0.79],
  ];
  for (let index = 0; index < Math.min(crackCount, paths.length); index += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(paths[index], 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffe46b, linewidth: 2 }),
    );
    egg.add(line);
  }
}

function createEgg({
  color,
  selected,
  crackCount,
  phase,
}: {
  color: number;
  selected: boolean;
  crackCount: number;
  phase: HatchHuntState["phase"];
}): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    emissive: selected ? 0x39d6d0 : 0x000000,
    emissiveIntensity: selected ? 0.55 : 0,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 40), material);
  shell.scale.set(0.94, 1.25, 0.94);
  shell.position.y = 0.94;
  shell.castShadow = true;
  group.add(shell);
  if (selected) addCracks(group, crackCount);

  const nestMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6740, roughness: 1 });
  const nest = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.13, 10, 36), nestMaterial);
  nest.rotation.x = Math.PI / 2;
  nest.position.y = 0.18;
  group.add(nest);

  if (selected && phase === "hatched") {
    shell.visible = false;
    const leftShell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18, 0, Math.PI), material);
    leftShell.name = "left-shell";
    leftShell.scale.set(0.75, 0.5, 0.75);
    leftShell.rotation.z = -0.8;
    leftShell.position.set(-0.72, 0.35, 0);
    group.add(leftShell);
    const rightShell = leftShell.clone();
    rightShell.name = "right-shell";
    rightShell.rotation.z = 0.8;
    rightShell.position.x = 0.72;
    group.add(rightShell);
    group.add(createMossyModel());
  }
  return group;
}

function HatchHuntGrove({
  state,
  continuationPhase,
  chaseTargetOffsetX,
  animationStage,
  captureOrb,
}: {
  state: HatchHuntState;
  continuationPhase: NonNullable<HatchHuntExperienceProps["continuationPhase"]>;
  chaseTargetOffsetX: number;
  animationStage?: NonNullable<HatchHuntExperienceProps["animationStage"]>;
  captureOrb: CapturedMonsterConfig["captureOrb"];
}): ReactElement {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof WebGLRenderingContext === "undefined") return;

    const width = Math.max(640, mount.clientWidth || 960);
    const height = Math.max(420, mount.clientHeight || 620);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x84d5f3);
    scene.fog = new THREE.FogExp2(0xb9b6ef, 0.038);
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 3.2, 10.5);
    camera.lookAt(0, 1.05, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8fbff, 0x6b946f, 3.1));
    const moonLight = new THREE.DirectionalLight(0xfff3c3, 4.2);
    moonLight.position.set(-3, 7, 5);
    moonLight.castShadow = true;
    scene.add(moonLight);
    const eggLight = new THREE.PointLight(0xffe46b, state.selectedEggId ? 22 : 7, 9, 2);
    eggLight.position.set(0, 2.2, 1.8);
    scene.add(eggLight);
    addForest(scene);

    const eggGroups = eggIds.map((eggId, index) => {
      const egg = createEgg({
        color: eggColors[index],
        selected: state.selectedEggId === eggId,
        crackCount: state.crackCount,
        phase: state.phase,
      });
      egg.position.set((index - 1) * 2.65, 0, index === 1 ? -0.25 : 0.25);
      if (state.selectedEggId && state.selectedEggId !== eggId) egg.scale.setScalar(0.72);
      if (continuationPhase !== "hatch" && state.selectedEggId !== eggId) egg.visible = false;
      if (continuationPhase !== "hatch" && state.selectedEggId === eggId) {
        egg.position.set(0, 0, 0);
        egg.children.forEach((child) => {
          child.visible = child.name === "mossy-hatchling";
        });
      }
      scene.add(egg);
      return egg;
    });

    const captureStages: MossyCaptureStage[] = [
      "targeting",
      "orb-flight",
      "impact",
      "pull",
      "lock",
      "capture-complete",
    ];
    const captureStage = animationStage && captureStages.includes(animationStage as MossyCaptureStage)
      ? animationStage as MossyCaptureStage
      : null;
    const orbMaterial = new THREE.MeshPhysicalMaterial({
      color: captureOrb.primary,
      emissive: captureOrb.primary,
      emissiveIntensity: 0.38,
      roughness: 0.24,
      metalness: 0.16,
      clearcoat: 1,
      transparent: true,
      opacity: captureStage ? 1 : 0,
    });
    const captureOrbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 22), orbMaterial);
    captureOrbMesh.visible = Boolean(captureStage);
    scene.add(captureOrbMesh);
    const orbBandMaterial = new THREE.MeshStandardMaterial({
      color: captureOrb.band,
      emissive: captureOrb.band,
      emissiveIntensity: 0.42,
    });
    const orbBand = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.062, 10, 32), orbBandMaterial);
    orbBand.rotation.x = Math.PI / 2;
    captureOrbMesh.add(orbBand);
    const emblemMaterial = new THREE.MeshBasicMaterial({
      color: captureOrb.energy,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    if (captureOrb.emblem === "spiral-leaf") {
      const spiral = new THREE.Mesh(
        new THREE.TorusGeometry(0.205, 0.038, 8, 28, Math.PI * 1.68),
        emblemMaterial,
      );
      spiral.position.set(0, 0.16, 0.475);
      spiral.rotation.z = -0.45;
      captureOrbMesh.add(spiral);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), emblemMaterial);
      leaf.scale.set(0.52, 1.24, 0.28);
      leaf.rotation.z = -0.48;
      leaf.position.set(0.015, 0.19, 0.5);
      captureOrbMesh.add(leaf);
    } else {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), emblemMaterial);
      star.scale.set(0.72, 1.25, 0.28);
      star.position.z = 0.48;
      captureOrbMesh.add(star);
    }
    const impactMaterial = new THREE.MeshBasicMaterial({
      color: captureOrb.energy,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const impactRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 48), impactMaterial);
    impactRing.visible = Boolean(captureStage);
    impactRing.position.set(0, 0.72, 0.62);
    scene.add(impactRing);
    const captureLight = new THREE.PointLight(captureOrb.energy, 0, 7, 2);
    captureLight.position.set(0, 0.8, 0.9);
    scene.add(captureLight);

    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * 10;
      particlePositions[index * 3 + 1] = Math.random() * 5 + 0.3;
      particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0x7cfff1, size: 0.045, transparent: true, opacity: 0.82 }),
    );
    scene.add(particles);

    const clock = new THREE.Clock();
    const reducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    renderer.setAnimationLoop(() => {
      const seconds = clock.getElapsedTime();
      const motion = hatchHuntMotionFrame({
        phase: state.phase,
        crackCount: state.crackCount,
        seconds,
        reducedMotion,
      });
      const captureFrame = captureStage
        ? mossyCaptureMotionFrame({ stage: captureStage, seconds })
        : null;
      eggGroups.forEach((egg, index) => {
        const isSelected = state.selectedEggId === eggIds[index];
        const bobAmplitude = isSelected ? motion.bobAmplitude : motion.bobAmplitude * 0.4;
        egg.position.y = Math.sin(seconds * 1.3 + index) * bobAmplitude;
        egg.rotation.z =
          isSelected && ["cracking", "rescue"].includes(state.phase)
            ? Math.sin(seconds * (4.8 + state.crackCount * 0.9)) * motion.wobbleAmplitude
            : Math.sin(seconds * 0.8 + index) * motion.wobbleAmplitude * 0.35;
        if (isSelected && state.phase === "hatched") {
          const leftShell = egg.getObjectByName("left-shell");
          const rightShell = egg.getObjectByName("right-shell");
          const mossy = egg.getObjectByName("mossy-hatchling");
          if (leftShell) {
            leftShell.position.x = -0.52 - motion.shellSpread * 0.48;
            leftShell.rotation.z = -0.35 - motion.shellSpread * 0.72;
          }
          if (rightShell) {
            rightShell.position.x = 0.52 + motion.shellSpread * 0.48;
            rightShell.rotation.z = 0.35 + motion.shellSpread * 0.72;
          }
          if (mossy) {
            const retreatProgress = continuationPhase === "retreated" ? Math.min(1, seconds / 2.2) : 0;
            const escapeStages: MossyEscapeStage[] = ["hatching", "reacting", "escaping", "handoff-ready"];
            const escapeFrame = animationStage
              && animationStage !== "hatching"
              && escapeStages.includes(animationStage as MossyEscapeStage)
              ? mossyEscapeMotionFrame({ stage: animationStage as MossyEscapeStage, seconds })
              : null;
            const emergence = escapeFrame || captureFrame ? 1 : motion.emergence;
            const emergenceScale = (0.12 + emergence * 0.7) * (1 - retreatProgress * 0.82);
            mossy.scale.setScalar(emergenceScale * (captureFrame?.creatureScale ?? 1));
            if (captureFrame) {
              mossy.position.set(
                captureFrame.targetX,
                0.1 + captureFrame.creatureLift,
                captureFrame.creatureLift * 0.72,
              );
              mossy.rotation.y = 0;
              mossy.visible = captureFrame.creatureScale > 0.01;
            } else if (escapeFrame) {
              mossy.position.set(
                escapeFrame.positionX,
                escapeFrame.positionY,
                escapeFrame.positionZ,
              );
              mossy.rotation.y = escapeFrame.rotationY;
            } else {
              const chasing = ["escape", "chase", "capturing", "retreated"].includes(continuationPhase);
              const targetX = chasing ? chaseTargetOffsetX / 40 : 0;
              mossy.position.x = THREE.MathUtils.lerp(mossy.position.x, targetX, 0.055);
              mossy.position.y = chasing
                ? 0.1 + Math.abs(Math.sin(seconds * 3.2)) * 0.07
                : -0.3 + motion.emergence * 0.4;
              mossy.position.z = chasing ? -retreatProgress * 3.2 : 0;
              mossy.rotation.y = chasing
                ? Math.sin(seconds * 2.2) * 0.16
                : Math.sin(seconds * 1.8) * 0.08 * motion.emergence;
            }
          }
        }
      });
      if (captureFrame) {
        const orbStart = new THREE.Vector3(0, -0.7, 4.4);
        const orbTarget = new THREE.Vector3(0, 0.72, 0.62);
        captureOrbMesh.position.lerpVectors(orbStart, orbTarget, captureFrame.orbProgress);
        captureOrbMesh.scale.setScalar(1 + captureFrame.lockPulse);
        captureOrbMesh.rotation.y = seconds * (captureStage === "capture-complete" ? 0 : 2.8);
        impactRing.scale.setScalar(captureFrame.impactRingScale);
        impactMaterial.opacity = captureFrame.impactRingOpacity;
        captureLight.intensity = captureFrame.impactRingOpacity * 32
          + (captureStage === "lock" ? 12 + captureFrame.lockPulse * 80 : 0)
          + (captureFrame.orbLocked ? 9 : 0);
      }
      if (["escape", "chase", "capturing", "retreated"].includes(continuationPhase)) {
        const escapeStages: MossyEscapeStage[] = ["hatching", "reacting", "escaping", "handoff-ready"];
        const escapeFrame = animationStage && escapeStages.includes(animationStage as MossyEscapeStage)
          ? mossyEscapeMotionFrame({ stage: animationStage as MossyEscapeStage, seconds })
          : null;
        const cameraTargetX = escapeFrame?.cameraTargetX ?? chaseTargetOffsetX / 280;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, cameraTargetX, 0.035);
        camera.position.z = THREE.MathUtils.lerp(
          camera.position.z,
          escapeFrame?.cameraPositionZ ?? 10.5,
          0.04,
        );
        camera.lookAt(
          escapeFrame ? escapeFrame.cameraTargetX : cameraTargetX * 0.55,
          1.05,
          escapeFrame?.cameraTargetZ ?? 0,
        );
      }
      particles.rotation.y = seconds * 0.025;
      particles.scale.setScalar(1 + motion.emergence * 0.28);
      eggLight.intensity = motion.lightIntensity + Math.sin(seconds * 2.4) * 3.5;
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [animationStage, captureOrb, chaseTargetOffsetX, continuationPhase, state.crackCount, state.phase, state.selectedEggId]);

  return <div ref={mountRef} className="hatch-hunt__three" aria-hidden="true" />;
}

function phaseLabel(state: HatchHuntState): string {
  if (state.phase === "choose") return "Choose the egg calling to you";
  if (state.phase === "guardian") return "Awaken your egg";
  if (state.phase === "rescue") return "One chance to restore its warmth";
  if (state.phase === "hatched") return "A new friend is here";
  if (state.phase === "lost") return "The egg returned to the grove";
  return `Crack ${Math.min(3, state.crackCount + 1)} of 3`;
}

export function HatchHuntExperience({
  encounterId,
  childId,
  creature,
  questions,
  hatchRevealMs = 1_650,
  continuationPhase = "hatch",
  chaseTargetOffsetX = 0,
  animationOnly = false,
  animationPreview,
  animationStage,
  onEvent,
  onDiscovered,
}: HatchHuntExperienceProps): ReactElement {
  const [state, setState] = useState(() =>
    createHatchHuntSession({ encounterId, childId, creatureId: creature.id, eggIds, questions }),
  );
  const questionStartedAt = useRef(Date.now());
  const hatchedReported = useRef(false);

  useEffect(() => {
    questionStartedAt.current = Date.now();
  }, [state.currentQuestion?.id]);

  useEffect(() => {
    if (animationOnly || state.phase !== "hatched" || hatchedReported.current) return;
    hatchedReported.current = true;
    console.info(" 🎮 [hatch-hunt] [hatch-reveal] [started]", {
      childId,
      creatureId: creature.id,
      revealMs: hatchRevealMs,
      nativePresentationRequested: false,
    });
    const revealTimer = window.setTimeout(() => {
      console.info(" 🎮 [hatch-hunt] [egg_hatched] [discovery_only]", {
        encounterId,
        childId,
        creatureId: creature.id,
        nativePresentationRequested: false,
      });
      onDiscovered?.(state);
    }, Math.max(0, Math.min(4_000, hatchRevealMs)));
    return () => window.clearTimeout(revealTimer);
  }, [animationOnly, childId, creature.id, encounterId, hatchRevealMs, onDiscovered, state]);

  useEffect(() => {
    if (!animationOnly) return;
    let preview = createHatchHuntSession({
      encounterId,
      childId,
      creatureId: creature.id,
      eggIds,
      questions,
    });
    preview = selectHatchEgg(preview, "fern");
    const frames: HatchHuntState[] = [preview];
    let stepCount = 0;
    while (preview.phase !== "hatched") {
      stepCount += 1;
      if (stepCount > 4) throw new Error("hatch_hunt_animation_preview_guard_exceeded");
      const previewQuestion = preview.currentQuestion;
      if (!previewQuestion) throw new Error("hatch_hunt_animation_preview_question_missing");
      preview = answerHatchQuestion(preview, {
        answer: previewQuestion.correctAnswer,
        latencyMs: 0,
      });
      frames.push(preview);
    }
    if (animationPreview === "capture") {
      setState(frames[frames.length - 1]);
      return;
    }
    const timers = frames.map((frame, index) => window.setTimeout(() => {
      setState(frame);
      console.info(" 🎮 [hatch-hunt-preview] [animation_frame] [storybook_only]", {
        phase: frame.phase,
        crackCount: frame.crackCount,
        evidencePersisted: false,
      });
    }, 320 + index * 520));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [animationOnly, animationPreview, childId, creature.id, encounterId, questions]);

  useEffect(() => {
    if (state.phase === "cracking" && state.currentQuestion?.seconds != null) {
      playHatchHuntSfx("heartbeat");
    }
  }, [state.currentQuestion?.id, state.currentQuestion?.seconds, state.phase]);

  function commit(next: HatchHuntState): void {
    const newEvents = next.events.slice(state.events.length);
    for (const hatchEvent of newEvents) {
      console.info(` 🎮 [hatch-hunt] [${hatchEvent.type}] [recorded]`, hatchEvent);
      const sound = hatchSoundForEvent(hatchEvent.type);
      if (sound) playHatchHuntSfx(sound);
      onEvent?.(hatchEvent);
    }
    setState(next);
  }

  function restart(): void {
    hatchedReported.current = false;
    setState(createHatchHuntSession({ encounterId, childId, creatureId: creature.id, eggIds, questions }));
  }

  const question = state.currentQuestion;

  return (
    <main
      className="hatch-hunt"
      data-phase={state.phase}
      data-reveal-visibility={state.phase === "hatched" ? "unobstructed" : undefined}
      data-animation-preview={animationPreview ?? (animationOnly ? "hatch" : undefined)}
      data-animation-stage={animationStage}
      data-visual-family="sunny-orb"
    >
      <HatchHuntGrove
        state={state}
        continuationPhase={continuationPhase}
        chaseTargetOffsetX={chaseTargetOffsetX}
        animationStage={animationStage}
        captureOrb={creature.captureOrb}
      />
      {!animationOnly ? <header className="hatch-hunt__header">
        <span>WHISPERING GROVE</span>
        <h1>Hatch Hunt</h1>
        <p>{continuationPhase === "hatch" ? phaseLabel(state) : "Mossy is on the move!"}</p>
      </header> : null}

      {!animationOnly && continuationPhase === "hatch" && state.phase === "choose" ? (
        <section className="hatch-hunt__egg-actions" aria-label="Choose a mysterious egg">
          {eggIds.map((eggId) => (
            <button
              type="button"
              key={eggId}
              aria-label={`Choose ${eggId} egg`}
              onClick={() => commit(selectHatchEgg(state, eggId))}
            >
              <span>{eggId}</span>
              Choose egg
            </button>
          ))}
        </section>
      ) : null}

      {!animationOnly && continuationPhase === "hatch" && question ? (
        <section className="hatch-hunt__question" aria-live="polite">
          <div className="hatch-hunt__question-topline">
            <span>{question.difficulty === "recovery" ? "RESCUE QUESTION" : question.difficulty}</span>
            {question.seconds != null ? (
              <strong>{question.seconds} seconds</strong>
            ) : (
              <strong>Take your time</strong>
            )}
          </div>
          {question.seconds != null ? (
            <div className="hatch-hunt__timer" aria-label={`${question.seconds} second timer`}>
              <span
                key={question.id}
                style={{ animationDuration: `${question.seconds}s` }}
                onAnimationEnd={() => commit(expireHatchTimer(state))}
              />
            </div>
          ) : null}
          <h2>{question.prompt}</h2>
          <div className="hatch-hunt__answers">
            {question.answers.map((answer) => (
              <button
                type="button"
                key={answer}
                onClick={() =>
                  commit(
                    answerHatchQuestion(state, {
                      answer,
                      latencyMs: Date.now() - questionStartedAt.current,
                    }),
                  )
                }
              >
                {answer}
              </button>
            ))}
          </div>
          <div className="hatch-hunt__cracks" aria-label={`${state.crackCount} of 3 shell cracks`}>
            {[1, 2, 3].map((crack) => (
              <span key={crack} data-open={crack <= state.crackCount} />
            ))}
          </div>
        </section>
      ) : null}

      {!animationOnly && continuationPhase === "hatch" && state.phase === "lost" ? (
        <section className="hatch-hunt__outcome">
          <span>ATTEMPT ENDED</span>
          <h2>The shell grew quiet.</h2>
          <p>Your creatures are safe. Learn from the attempt and return when you are ready.</p>
          <button type="button" onClick={restart}>Try another egg</button>
        </section>
      ) : null}

      <style>{`
        .hatch-hunt { background:${HATCH_HUNT_THEME.sky}; color:${HATCH_HUNT_THEME.ink}; min-height:100vh; overflow:hidden; position:relative; font-family:Inter,ui-rounded,system-ui,sans-serif; }
        .hatch-hunt__three { inset:0; min-height:100vh; position:absolute; }
        .hatch-hunt__three canvas { display:block; height:100%!important; width:100%!important; }
        .hatch-hunt::before { background:radial-gradient(circle at 72% 18%,rgba(255,255,255,.72),transparent 25%),linear-gradient(180deg,rgba(124,255,241,.2),rgba(185,182,239,.12) 50%,rgba(16,32,45,.12)); content:""; inset:0; pointer-events:none; position:absolute; z-index:1; }
        .hatch-hunt::after { background:linear-gradient(180deg,rgba(255,255,255,.18),transparent 31%,rgba(16,32,45,.2)); content:""; inset:0; pointer-events:none; position:absolute; z-index:1; }
        .hatch-hunt__header { left:clamp(20px,4vw,58px); position:absolute; top:clamp(20px,4vw,44px); z-index:2; }
        .hatch-hunt__header span,.hatch-hunt__outcome>span { color:#0e8f9f; font-size:12px; font-weight:950; letter-spacing:.18em; }
        .hatch-hunt__header h1 { color:${HATCH_HUNT_THEME.ink}; font-size:clamp(38px,6vw,72px); line-height:.9; margin:8px 0; text-shadow:0 4px 18px rgba(255,255,255,.78); }
        .hatch-hunt__header p { font-size:clamp(16px,2vw,22px); font-weight:850; margin:0; }
        .hatch-hunt__egg-actions { bottom:42px; display:grid; gap:14px; grid-template-columns:repeat(3,minmax(140px,190px)); left:50%; position:absolute; transform:translateX(-50%); z-index:3; }
        .hatch-hunt__egg-actions button { backdrop-filter:blur(14px); background:rgba(255,253,242,.9); border:2px solid rgba(14,143,159,.28); border-radius:22px; box-shadow:0 14px 38px rgba(16,32,45,.15); color:${HATCH_HUNT_THEME.ink}; cursor:pointer; font-size:17px; font-weight:900; padding:15px 20px; text-transform:capitalize; transition:transform .18s,border-color .18s,box-shadow .18s; }
        .hatch-hunt__egg-actions button:hover { border-color:${HATCH_HUNT_THEME.goldEnergy}; box-shadow:0 12px 32px rgba(14,143,159,.25),0 0 0 4px rgba(124,255,241,.3); transform:translateY(-5px); }
        .hatch-hunt__egg-actions span { color:#0e8f9f; display:block; font-size:12px; letter-spacing:.12em; margin-bottom:5px; text-transform:uppercase; }
        .hatch-hunt__question { backdrop-filter:blur(18px); background:rgba(255,253,242,.94); border:2px solid rgba(124,255,241,.72); border-radius:28px; bottom:30px; box-shadow:0 24px 70px rgba(16,32,45,.24),0 0 0 1px rgba(255,228,107,.55); color:${HATCH_HUNT_THEME.ink}; display:grid; gap:13px; left:50%; max-width:720px; padding:22px; position:absolute; transform:translateX(-50%); width:calc(100vw - 40px); z-index:3; }
        .hatch-hunt__question-topline { align-items:center; color:#0e8f9f; display:flex; font-size:12px; font-weight:950; justify-content:space-between; letter-spacing:.13em; text-transform:uppercase; }
        .hatch-hunt__question-topline strong { color:#9b6b00; }
        .hatch-hunt__question h2 { font-size:clamp(24px,3.2vw,38px); line-height:1.08; margin:3px 0 6px; }
        .hatch-hunt__answers { display:grid; gap:10px; grid-template-columns:repeat(3,1fr); }
        .hatch-hunt__answers button,.hatch-hunt__outcome button { background:linear-gradient(135deg,#ffffff,#e7fcff); border:2px solid rgba(14,143,159,.16); border-radius:16px; color:${HATCH_HUNT_THEME.ink}; cursor:pointer; font-size:19px; font-weight:950; padding:14px; }
        .hatch-hunt__answers button:hover { background:${HATCH_HUNT_THEME.goldEnergy}; border-color:#f0c93c; transform:translateY(-2px); }
        .hatch-hunt__timer { background:rgba(16,32,45,.1); border-radius:999px; height:7px; overflow:hidden; }
        .hatch-hunt__timer span { animation:hatch-timer linear forwards; background:linear-gradient(90deg,#6de6ff,${HATCH_HUNT_THEME.goldEnergy},#ff7d62); display:block; height:100%; transform-origin:left; }
        .hatch-hunt__cracks { display:flex; gap:8px; justify-content:center; }
        .hatch-hunt__cracks span { background:rgba(16,32,45,.12); border-radius:999px; height:7px; width:52px; }
        .hatch-hunt__cracks span[data-open="true"] { background:${HATCH_HUNT_THEME.goldEnergy}; box-shadow:0 0 14px #ffbd43; }
        .hatch-hunt__outcome { backdrop-filter:blur(18px); background:rgba(255,253,242,.95); border:2px solid rgba(124,255,241,.72); border-radius:28px; bottom:36px; box-shadow:0 24px 70px rgba(16,32,45,.24),0 0 0 1px rgba(255,228,107,.58); color:${HATCH_HUNT_THEME.ink}; left:50%; max-width:620px; padding:24px 30px; position:absolute; text-align:center; transform:translateX(-50%); width:calc(100vw - 40px); z-index:3; }
        .hatch-hunt__outcome h2 { font-size:clamp(30px,4vw,48px); margin:8px 0; }
        .hatch-hunt__outcome p { font-size:18px; font-weight:750; margin:6px 0 12px; }
        .hatch-hunt__outcome strong { color:#0e8f9f; display:block; font-size:14px; }
        @keyframes hatch-timer { from { transform:scaleX(1); } to { transform:scaleX(0); } }
        @media (max-width:620px) { .hatch-hunt__egg-actions { bottom:20px; gap:8px; grid-template-columns:repeat(3,minmax(0,1fr)); width:calc(100vw - 28px); } .hatch-hunt__egg-actions button { font-size:14px; padding:10px 5px; } .hatch-hunt__egg-actions span { font-size:10px; } .hatch-hunt__answers { grid-template-columns:1fr; } }
        @media (prefers-reduced-motion:reduce) { .hatch-hunt__timer span { animation-duration:30s!important; } }
      `}</style>
    </main>
  );
}
