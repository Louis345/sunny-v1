import * as THREE from "three";
import type { Season, SkyMood } from "../../../src/shared/skyClock";

/**
 * The 3D meadow behind the orb catcher (owner, 2026-11-11): a painterly, Ghibli-like place that follows the
 * sky clock and the season. Swaying grass, soft drifting clouds, layered distant hills, round trees, flowers
 * and the season's weather. Pure scenery; it never touches play or evidence.
 */

export const SKY: Record<SkyMood, { top: string; middle: string; bottom: string; sun: string; sunIntensity: number; hemi: number; cloud: string }> = {
  sunrise: { top: "#7f9de0", middle: "#f2b8c6", bottom: "#ffd9b0", sun: "#ffb27a", sunIntensity: 1.6, hemi: 0.8, cloud: "#ffe4d6" },
  day: { top: "#3f8ee8", middle: "#8cc4f5", bottom: "#d8efff", sun: "#fff6e0", sunIntensity: 2.4, hemi: 1, cloud: "#ffffff" },
  golden: { top: "#6f86d0", middle: "#f0b28a", bottom: "#ffd58f", sun: "#ffbf6b", sunIntensity: 1.9, hemi: 0.85, cloud: "#ffe2c0" },
  twilight: { top: "#1f2156", middle: "#7a4c8f", bottom: "#e08a8f", sun: "#ff9a8a", sunIntensity: 0.9, hemi: 0.5, cloud: "#c99ab8" },
  night: { top: "#050820", middle: "#121a45", bottom: "#2a2f66", sun: "#9fb2ff", sunIntensity: 0.55, hemi: 0.35, cloud: "#3a4278" },
};

const GRASS: Record<Season, { base: string; tip: string }> = {
  spring: { base: "#3f8f3a", tip: "#9be06f" },
  summer: { base: "#2f7d32", tip: "#86cf5a" },
  autumn: { base: "#6f7a2f", tip: "#d8b84a" },
  halloween: { base: "#4f5a2a", tip: "#b08a3a" },
  holiday: { base: "#c8d4e2", tip: "#ffffff" },
  winter: { base: "#c3cfde", tip: "#f4f8ff" },
};
const LEAVES: Record<Season, string[]> = {
  spring: ["#ffb3d1", "#ff9ec7", "#8fd37a"],
  summer: ["#3f9e3c", "#58b04a", "#2f8a3a"],
  autumn: ["#e07b2a", "#c9481f", "#f2b33d"],
  halloween: ["#e0662a", "#8a3fb0", "#c9481f"],
  holiday: ["#2f6a40", "#e9eef5", "#24583a"],
  winter: ["#e6eef7", "#cfdbe8", "#2f6a40"],
};

