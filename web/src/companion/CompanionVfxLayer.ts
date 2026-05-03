import * as THREE from "three";

export type CompanionVfxPreset = "yellow_power_aura";
export type CompanionVfxLevel = "idle" | "focused" | "powered_up" | "limit_break";

const PARTICLE_COUNT = 56;

function createAuraTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(256, 390, 72, 256, 390, 318);
  glow.addColorStop(0, "rgba(255,255,255,0)");
  glow.addColorStop(0.18, "rgba(254,240,138,0.12)");
  glow.addColorStop(0.48, "rgba(250,204,21,0.34)");
  glow.addColorStop(0.72, "rgba(234,179,8,0.16)");
  glow.addColorStop(1, "rgba(250,204,21,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const flame = ctx.createLinearGradient(0, 0, 0, canvas.height);
  flame.addColorStop(0, "rgba(255,255,255,0.58)");
  flame.addColorStop(0.26, "rgba(254,240,138,0.42)");
  flame.addColorStop(0.58, "rgba(250,204,21,0.3)");
  flame.addColorStop(1, "rgba(234,179,8,0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(256, 22);
  ctx.bezierCurveTo(216, 124, 170, 164, 132, 262);
  ctx.bezierCurveTo(60, 440, 138, 596, 232, 742);
  ctx.bezierCurveTo(186, 548, 250, 420, 256, 286);
  ctx.bezierCurveTo(312, 426, 352, 552, 284, 744);
  ctx.bezierCurveTo(392, 596, 456, 420, 382, 254);
  ctx.bezierCurveTo(340, 160, 306, 118, 256, 22);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  const cutout = ctx.createRadialGradient(256, 392, 20, 256, 392, 165);
  cutout.addColorStop(0, "rgba(0,0,0,0.96)");
  cutout.addColorStop(0.5, "rgba(0,0,0,0.72)");
  cutout.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cutout;
  ctx.beginPath();
  ctx.ellipse(256, 408, 118, 286, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = "rgba(255,255,255,0.58)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(246, 48);
  ctx.bezierCurveTo(168, 190, 92, 392, 202, 700);
  ctx.stroke();
  ctx.strokeStyle = "rgba(250,204,21,0.68)";
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(266, 52);
  ctx.bezierCurveTo(388, 206, 420, 440, 314, 704);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(254,240,138,0.9)");
  g.addColorStop(0.72, "rgba(250,204,21,0.32)");
  g.addColorStop(1, "rgba(250,204,21,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function levelIntensity(level: CompanionVfxLevel): number {
  if (level === "idle") return 0;
  if (level === "limit_break") return 1;
  if (level === "powered_up") return 0.78;
  if (level === "focused") return 0.52;
  return 0;
}

export class CompanionVfxLayer {
  readonly group = new THREE.Group();

  private readonly auraMaterial: THREE.SpriteMaterial;
  private readonly innerAuraMaterial: THREE.SpriteMaterial;
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly particles: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly particleSeeds: Float32Array;
  private readonly aura: THREE.Sprite;
  private readonly innerAura: THREE.Sprite;
  private readonly shockwave: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private elapsed = 0;
  private level: CompanionVfxLevel = "idle";

  constructor(preset: CompanionVfxPreset) {
    this.group.name = `sunny-vfx-${preset}`;
    this.group.renderOrder = -1;

    const auraTexture = createAuraTexture();
    this.auraMaterial = new THREE.SpriteMaterial({
      map: auraTexture,
      color: 0xffe45c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.aura = new THREE.Sprite(this.auraMaterial);
    this.aura.visible = false;
    this.aura.name = "sunny-vfx-yellow-power-aura-shell";
    this.aura.position.set(0, 1.04, 0.36);
    this.aura.scale.set(1.5, 2.3, 1);
    this.group.add(this.aura);

    this.innerAuraMaterial = new THREE.SpriteMaterial({
      map: auraTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.innerAura = new THREE.Sprite(this.innerAuraMaterial);
    this.innerAura.visible = false;
    this.innerAura.name = "sunny-vfx-yellow-power-aura-core";
    this.innerAura.position.set(0, 1.02, 0.34);
    this.innerAura.scale.set(0.9, 1.82, 1);
    this.group.add(this.innerAura);

    this.particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    this.particleSeeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      this.particleSeeds[i] = i * 0.61803398875;
      this.writeParticle(i, 0);
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3),
    );
    this.particleMaterial = new THREE.PointsMaterial({
      map: createParticleTexture(),
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      size: 0.06,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.particles.visible = false;
    this.particles.name = "sunny-vfx-yellow-power-aura-particles";
    this.group.add(this.particles);

    const ringGeometry = new THREE.RingGeometry(0.28, 0.32, 64);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shockwave = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.shockwave.name = "sunny-vfx-yellow-power-aura-shockwave";
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.position.set(0, 0.05, 0);
    this.group.add(this.shockwave);

    this.light = new THREE.PointLight(0xfacc15, 0, 3.2);
    this.light.name = "sunny-vfx-yellow-power-aura-light";
    this.light.position.set(0, 1.18, 0.25);
    this.light.visible = false;
    this.group.add(this.light);
  }

  setLevel(level: CompanionVfxLevel): void {
    this.level = level;
  }

  tick(dt: number, camera?: THREE.Camera | null): void {
    this.elapsed += Math.min(dt, 0.1);
    const intensity = levelIntensity(this.level);
    const pulse = 0.84 + Math.sin(this.elapsed * 16) * 0.08 + intensity * 0.16;

    this.aura.visible = intensity > 0;
    this.innerAura.visible = intensity > 0;
    this.particles.visible = intensity > 0.34;
    this.shockwave.visible = intensity > 0.5;
    this.light.visible = intensity > 0.2;

    this.auraMaterial.opacity = intensity === 0 ? 0 : 0.16 + intensity * 0.34;
    this.innerAuraMaterial.opacity = intensity === 0 ? 0 : 0.04 + intensity * 0.16;
    this.particleMaterial.opacity = Math.max(0, intensity - 0.2) * 0.92;
    this.particleMaterial.size = 0.045 + intensity * 0.045;
    this.light.intensity = intensity === 0 ? 0 : 0.25 + intensity * 1.35;

    this.aura.scale.set(1.22 * pulse, 2.06 * (0.96 + intensity * 0.16), 1);
    this.innerAura.scale.set(0.7 * pulse, 1.58 * (0.98 + intensity * 0.2), 1);
    this.aura.position.y = 1.03 + Math.sin(this.elapsed * 7) * 0.025;
    this.innerAura.position.y = 1.02 + Math.sin(this.elapsed * 9) * 0.018;

    const ringScale = 1 + ((this.elapsed * (0.6 + intensity * 1.8)) % 1) * 1.7;
    this.shockwave.scale.setScalar(ringScale);
    this.ringMaterial.opacity =
      this.level === "limit_break" ? Math.max(0, 0.46 * (1 - (ringScale - 1) / 1.7)) : 0.08 * intensity;

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      this.writeParticle(i, this.elapsed);
    }
    const position = this.particles.geometry.getAttribute("position");
    position.needsUpdate = true;

    if (camera) {
      this.aura.quaternion.copy(camera.quaternion);
      this.innerAura.quaternion.copy(camera.quaternion);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.auraMaterial.map?.dispose();
    this.innerAuraMaterial.map?.dispose();
    this.particleMaterial.map?.dispose();
    this.auraMaterial.dispose();
    this.innerAuraMaterial.dispose();
    this.particleMaterial.dispose();
    this.particles.geometry.dispose();
    this.ringMaterial.dispose();
    this.shockwave.geometry.dispose();
  }

  private writeParticle(index: number, elapsed: number): void {
    const seed = this.particleSeeds[index] ?? 0;
    const phase = (elapsed * (0.55 + (seed % 0.6)) + seed) % 1;
    const angle = seed * Math.PI * 2 * 7.3 + Math.sin(elapsed * 2 + seed) * 0.25;
    const radius = 0.34 + (seed % 0.4);
    const x = Math.cos(angle) * radius * (0.8 + phase * 0.32);
    const y = 0.1 + phase * 1.88;
    const z = Math.sin(angle) * 0.12 - 0.02;
    const base = index * 3;
    this.particlePositions[base] = x;
    this.particlePositions[base + 1] = y;
    this.particlePositions[base + 2] = z;
  }
}
