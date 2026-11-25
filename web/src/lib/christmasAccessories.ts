import * as THREE from "three";

// Christmas drop 2026 (owner, 2026-11-25): headwear built in code, like the crown. Every piece is drawn around the
// crown's band (radius 0.105 at y = 0, front toward -Z) and carries that band as an invisible fit anchor, so it wears
// the crown's proven fit on every companion body without a new fitting file.

export const CHRISTMAS_ACCESSORY_IDS = [
  "santa-hat", "elf-hat", "earmuffs", "pompom-beanie", "candy-cane-bow", "jingle-bell-bow", "mistletoe-headband",
  "gingerbread-clip", "reindeer-antlers", "holly-crown", "star-topper", "snowflake-tiara",
] as const;
export type ChristmasAccessoryId = typeof CHRISTMAS_ACCESSORY_IDS[number];
export const FIT_ANCHOR_NAME = "sunny-fit-band";

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const RED = () => mat(0xd42a3c, { roughness: 0.75 });
const WHITE = () => mat(0xfbfbff, { roughness: 0.95 });
const GREEN = () => mat(0x1f8a4c, { roughness: 0.7 });
const GOLD = () => mat(0xffc83d, { emissive: 0x8a4b00, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 });
const BROWN = () => mat(0x8b5a2b, { roughness: 0.8 });

function add(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...at);
  if (rotation) mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}
function rod(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) {
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, length, 8), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  group.add(mesh);
  return mesh;
}
/** A thin band over the top of her head, ear to ear, that bows and clips sit on. */
// Measured on Elli in the lab (2026-11-25): the crown's band sits on the top of her hair; her forehead hairline is
// about 0.06 below it and her ears about 0.13 below, with her hair about 0.12 wide each side (local units).
function headband(group: THREE.Group, material: THREE.Material, tube = 0.009) {
  add(group, new THREE.TorusGeometry(0.12, tube, 8, 32, Math.PI), material, [0, -0.085, 0], undefined, [1, 0.75, 1]);
}
/** A hat pulled down over her head: a cuff at her hairline and a crown of cloth over the top of her hair. */
function hatBase(group: THREE.Group, cloth: THREE.Material, cuff: THREE.Material, cuffTube = 0.026) {
  add(group, new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloth, [0, -0.06, 0], undefined, [1, 0.8, 1]);
  add(group, new THREE.TorusGeometry(0.12, cuffTube, 10, 36), cuff, [0, -0.06, 0], [Math.PI / 2, 0, 0]);
}
function bow(group: THREE.Group, material: THREE.Material, knot: THREE.Material, at: [number, number, number], size = 1) {
  for (const side of [-1, 1]) add(group, new THREE.TorusGeometry(0.03 * size, 0.012 * size, 8, 20), material, [at[0] + side * 0.032 * size, at[1], at[2]], [0, 0, side * 0.5], [1.15, 0.75, 0.6]);
  add(group, new THREE.SphereGeometry(0.016 * size, 10, 8), knot, at);
}
function snowflake(group: THREE.Group, material: THREE.Material, at: [number, number, number], radius: number) {
  const flake = new THREE.Group();
  flake.position.set(...at);
  for (let arm = 0; arm < 6; arm += 1) {
    const turn = (arm / 6) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.16, radius, radius * 0.08), material);
    spoke.position.set(Math.sin(turn) * radius * 0.5, Math.cos(turn) * radius * 0.5, 0);
    spoke.rotation.z = -turn;
    flake.add(spoke);
    for (const side of [-1, 1]) {
      const twig = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.1, radius * 0.38, radius * 0.06), material);
      twig.position.set(Math.sin(turn) * radius * 0.62 + Math.cos(turn) * side * radius * 0.12, Math.cos(turn) * radius * 0.62 - Math.sin(turn) * side * radius * 0.12, 0);
      twig.rotation.z = -turn + side * 0.8;
      flake.add(twig);
    }
  }
  group.add(flake);
}