function softTexture(color = "255,255,255"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, `rgba(${color},1)`);
  gradient.addColorStop(0.5, `rgba(${color},0.6)`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** A ground texture with soft colour patches, so the meadow is not one flat green. */
function groundTexture(base: string, tip: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 260; index += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 10 + Math.random() * 60;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const color = new THREE.Color(index % 2 ? tip : base).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    gradient.addColorStop(0, `#${color.getHexString()}55`);
    gradient.addColorStop(1, `#${color.getHexString()}00`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface Meadow {
  /** Call every frame: wind in the grass, drifting clouds, falling weather. */
  update(dt: number, time: number): void;
  dispose(): void;
}

export function buildMeadow(scene: THREE.Scene, input: { timeOfDay: SkyMood; season: Season }): Meadow {
  const sky = SKY[input.timeOfDay];
  const night = input.timeOfDay === "night" || input.timeOfDay === "twilight";
  const grass = GRASS[input.season];
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  scene.fog = new THREE.Fog(new THREE.Color(sky.bottom), 16, 70);

  // Sky: three-colour gradient dome, a soft sun (or moon) glow.
  const skyMaterial = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(sky.top) }, middle: { value: new THREE.Color(sky.middle) }, bottom: { value: new THREE.Color(sky.bottom) } },
    vertexShader: "varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = normalize(vPos).y; vec3 c = h < 0.18 ? mix(bottom, middle, smoothstep(-0.05, 0.18, h)) : mix(middle, top, smoothstep(0.18, 0.75, h)); gl_FragColor = vec4(c, 1.0); }",
  }));
  scene.add(new THREE.Mesh(keep(new THREE.SphereGeometry(95, 32, 16)), skyMaterial));
  const sunGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softTexture(night ? "220,230,255" : "255,236,190")), transparent: true, depthWrite: false, fog: false, opacity: night ? 0.7 : 0.85 })));
  sunGlow.position.set(night ? 18 : -22, night ? 26 : 20, -70);
  sunGlow.scale.set(night ? 10 : 26, night ? 10 : 26, 1);
  scene.add(sunGlow);
  if (night) {
    const moon = new THREE.Mesh(keep(new THREE.SphereGeometry(2.2, 24, 16)), keep(new THREE.MeshBasicMaterial({ color: "#f4f1ff", fog: false })));
    moon.position.copy(sunGlow.position);
    scene.add(moon);
    const starGeometry = keep(new THREE.BufferGeometry());
    const stars = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      stars.set([88 * Math.sin(phi) * Math.cos(theta), 88 * Math.cos(phi), 88 * Math.sin(phi) * Math.sin(theta)], index * 3);
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({ color: "#ffffff", size: 0.4, map: keep(softTexture()), transparent: true, depthWrite: false, fog: false }))));
  }

  // Clouds: clusters of soft puffs drifting slowly across the sky.
  const clouds: THREE.Group[] = [];
  const cloudTexture = keep(softTexture());
  for (let index = 0; index < 9; index += 1) {
    const cloud = new THREE.Group();
    const puffs = 4 + (index % 3);
    for (let puff = 0; puff < puffs; puff += 1) {
      const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: cloudTexture, color: sky.cloud, transparent: true, opacity: night ? 0.35 : 0.85, depthWrite: false, fog: false })));
      sprite.position.set(puff * 2.2 - puffs, Math.sin(puff * 1.7) * 0.8, 0);
      const size = 5 + Math.random() * 3;
      sprite.scale.set(size, size * 0.65, 1);
      cloud.add(sprite);
    }
    cloud.position.set(-60 + index * 15 + Math.random() * 6, 16 + Math.random() * 9, -55 - Math.random() * 15);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Distant hills: three soft layers that fade into the haze, like a painted backdrop.
  [
    { z: -48, y: -6, radius: 28, color: new THREE.Color(sky.middle).lerp(new THREE.Color(grass.base), 0.25), count: 6 },
    { z: -34, y: -7, radius: 20, color: new THREE.Color(grass.base).lerp(new THREE.Color(sky.bottom), 0.45), count: 7 },
    { z: -22, y: -6.5, radius: 13, color: new THREE.Color(grass.base).lerp(new THREE.Color(sky.bottom), 0.2), count: 8 },
  ].forEach((layer, layerIndex) => {
    const material = keep(new THREE.MeshStandardMaterial({ color: layer.color, roughness: 1, flatShading: false }));
    for (let index = 0; index < layer.count; index += 1) {
      const hill = new THREE.Mesh(keep(new THREE.SphereGeometry(layer.radius, 32, 16)), material);
      hill.scale.set(1.4, 0.55 + ((index + layerIndex) % 3) * 0.12, 1);
      hill.position.set((index - layer.count / 2) * layer.radius * 1.6 + (layerIndex * 7), layer.y, layer.z - (index % 2) * 4);
      scene.add(hill);
    }
  });

  // Ground with soft colour patches.
  const ground = new THREE.Mesh(keep(new THREE.CircleGeometry(80, 64)), keep(new THREE.MeshStandardMaterial({ map: keep(groundTexture(grass.base, grass.tip)), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grass: thousands of instanced blades that sway in the wind (a shader bends their tips).
  const snowy = input.season === "winter" || input.season === "holiday";
  // Under snow only a few short tufts poke through.
  const bladeCount = snowy ? 1800 : 6000;
  const blade = keep(new THREE.PlaneGeometry(0.035, 0.3, 1, 4));
  blade.translate(0, 0.15, 0);
  const windUniform = { value: 0 };
  const grassMaterial = keep(new THREE.MeshStandardMaterial({ color: grass.tip, roughness: 0.8, side: THREE.DoubleSide }));
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.uniforms.uBase = { value: new THREE.Color(grass.base) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vHeight;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHeight = position.y / 0.3;\nvec4 worldOrigin = instanceMatrix * vec4(0.0,0.0,0.0,1.0);\nfloat sway = sin(uTime * 1.6 + worldOrigin.x * 0.6 + worldOrigin.z * 0.4) * 0.12 + sin(uTime * 3.1 + worldOrigin.x) * 0.03;\ntransformed.x += sway * vHeight * vHeight;\ntransformed.z += sway * 0.5 * vHeight * vHeight;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uBase;\nvarying float vHeight;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( mix(uBase, diffuse, smoothstep(0.0, 1.0, vHeight)), opacity );");
  };
  const grassField = new THREE.InstancedMesh(blade, grassMaterial, bladeCount);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < bladeCount; index += 1) {
    // Denser near the play area, thinning out toward the horizon; a clear patch where the orb lands.
    let x = 0;
    let z = 0;
    // Keep the camera's lap clear so blades never fill the screen; denser near the play area.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const radius = Math.pow(Math.random(), 0.65) * 22;
      const angle = Math.random() * Math.PI * 2;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius - 4;
      if (z < 3.2) break;
    }
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    const scale = (0.7 + Math.random() * 0.6) * (snowy ? 0.6 : 1);
    dummy.scale.set(scale, scale * (Math.abs(x) < 1.6 && z > -2 && z < 5 ? 0.45 : 1), scale);
    dummy.updateMatrix();
    grassField.setMatrixAt(index, dummy.matrix);
  }
  grassField.receiveShadow = true;
  scene.add(grassField);

  // Round, soft trees (clustered crowns) framing the meadow.
  const trunkMaterial = keep(new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 1 }));
  const leafMaterials = LEAVES[input.season].map((color) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85 })));
  const crownGeometry = keep(new THREE.SphereGeometry(1, 16, 12));
  const trunkGeometry = keep(new THREE.CylinderGeometry(0.16, 0.26, 1.6, 8));
  for (let index = 0; index < 22; index += 1) {
    const side = index % 2 ? 1 : -1;
    const x = side * (5.5 + (index % 5) * 2.4 + Math.random() * 1.5);
    const z = -3 - (index % 6) * 3.2 - Math.random() * 2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    tree.add(trunk);
    for (let puff = 0; puff < 5; puff += 1) {
      const crown = new THREE.Mesh(crownGeometry, leafMaterials[(index + puff) % leafMaterials.length]);
      crown.position.set(Math.cos(puff * 1.3) * 0.55, 2.2 + (puff % 3) * 0.35, Math.sin(puff * 1.3) * 0.45);
      crown.scale.setScalar(0.75 + (puff % 2) * 0.25);
      crown.castShadow = true;
      tree.add(crown);
    }
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.9 + Math.random() * 0.6);
    scene.add(tree);
  }

  // Flowers scattered in the grass (glowing softly at night).
  const flowerColors = input.season === "winter" || input.season === "holiday" ? ["#ffffff", "#cfe3ff"] : ["#ff8fb8", "#ffd84d", "#ffffff", "#b58cff"];
  const flowerGeometry = keep(new THREE.SphereGeometry(0.06, 6, 6));
  for (let index = 0; index < 90; index += 1) {
    const color = flowerColors[index % flowerColors.length];
    const flower = new THREE.Mesh(flowerGeometry, keep(new THREE.MeshStandardMaterial({ color, emissive: night ? color : "#000000", emissiveIntensity: night ? 0.5 : 0 })));
    flower.position.set((Math.random() - 0.5) * 18, 0.12 + Math.random() * 0.12, (Math.random() - 0.5) * 12 - 3);
    scene.add(flower);
  }

  // Weather: snow, leaves, petals, or fireflies on summer evenings.
  const winter = input.season === "winter" || input.season === "holiday";
  const fireflies = input.season === "summer" && night;
  const weatherCount = input.season === "summer" && !night ? 0 : fireflies ? 80 : 160;
  const weatherGeometry = keep(new THREE.BufferGeometry());
  const weatherPositions = new Float32Array(weatherCount * 3);
  for (let index = 0; index < weatherCount; index += 1) weatherPositions.set([(Math.random() - 0.5) * 22, Math.random() * 9, (Math.random() - 0.5) * 14 - 2], index * 3);
  weatherGeometry.setAttribute("position", new THREE.BufferAttribute(weatherPositions, 3));
  const weatherColor = winter ? "#ffffff" : input.season === "spring" ? "#ffc3d8" : fireflies ? "#fff59a" : "#e07b2a";
  scene.add(new THREE.Points(weatherGeometry, keep(new THREE.PointsMaterial({ color: weatherColor, size: fireflies ? 0.16 : winter ? 0.12 : 0.14, map: keep(softTexture()), transparent: true, depthWrite: false, blending: fireflies ? THREE.AdditiveBlending : THREE.NormalBlending }))));

  return {
    update(dt, time) {
      windUniform.value = time;
      for (const cloud of clouds) {
        cloud.position.x += dt * 0.6;
        if (cloud.position.x > 70) cloud.position.x = -70;
      }
      for (let index = 0; index < weatherCount; index += 1) {
        if (fireflies) {
          weatherPositions[index * 3] += Math.sin(time * 0.7 + index) * dt * 0.3;
          weatherPositions[index * 3 + 1] = 0.4 + (Math.sin(time * 0.5 + index * 1.3) + 1) * 1.2;
          continue;
        }
        const y = weatherPositions[index * 3 + 1] - dt * (winter ? 0.5 : 0.7);
        weatherPositions[index * 3] += Math.sin(time + index) * dt * 0.3;
        weatherPositions[index * 3 + 1] = y < 0 ? 9 : y;
      }
      if (weatherCount) weatherGeometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      disposables.forEach((item) => item.dispose());
    },
  };
}
