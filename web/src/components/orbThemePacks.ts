import * as THREE from "three";
import { ORB_SOUND_LIBRARY, type OrbSoundMap } from "./orbAudio";

/**
 * Theme packs (owner, 2026-11-11): the orb game is the same for every child (throw, shakes, odds); a pack
 * dresses it from what the child's chart says she loves. Packs are data, never child-specific code: the
 * Planner (or a later Experience step) chooses one from her chart and soul file, and code renders it.
 */
export type OrbLine = { text: string; lang?: "en" | "ja" };

export interface OrbThemePack {
  id: string;
  name: string;
  /** Why this pack fits, in the words of the chart it came from (shown in Storybook, never to her). */
  from: string;
  sounds: OrbSoundMap;
  /** Looping beds under the scene. */
  beds: Array<{ key: string; volume: number }>;
  cues: {
    ready: OrbLine;
    throw: string;
    impact: string[];
    shake: string;
    caught: string[];
    breakFree: string;
    correct: string;
  };
  /** What she sees and hears on each shake (a referee's count, spirit bells...). */
  shakeLabels: [string, string, string];
  caughtLine: OrbLine[];
  breakFreeLine: (round: number) => OrbLine;
  wrongLine: OrbLine;
  /** Adds the pack's props to the scene; returns a per-frame update. */
  decorate(scene: THREE.Scene, creatureAt: THREE.Vector3): (time: number) => void;
}

function glowTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Wrestling, competition, streaks, Japanese cheers (Reina's chart). */
export const CHAMPIONSHIP_PACK: OrbThemePack = {
  id: "championship",
  name: "Championship",
  from: "Wrestler on a girls team; thrives on competition, streaks and personal bests; すごい and やった when she succeeds.",
  sounds: { ...ORB_SOUND_LIBRARY },
  beds: [{ key: "crowdLoop", volume: 0.5 }, { key: "music", volume: 0.6 }],
  cues: { ready: { text: "Ready? Go!" }, throw: "riser", impact: ["takedown", "boom"], shake: "tick", caught: ["crowdCheer", "legendary"], breakFree: "pop", correct: "correct" },
  shakeLabels: ["One!", "Two!", "Three!"],
  caughtLine: [{ text: "Pin!" }, { text: "すごい!", lang: "ja" }],
  breakFreeLine: (round) => ({ text: round === 1 ? "Reversal! Get back in there!" : "So close! Next round!" }),
  wrongLine: { text: "Shake it off, champ. Try it again!" },
  decorate(scene, at) {
    // A wrestling ring around the creature: four posts, three ropes, and arena spotlights.
    const ring = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({ color: "#d9d9e3", metalness: 0.6, roughness: 0.3 });
    const ropeColors = ["#ff3d6e", "#ffffff", "#3d7dff"];
    const half = 1.9;
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
    corners.forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), postMaterial);
      post.position.set(at.x + x, 0.65, at.z + z * 0.7);
      post.castShadow = true;
      ring.add(post);
    });
    ropeColors.forEach((color, level) => {
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
      for (let side = 0; side < 4; side += 1) {
        if (side === 2) continue; // the near side stays open so she can see in
        const [ax, az] = corners[side];
        const [bx, bz] = corners[(side + 1) % 4];
        const start = new THREE.Vector3(at.x + ax, 0.45 + level * 0.32, at.z + az * 0.7);
        const end = new THREE.Vector3(at.x + bx, 0.45 + level * 0.32, at.z + bz * 0.7);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, start.distanceTo(end), 6), material);
        rope.position.copy(start).lerp(end, 0.5);
        rope.lookAt(end);
        rope.rotateX(Math.PI / 2);
        ring.add(rope);
      }
    });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(half * 2.1, 0.08, half * 1.5), new THREE.MeshStandardMaterial({ color: "#2b3f8f", roughness: 0.7 }));
    mat.position.set(at.x, 0.04, at.z);
    mat.receiveShadow = true;
    ring.add(mat);
    scene.add(ring);
    const spots = [-1, 1].map((side) => {
      const spot = new THREE.SpotLight("#fff2c8", 18, 22, 0.45, 0.6, 1.2);
      spot.position.set(at.x + side * 5, 9, at.z + 4);
      spot.target.position.copy(at);
      scene.add(spot, spot.target);
      return spot;
    });
    return (time) => {
      spots.forEach((spot, index) => {
        spot.target.position.set(at.x + Math.sin(time * 0.7 + index * 2) * 0.8, 0, at.z + Math.cos(time * 0.5 + index) * 0.5);
      });
    };
  },
};