const BUILDERS: Record<ChristmasAccessoryId, (group: THREE.Group) => void> = {
  "santa-hat": (g) => {
    hatBase(g, RED(), WHITE(), 0.03);
    add(g, new THREE.ConeGeometry(0.085, 0.2, 24), RED(), [0.025, 0.08, 0.015], [0.12, 0, -0.42]);
    add(g, new THREE.SphereGeometry(0.034, 12, 10), WHITE(), [0.085, 0.165, 0.035]);
  },
  "elf-hat": (g) => {
    hatBase(g, GREEN(), RED(), 0.022);
    add(g, new THREE.ConeGeometry(0.08, 0.25, 24), GREEN(), [-0.015, 0.1, 0.02], [0.2, 0, 0.18]);
    add(g, new THREE.SphereGeometry(0.022, 12, 10), GOLD(), [-0.055, 0.215, 0.065]);
  },
  "pompom-beanie": (g) => {
    hatBase(g, RED(), WHITE(), 0.024);
    for (const [y, r] of [[-0.02, 0.112], [0.012, 0.085]] as const) add(g, new THREE.TorusGeometry(r, 0.007, 8, 36), WHITE(), [0, y, 0], [Math.PI / 2, 0, 0]);
    add(g, new THREE.SphereGeometry(0.042, 14, 12), WHITE(), [0, 0.05, 0]);
  },
  earmuffs: (g) => {
    add(g, new THREE.TorusGeometry(0.135, 0.011, 8, 32, Math.PI), mat(0xd9e6ff, { metalness: 0.3, roughness: 0.4 }), [0, -0.13, 0], undefined, [1, 1.08, 1]);
    for (const side of [-1, 1]) add(g, new THREE.SphereGeometry(0.048, 16, 12), mat(0xffffff, { roughness: 1, emissive: 0x9fc4ff, emissiveIntensity: 0.12 }), [side * 0.137, -0.13, 0], undefined, [0.6, 1, 1]);
  },
  "candy-cane-bow": (g) => {
    headband(g, RED());
    bow(g, RED(), WHITE(), [0.06, 0.01, -0.035], 1.7);
    const path = new THREE.CatmullRomCurve3([[0.0, 0.0], [0.0, 0.07], [0.012, 0.09], [0.032, 0.092], [0.042, 0.078]].map(([x, y]) => new THREE.Vector3(x * 1.5, y * 1.5, 0)));
    for (let i = 0; i < 10; i += 1) {
      const a = path.getPoint(i / 10), b = path.getPoint((i + 1) / 10);
      rod(g, a.add(new THREE.Vector3(-0.075, -0.02, -0.02)), b.add(new THREE.Vector3(-0.075, -0.02, -0.02)), 0.012, i % 2 ? WHITE() : RED());
    }
  },
  "jingle-bell-bow": (g) => {
    headband(g, RED());
    bow(g, RED(), GOLD(), [-0.06, 0.01, -0.035], 1.8);
    for (const side of [-1, 1]) {
      add(g, new THREE.SphereGeometry(0.028, 12, 10), GOLD(), [-0.06 + side * 0.035, -0.04, -0.06]);
    }
  },
  "mistletoe-headband": (g) => {
    headband(g, GREEN());
    for (const [x, z, turn] of [[0.05, -0.035, 0.6], [0.09, -0.005, -0.4], [0.02, 0.005, 1.4]] as const) add(g, new THREE.SphereGeometry(0.048, 10, 8), GREEN(), [x, 0.015, z], [0, turn, 0.4], [1, 0.35, 0.5]);
    for (const [x, z] of [[0.052, -0.012], [0.07, 0.004], [0.04, 0.008]] as const) add(g, new THREE.SphereGeometry(0.014, 8, 6), WHITE(), [x, 0.032, z]);
    add(g, new THREE.SphereGeometry(0.02, 10, 8), RED(), [0.055, 0.03, -0.045]);
  },
  "gingerbread-clip": (g) => {
    headband(g, mat(0xf3e1c7));
    const cookie = new THREE.Group();
    cookie.position.set(0.07, 0.025, -0.04);
    cookie.scale.setScalar(1.9);
    cookie.rotation.set(0, 0.3, -0.5);
    const dough = BROWN(), icing = WHITE();
    add(cookie as THREE.Group, new THREE.SphereGeometry(0.018, 12, 10), dough, [0, 0.03, 0], undefined, [1, 1, 0.45]);
    add(cookie as THREE.Group, new THREE.SphereGeometry(0.022, 12, 10), dough, [0, 0, 0], undefined, [0.9, 1.1, 0.45]);
    for (const side of [-1, 1]) {
      add(cookie as THREE.Group, new THREE.CapsuleGeometry(0.007, 0.018, 4, 8), dough, [side * 0.026, 0.006, 0], [0, 0, side * 1.1]);
      add(cookie as THREE.Group, new THREE.CapsuleGeometry(0.008, 0.016, 4, 8), dough, [side * 0.011, -0.028, 0], [0, 0, side * 0.3]);
    }
    for (const y of [0.008, -0.006]) add(cookie as THREE.Group, new THREE.SphereGeometry(0.004, 6, 6), icing, [0, y, -0.01]);
    g.add(cookie);
  },
  "reindeer-antlers": (g) => {
    const antler = BROWN();
    headband(g, antler);
    for (const side of [-1, 1]) {
      const base = new THREE.Vector3(side * 0.058, 0.0, 0);
      const tip = new THREE.Vector3(side * 0.115, 0.155, 0.01);
      rod(g, base, tip, 0.011, antler);
      rod(g, base.clone().lerp(tip, 0.45), new THREE.Vector3(side * 0.06, 0.11, -0.02), 0.008, antler);
      rod(g, base.clone().lerp(tip, 0.75), new THREE.Vector3(side * 0.155, 0.15, -0.01), 0.007, antler);
      add(g, new THREE.SphereGeometry(0.022, 10, 8), mat(0xc79a6b), [side * 0.1, -0.025, 0.005], [0, 0, side * 0.6], [0.5, 1, 0.3]);
    }
  },
  "holly-crown": (g) => {
    add(g, new THREE.TorusGeometry(0.108, 0.016, 10, 40), GREEN(), [0, 0.012, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 10; i += 1) {
      const turn = (i / 10) * Math.PI * 2;
      add(g, new THREE.SphereGeometry(0.03, 10, 8), GREEN(), [Math.sin(turn) * 0.11, 0.03, -Math.cos(turn) * 0.11], [0, -turn, 0.5], [1.1, 0.4, 0.5]);
      if (i % 2 === 0) for (const dy of [0, 0.014]) add(g, new THREE.SphereGeometry(0.011, 8, 6), RED(), [Math.sin(turn + 0.18) * 0.115, 0.04 + dy, -Math.cos(turn + 0.18) * 0.115]);
    }
  },
  "star-topper": (g) => {
    const gold = GOLD();
    headband(g, gold, 0.007);
    rod(g, new THREE.Vector3(0, 0.0, 0), new THREE.Vector3(0, 0.08, 0), 0.007, gold);
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i += 1) {
      const r = i % 2 ? 0.024 : 0.058, turn = (i / 10) * Math.PI * 2;
      if (i === 0) shape.moveTo(Math.sin(turn) * r, Math.cos(turn) * r); else shape.lineTo(Math.sin(turn) * r, Math.cos(turn) * r);
    }
    const star = add(g, new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 1 }),
      mat(0xffe066, { emissive: 0xffb300, emissiveIntensity: 1.4, metalness: 0.4, roughness: 0.25 }), [0, 0.125, 0]);
    star.geometry.center();
  },
  "snowflake-tiara": (g) => {
    const silver = mat(0xe8f4ff, { metalness: 0.8, roughness: 0.2, emissive: 0x6fb7ff, emissiveIntensity: 0.35 });
    const ice = mat(0xcdeaff, { emissive: 0x5cc8ff, emissiveIntensity: 1.8, metalness: 0.2, roughness: 0.15 });
    add(g, new THREE.TorusGeometry(0.108, 0.01, 8, 40, Math.PI), silver, [0, 0.005, 0], [-Math.PI / 2, 0, 0]);
    snowflake(g, ice, [0, 0.075, -0.112], 0.085);
    for (const side of [-1, 1]) snowflake(g, ice, [side * 0.07, 0.042, -0.088], 0.042);
    for (const [x, y, z] of [[0, 0.135, -0.11], [-0.045, 0.1, -0.1], [0.045, 0.1, -0.1], [-0.095, 0.03, -0.06], [0.095, 0.03, -0.06]] as const) {
      add(g, new THREE.OctahedronGeometry(0.009), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 2.2 }), [x, y, z]);
    }
  },
};

export function isChristmasAccessory(id: string): id is ChristmasAccessoryId {
  return (CHRISTMAS_ACCESSORY_IDS as readonly string[]).includes(id);
}

/** Builds one Christmas piece with its invisible fit anchor: the crown's band, which the crown's fit is measured on. */
export function buildChristmasAccessory(id: ChristmasAccessoryId, group: THREE.Group): void {
  const anchor = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 6, 24), new THREE.MeshBasicMaterial());
  anchor.name = FIT_ANCHOR_NAME;
  anchor.rotation.x = Math.PI / 2;
  anchor.visible = false;
  group.add(anchor);
  BUILDERS[id](group);
}