/** GeGeGe no Kitarō, spirits, art and stories, gentle "ready? go!", effort over accuracy (Ila's chart). */
export const YOKAI_NIGHT_PACK: OrbThemePack = {
  id: "yokai-night",
  name: "Yokai Night",
  from: "Loves GeGeGe no Kitarō and Doraemon, art and stories; needs a clear 'Ready? Go!' and celebration of effort; any hint of wrong and she withdraws.",
  sounds: {
    ...ORB_SOUND_LIBRARY,
    arrive: "/games/cookoff/fable-ila/assets/sfx/spirit-arrive.mp3",
    moonWake: "/games/cookoff/fable-ila/assets/sfx/moon-wake.mp3",
    softOops: "/games/cookoff/fable-ila/assets/sfx/soft-oops.mp3",
    whoosh: "/games/cookoff/opus-ila/assets/sfx/whoosh.mp3",
    giggle: "/games/cookoff/opus-ila/assets/sfx/giggle.mp3",
    beam: "/games/cookoff/opus-ila/assets/sfx/beam.mp3",
    nightMusic: "/games/cookoff/opus-ila/assets/sfx/music.mp3",
  },
  beds: [{ key: "nightMusic", volume: 0.7 }],
  cues: { ready: { text: "Ready? Go!" }, throw: "whoosh", impact: ["beam"], shake: "tick", caught: ["moonWake", "giggle"], breakFree: "softOops", correct: "arrive" },
  shakeLabels: ["✨", "✨✨", "✨✨✨"],
  caughtLine: [{ text: "You did it!" }, { text: "やった!", lang: "ja" }],
  breakFreeLine: (round) => ({ text: round === 1 ? "Oh! It wiggled out. That's okay!" : "So close! Ready? Go!" }),
  wrongLine: { text: "Nice try! Let's hear it again." },
  decorate(scene, at) {
    // Paper lanterns swaying among the trees, and a small torii gate behind the spirit.
    const lanterns: THREE.Group[] = [];
    const paper = new THREE.MeshStandardMaterial({ color: "#ffb36b", emissive: "#ff8a3d", emissiveIntensity: 1.2, roughness: 0.6 });
    const cap = new THREE.MeshStandardMaterial({ color: "#2b1d16" });
    const glow = glowTexture("rgba(255,170,90,0.9)");
    for (let index = 0; index < 9; index += 1) {
      const lantern = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), paper);
      body.scale.y = 1.25;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), cap);
      top.position.y = 0.29;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(1.4, 1.4, 1);
      const light = new THREE.PointLight("#ff9a4d", 1.6, 4);
      lantern.add(body, top, halo, light);
      const side = index % 2 ? 1 : -1;
      lantern.position.set(at.x + side * (2.2 + (index % 4) * 1.4), 2.4 + (index % 3) * 0.4, at.z - 1 - (index % 5) * 1.2);
      scene.add(lantern);
      lanterns.push(lantern);
    }
    const torii = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: "#c8322f", roughness: 0.6 });
    [-1.4, 1.4].forEach((x) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 12), red);
      pillar.position.set(x, 1.6, 0);
      torii.add(pillar);
    });
    const beamTop = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: "#1f1a1a" }));
    beamTop.position.y = 3.3;
    const beamLow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.22), red);
    beamLow.position.y = 2.75;
    torii.add(beamTop, beamLow);
    torii.position.set(at.x, 0, at.z - 3.2);
    scene.add(torii);
    return (time) => {
      lanterns.forEach((lantern, index) => {
        lantern.rotation.z = Math.sin(time * 1.2 + index) * 0.08;
        lantern.position.y += Math.sin(time * 1.5 + index * 1.7) * 0.0015;
      });
    };
  },
};

/** The plain meadow, for a child with no pack chosen yet. */
export const MEADOW_PACK: OrbThemePack = {
  ...YOKAI_NIGHT_PACK,
  id: "meadow",
  name: "Meadow",
  from: "Default: no pack chosen from her chart yet.",
  beds: [{ key: "music", volume: 0.6 }],
  shakeLabels: ["Shake...", "Shake...", "Click!"],
  decorate: () => () => undefined,
};

export const ORB_THEME_PACKS: Record<string, OrbThemePack> = {
  [MEADOW_PACK.id]: MEADOW_PACK,
  [CHAMPIONSHIP_PACK.id]: CHAMPIONSHIP_PACK,
  [YOKAI_NIGHT_PACK.id]: YOKAI_NIGHT_PACK,
};
