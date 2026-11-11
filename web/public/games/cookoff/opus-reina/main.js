import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const TEST = new URLSearchParams(location.search).has('test'); const LITE = new URLSearchParams(location.search).has('lite');   // ?lite = no shadows/bloom, for headless lab runs
if (TEST) document.head.insertAdjacentHTML('beforeend', '<style>*{transition:none!important;animation:none!important}</style>');
const log = (...a) => console.log(' 🎮 [arena3d]', ...a);
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const EV = (name, p) => { try { window.SunnyEvidence?.[name]({ activityId: 'opus-reina', ...p }); } catch (e) { console.warn(' 🎮 [arena3d] [evidence] [failed]', e); } };

// ---------------- content (from the Planner target) ----------------
// The board's items (window.SUNNY_GAME_CONFIG via the library bridge) replace the built-in facts when present.
const LIB = window.SunnyLibrary || { hasItems: false, items: [] };
// A division item: the total and the divisor are numbers in its prompt whose quotient is its answer; anything else is shown as written.
function parseDivision(item) {
  const a = Number(String(item.answer).trim()); const nums = (String(item.prompt).match(/\d+/g) || []).map(Number);
  if (Number.isFinite(a) && a > 0) for (const n of nums) for (const g of nums) if (g > 1 && n !== g && n % g === 0 && n / g === a && n <= 100) return { n, g, a };
  return { n: 0, g: 0, a: Number.isFinite(a) ? a : NaN, raw: true };
}
const BUILT_IN = [[16,4],[24,3],[18,3],[28,4],[30,5],[36,4],[42,6],[48,6]].map(([n, g]) => ({ n, g, a: n / g, target: `${n}÷${g}` }));
const SOURCE = LIB.hasItems ? LIB.items.filter(it => { const ok = Number.isFinite(Number(String(it.answer).trim())) && Number(it.answer) > 0; if (!ok) console.warn(' 🎮 [library-game] [content] [skipped] item=' + it.itemId + ' reason=answer_not_a_positive_number'); return ok; }).map(it => ({ ...parseDivision(it), target: it.prompt || it.answer, text: it.prompt })) : BUILT_IN;
const BOSS_FROM = SOURCE.length >= 4 ? SOURCE.length - 2 : SOURCE.length;   // the last two are the boss when there are enough
const TASKS = SOURCE.map((f, i) => ({ ...f, mode: f.raw ? 'raw' : i < 2 ? 'deal' : i < 4 ? 'div' : 'times', boss: i >= BOSS_FROM }));
log('[content]', LIB.hasItems ? `items=${TASKS.length} raw=${TASKS.filter(t => t.raw).length}` : 'built-in');

// ---------------- audio ----------------
const SFX = {}; ['jump','correct','boss-roar','boom','boss','fanfare','rumble','riser','coin','hit_pop','combo','miss_thunk','on_fire','complete_fanfare','crowd-cheer','takedown','legendary','epic','tick']
  .forEach(n => SFX[n] = `/a3d/sfx/${n}.${['hit_pop','combo','miss_thunk','on_fire','complete_fanfare'].includes(n) ? 'wav' : 'mp3'}`);
function play(n, v = .7, rate = 1) { const a = new Audio(SFX[n]); a.volume = v; a.playbackRate = rate; a.play().catch(e => console.warn(' 🎮 [arena3d] [audio] [blocked]', n, e.message)); }
const music = new Audio('/a3d/sfx/music-loop.mp3'); music.loop = true; music.volume = .28;
const crowdLoop = new Audio('/a3d/sfx/crowd-loop.mp3'); crowdLoop.loop = true; crowdLoop.volume = .35;

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// Render scale 1.25 + 2x MSAA (measured on M1: steady 60 fps; 1.5+4x fell to ~33 fps). Knobs: ?pr= ?msaa=. Owner 11/11: "looks like 480p… laggy".
const Q = new URLSearchParams(location.search); const PR = LITE ? .5 : +(Q.get('pr') || 1.25); renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LITE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070a1e); scene.fog = new THREE.Fog(0x070a1e, 20, 48);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 200); camera.position.set(0, 3, 11);
// The composer draws into its own render target, which ignores antialias:true — give it MSAA or thin hair/edges alias into speckles.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: LITE ? 0 : +(Q.get('msaa') ?? 2) })); composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .45, .45, .92); if (!LITE) composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// lights
scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x1a0f20, .9));
const key = new THREE.SpotLight(0xfff4e0, 160, 40, .6, .5, 1.2); key.position.set(0, 16, 6); key.target.position.set(0, 0, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; scene.add(key, key.target);
[[-9, 0xff5a8a], [9, 0x5ab4ff]].forEach(([x, c]) => { const s = new THREE.SpotLight(c, 70, 40, .5, .6, 1.2); s.position.set(x, 13, 3); s.target.position.set(x * .3, 0, 0); scene.add(s, s.target); });
const rim = new THREE.DirectionalLight(0x9ab8ff, .8); rim.position.set(-4, 6, -8); scene.add(rim);
// light cones (fake volumetrics)
const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: .025, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
[-7, 0, 7].forEach(x => { const c = new THREE.Mesh(new THREE.ConeGeometry(3.4, 15, 32, 1, true), coneMat); c.position.set(x, 7.5, -1); scene.add(c); });

// mat
const matTex = canvasTex(2048, 820, (g, w, h) => {
  g.fillStyle = '#b3122e'; g.fillRect(0, 0, w, h); g.fillStyle = '#1557c9'; g.fillRect(40, 40, w - 80, h - 80);
  const gr = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w / 2); gr.addColorStop(0, '#2a74e8'); gr.addColorStop(1, '#0f3f99'); g.fillStyle = gr; g.fillRect(40, 40, w - 80, h - 80);
  g.strokeStyle = '#ffffffdd'; g.lineWidth = 14; g.beginPath(); g.ellipse(w / 2, h / 2, 330, 330, 0, 0, 7); g.stroke();
  g.lineWidth = 8; g.beginPath(); g.ellipse(w / 2, h / 2, 60, 60, 0, 0, 7); g.stroke();
  g.fillStyle = '#ffffff22'; g.font = 'bold 120px "Lilita One"'; g.textAlign = 'center'; g.fillText('SQUAD GYM', w / 2, h - 110);
});
const mat = new THREE.Mesh(new THREE.BoxGeometry(22, .3, 8.8), [0, 0, new THREE.MeshStandardMaterial({ map: matTex, roughness: .55 }), 0, 0, 0].map(m => m || new THREE.MeshStandardMaterial({ color: 0x8a0e22, roughness: .6 })));
mat.position.y = -.15; mat.receiveShadow = true; scene.add(mat);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x0d1028, roughness: .25, metalness: .2 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.3; floor.receiveShadow = true; scene.add(floor);

// stands + crowd
const standMat = new THREE.MeshStandardMaterial({ color: 0x1a1f45, roughness: .8 });
for (let t = 0; t < 5; t++) { const s = new THREE.Mesh(new THREE.BoxGeometry(46, .9, 1.6), standMat); s.position.set(0, t * .9, -8 - t * 1.6); scene.add(s); }
const CROWD = 520; const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.22, .35, 4, 8), new THREE.MeshStandardMaterial({ roughness: .7 }), CROWD);
const head = new THREE.InstancedMesh(new THREE.SphereGeometry(.17, 10, 8), new THREE.MeshStandardMaterial({ roughness: .6 }), CROWD);
const crowd = []; const tmp = new THREE.Object3D(), col = new THREE.Color();
const shirts = [0xe8213f, 0x2a74e8, 0xffd23f, 0x2ecc71, 0xff7a1a, 0xffffff, 0x9b59b6, 0x1abc9c], skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
for (let i = 0; i < CROWD; i++) { const t = i % 5; const x = -21 + Math.random() * 42; crowd.push({ x, y: t * .9 + .45 + .45, z: -8 - t * 1.6 + rand(-.3, .3), ph: Math.random() * 7, sp: rand(4, 8) });
  body.setColorAt(i, col.setHex(shirts[i % shirts.length])); head.setColorAt(i, col.setHex(skins[(i * 7) % skins.length])); }
scene.add(body, head); let hype = .2;

// banners + jumbotron
function banner(text, sub) { return canvasTex(512, 900, (g, w, h) => { g.fillStyle = '#b3122e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23f'; g.fillRect(16, 16, w - 32, 10); g.fillRect(16, h - 120, w - 32, 10);
  g.beginPath(); g.moveTo(0, h - 100); g.lineTo(w / 2, h); g.lineTo(w, h - 100); g.fill(); g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(w / 2, 330, 150, 100, 0, 0, 7); g.fill();
  g.fillStyle = '#b3122e'; g.beginPath(); g.ellipse(w / 2, 330, 80, 55, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '84px "Lilita One"'; g.textAlign = 'center'; g.fillText(text, w / 2, 600); g.font = '56px "Lilita One"'; g.fillStyle = '#ffd23f'; g.fillText(sub, w / 2, 680); }); }
[[-12, 'SQUAD', 'GYM'], [-6, 'STATE', 'CHAMPS'], [6, 'TAKE', 'DOWN!'], [12, 'PIN', 'IT!']].forEach(([x, a, b]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.9), new THREE.MeshStandardMaterial({ map: banner(a, b), emissive: 0x330000, side: THREE.DoubleSide }));
  m.position.set(x, 9.2, -10); scene.add(m); });
let jumboTex; const jumbo = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 2.6), new THREE.MeshBasicMaterial({ toneMapped: false })); jumbo.position.set(0, 9.4, -9.9); scene.add(jumbo);
const jumboFrame = new THREE.Mesh(new THREE.BoxGeometry(7.9, 3, .3), new THREE.MeshStandardMaterial({ color: 0x111, metalness: .6, roughness: .3 })); jumboFrame.position.set(0, 9.4, -10.1); scene.add(jumboFrame);
function setJumbo(text, color = '#ffd23f') { jumboTex?.dispose(); jumboTex = canvasTex(1024, 355, (g, w, h) => { g.fillStyle = '#05081a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { g.fillStyle = '#ffffff06'; g.fillRect(0, y, w, 1); }
  g.font = '150px "Lilita One"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 30; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 6); }); jumbo.material.map = jumboTex; jumbo.material.needsUpdate = true; }
setJumbo('SQUAD GYM');

// confetti
const CONF = 600; const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(.09, .16), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF);
const confP = []; for (let i = 0; i < CONF; i++) { confP.push({ on: false }); confetti.setColorAt(i, col.setHSL(Math.random(), .9, .6)); tmp.position.set(0, -50, 0); tmp.updateMatrix(); confetti.setMatrixAt(i, tmp.matrix); }
scene.add(confetti); let confI = 0;
function confettiBurst(n, x = 0, y = 9, spread = 10) { for (let k = 0; k < n; k++) { const p = confP[confI = (confI + 1) % CONF]; Object.assign(p, { on: true, x: x + rand(-spread, spread), y: y + rand(0, 3), z: rand(-4, 3), vx: rand(-.6, .6), vy: rand(-1.5, -.6), r: rand(0, 6), vr: rand(-6, 6), life: 6 }); } }

// Closest camera that still fits the whole play row (x -5…6): ~9 on wide screens, 12 on 4:3.
const camZ = () => THREE.MathUtils.clamp(6.4 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect), 9, 12);
// The chest glow lives in the scene from boot: adding a light mid-game recompiles every material (a visible freeze).
const chestGlow = new THREE.PointLight(0xffd23f, 0, 8); chestGlow.position.set(0, -50, 0); scene.add(chestGlow);

// ---------------- characters ----------------
let vrm = null; const pivot = new THREE.Group(); const player = { x: -4, y: 0, vx: 0, vy: 0, face: 1, ground: true, anim: 0, celebrate: 0, hurt: 0 };
const bones = {};
async function loadMatilda() {
  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
  const who = await LIB.companion?.() ?? { name: '' }; if (who.name) $('bubbleName').textContent = who.name.toUpperCase();
  const gltf = await LIB.loadCompanion(loader, e => { if (e.total) $('loadTxt').textContent = `Loading ${who.name || 'your friend'}… ${Math.round(e.loaded / e.total * 100)}%`; });
  vrm = gltf.userData.vrm; VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.combineSkeletons?.(gltf.scene); VRMUtils.rotateVRM0(vrm);
  // MToon toon shading treats the arena's physical spotlights as overexposure; scale her lit/shade response to the arena's light level.
  const TOON = +(new URLSearchParams(location.search).get('toon') || .3); let toonCount = 0;
  vrm.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.isMToonMaterial) { m.color?.multiplyScalar(TOON); m.shadeColorFactor?.multiplyScalar(TOON); toonCount++; } }); } });
  log('[vrm] [toon-scaled]', toonCount); vrm.scene.rotation.y = Math.PI; pivot.add(vrm.scene); scene.add(pivot); window.__vrm = vrm; window.__cam = camera;
  ['hips','spine','chest','neck','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg']
    .forEach(n => bones[n] = vrm.humanoid.getNormalizedBoneNode(n));
  log('[vrm] [loaded]', vrm.meta?.name || vrm.meta?.title || 'matilda');
  await loadClips().catch(e => console.warn(' 🎮 [arena3d] [anim] [failed] falling back to code poses', e));
}
// ---- Mixamo clips retargeted onto Matilda (port of web/src/utils/mixamoRetarget.ts) ----
const MIXAMO = { Hips:'hips', Spine:'spine', Spine1:'chest', Spine2:'upperChest', Neck:'neck', Head:'head', LeftShoulder:'leftShoulder', LeftArm:'leftUpperArm', LeftForeArm:'leftLowerArm', LeftHand:'leftHand',
  RightShoulder:'rightShoulder', RightArm:'rightUpperArm', RightForeArm:'rightLowerArm', RightHand:'rightHand', LeftUpLeg:'leftUpperLeg', LeftLeg:'leftLowerLeg', LeftFoot:'leftFoot', LeftToeBase:'leftToes',
  RightUpLeg:'rightUpperLeg', RightLeg:'rightLowerLeg', RightFoot:'rightFoot', RightToeBase:'rightToes' };
function retarget(clip, root) {
  const legacy = String(vrm.meta?.metaVersion ?? '').startsWith('0'); const tracks = []; const qi = new THREE.Quaternion(), qp = new THREE.Quaternion(), q = new THREE.Quaternion();
  const srcHips = root.getObjectByName('mixamorigHips') || root.getObjectByName('mixamorig:Hips');
  const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips'); const restY = vrm.humanoid.normalizedRestPose?.hips?.position?.[1] ?? hipsNode.position.y;
  const hipScale = srcHips?.position.y ? restY / srcHips.position.y : .01;
  for (const tr of clip.tracks) {
    const [rig, prop] = [tr.name.slice(0, tr.name.lastIndexOf('.')), tr.name.slice(tr.name.lastIndexOf('.') + 1)];
    const key = rig.replace(/^.*\|/, '').replace(/^mixamorig[:_]?/, ''); const bone = MIXAMO[key]; if (!bone) continue;
    const node = vrm.humanoid.getNormalizedBoneNode(bone); if (!node) continue;
    if (prop === 'quaternion') { const src = root.getObjectByName(rig.replace(/^.*\|/, ''));
      if (src) { src.getWorldQuaternion(qi).invert(); src.parent ? src.parent.getWorldQuaternion(qp) : qp.identity(); } else { qi.identity(); qp.identity(); }
      const v = new Float32Array(tr.values); for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i).premultiply(qp).multiply(qi); if (legacy) { q.x *= -1; q.z *= -1; q.normalize(); } q.toArray(v, i); }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, tr.times, v));
    } else if (prop === 'position' && bone === 'hips') { const v = new Float32Array(tr.values); const [bx, by, bz] = [v[0], v[1], v[2]];
      for (let i = 0; i < v.length; i += 3) { const dx = (v[i] - bx) * hipScale, dy = (v[i + 1] - by) * hipScale, dz = (v[i + 2] - bz) * hipScale;
        v[i] = hipsNode.position.x + (legacy ? -dx : dx); v[i + 1] = hipsNode.position.y + dy; v[i + 2] = hipsNode.position.z + (legacy ? -dz : dz); }
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, tr.times, v)); }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
let mixer = null; const acts = {}; let oneShot = null;
async function loadClips() {
  const fbx = new FBXLoader(); const mx = new THREE.AnimationMixer(vrm.scene);
  await Promise.all(['idle_stand', 'dance_victory', 'fireball', 'shrug', 'ponder_moment'].map(async n => { const root = await fbx.loadAsync(`/animations/${n}.fbx`); const raw = root.animations.find(c => c.tracks.length > 0); if (!raw) throw new Error(`no_tracks:${n}`); const clip = retarget(raw, root); acts[n] = mx.clipAction(clip); }));
  acts.idle_stand.play(); ['dance_victory', 'fireball', 'shrug', 'ponder_moment'].forEach(n => { acts[n].setLoop(THREE.LoopOnce); acts[n].clampWhenFinished = true; });
  mixer = mx;   // only switch to motion capture once every clip is ready (a half-loaded mixer froze the loop)
  mixer.addEventListener('finished', e => { if (oneShot && e.action === acts[oneShot.name]) { e.action.fadeOut(.2); acts.idle_stand.reset().fadeIn(.2).play(); oneShot = null; } });
  log('[anim] [loaded]', Object.keys(acts).join(','));
}
function playOnce(name, secs) { const a = acts[name]; if (!a) return; Object.values(acts).forEach(x => x !== a && x.fadeOut(.15)); a.reset().setEffectiveTimeScale(secs ? a.getClip().duration / secs : 1).fadeIn(.15).play(); oneShot = { name, until: performance.now() + (secs || a.getClip().duration) * 1000 }; }
function poseMatilda(dt, t) {
  if (!vrm) return; const B = bones, p = player;
  const speed = Math.abs(p.vx); p.anim += dt * (4 + speed * 2.2);
  const mocap = mixer && (oneShot || (p.ground && speed < .6 && p.celebrate <= 0));
  if (mocap) { if (!oneShot && !acts.idle_stand.isRunning()) acts.idle_stand.reset().fadeIn(.2).play(); mixer.update(dt);
    const targetRot = oneShot || G.talk ? 0 : p.face * .5;   // she faces Reina while they talk pivot.rotation.y += (targetRot - pivot.rotation.y) * Math.min(1, dt * 10);
    pivot.position.set(p.x, p.y, 0); const sq = p.squash || 0; pivot.scale.set(1.25 * (1 + sq * .12), 1.25 * (1 - sq * .12), 1.25 * (1 + sq * .12)); p.squash = Math.max(0, sq - dt * 6);
    const em = vrm.expressionManager; if (em) { em.setValue('happy', p.celebrate > 0 ? 1 : .25); em.setValue('surprised', p.hurt > 0 ? .8 : 0); em.setValue('blink', (t % 3.7) < .12 ? 1 : 0); }
    vrm.update(dt); return; }
  if (mixer && acts.idle_stand.isRunning()) acts.idle_stand.stop();
  const run = Math.min(1, speed / 5), s = Math.sin(p.anim);
  const set = (b, x = 0, y = 0, z = 0) => b && b.rotation.set(x, y, z);
  // base: athletic stance
  set(B.spine, .12 + run * .18, 0, 0); set(B.chest, .04, 0, 0); set(B.neck, -.06, 0, 0); set(B.head, -.04 + Math.sin(t * 2) * .02, 0, 0);
  set(B.leftUpperArm, s * .9 * run, 0, 1.15 - run * .1); set(B.rightUpperArm, -s * .9 * run, 0, -1.15 + run * .1);
  set(B.leftLowerArm, 0, -.9 * run - .25, 0); set(B.rightLowerArm, 0, .9 * run + .25, 0);
  set(B.leftUpperLeg, -s * .85 * run - .15 * (1 - run), 0, .06); set(B.rightUpperLeg, s * .85 * run - .15 * (1 - run), 0, -.06);
  set(B.leftLowerLeg, Math.max(0, s) * 1.2 * run + .25 * (1 - run), 0, 0); set(B.rightLowerLeg, Math.max(0, -s) * 1.2 * run + .25 * (1 - run), 0, 0);
  if (B.hips) { B.hips.userData.baseY ??= B.hips.position.y; B.hips.position.y = B.hips.userData.baseY + (Math.abs(Math.cos(p.anim)) * .05 * run) - .04 * (1 - run) + Math.sin(t * 2.4) * .008; }
  if (!p.ground) { set(B.leftUpperLeg, -1.0, 0, .1); set(B.rightUpperLeg, -.3, 0, -.1); set(B.leftLowerLeg, 1.5); set(B.rightLowerLeg, .5);
    set(B.leftUpperArm, -.4, 0, .4); set(B.rightUpperArm, -.4, 0, -.4); }
  if (p.celebrate > 0) { const pump = Math.abs(Math.sin(t * 12)) * .4; set(B.leftUpperArm, 0, 0, -.9 + pump); set(B.rightUpperArm, 0, 0, .9 - pump); set(B.leftLowerArm, 0, -.2, 0); set(B.rightLowerArm, 0, .2, 0); }
  const em = vrm.expressionManager; if (em) { em.setValue('happy', p.celebrate > 0 ? 1 : .25); em.setValue('surprised', p.hurt > 0 ? .8 : 0); em.setValue('blink', (t % 3.7) < .12 ? 1 : 0); }
  const targetRot = speed > .3 ? (p.face > 0 ? Math.PI / 2 : -Math.PI / 2) * .85 : (p.celebrate > 0 ? 0 : p.face * .5);
  pivot.rotation.y += (targetRot - pivot.rotation.y) * Math.min(1, dt * 12);
  pivot.position.set(p.x, p.y, 0);
  const sq = p.squash || 0; pivot.scale.set(1.25 * (1 + sq * .12), 1.25 * (1 - sq * .12), 1.25 * (1 + sq * .12)); p.squash = Math.max(0, sq - dt * 6);
  vrm.update(dt);
}

// opponents
const red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: .55 }), white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .6 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1d2e, roughness: .5 });
function makeDummy() {
  const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, 1.35, 24), red); b.position.y = .95; b.castShadow = true; g.add(b);
  [.6, 1.2].forEach(y => { const r = new THREE.Mesh(new THREE.CylinderGeometry(.505, .505, .12, 24), white); r.position.y = y; g.add(r); });
  const h = new THREE.Mesh(new THREE.SphereGeometry(.34, 24, 16), red); h.position.y = 1.95; h.castShadow = true; g.add(h);
  const gear = new THREE.Mesh(new THREE.TorusGeometry(.33, .07, 10, 24), dark); gear.position.y = 1.95; gear.rotation.y = Math.PI / 2; g.add(gear);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.55, .6, .25, 24), dark); base.position.y = .12; g.add(base);
  g.userData = { kind: 'dummy', vx: 0, vy: 0, vr: 0, down: false }; return g;
}
function makeBoss() {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0xc8895c, roughness: .6 }), navy = new THREE.MeshStandardMaterial({ color: 0x1d2a6e, roughness: .45 }), gold = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: .8, roughness: .25, emissive: 0x3a2400 });
  const add = (geo, m, x, y, z, s) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (s) o.scale.set(...s); o.castShadow = true; g.add(o); return o; };
  add(new THREE.CapsuleGeometry(.32, .7, 6, 12), dark, -.32, .6, 0); add(new THREE.CapsuleGeometry(.32, .7, 6, 12), dark, .32, .6, 0);
  add(new THREE.CapsuleGeometry(.85, .9, 8, 20), navy, 0, 1.9, 0, [1, 1, .85]);
  add(new THREE.TorusGeometry(.86, .14, 12, 32), gold, 0, 1.55, 0).rotation.x = Math.PI / 2;
  const armL = add(new THREE.CapsuleGeometry(.27, .9, 6, 12), skin, -1.1, 2.0, 0); armL.rotation.z = .5; const armR = add(new THREE.CapsuleGeometry(.27, .9, 6, 12), skin, 1.1, 2.0, 0); armR.rotation.z = -.5;
  const headM = add(new THREE.SphereGeometry(.55, 24, 18), skin, 0, 3.15, 0);
  add(new THREE.TorusGeometry(.52, .1, 10, 24), dark, 0, 3.15, 0).rotation.y = Math.PI / 2;
  add(new THREE.BoxGeometry(.32, .08, .06), dark, -.2, 3.35, .5).rotation.z = -.35; add(new THREE.BoxGeometry(.32, .08, .06), dark, .2, 3.35, .5).rotation.z = .35;
  add(new THREE.SphereGeometry(.07, 10, 8), dark, -.2, 3.2, .5); add(new THREE.SphereGeometry(.07, 10, 8), dark, .2, 3.2, .5);
  add(new THREE.BoxGeometry(.5, .12, .08), new THREE.MeshStandardMaterial({ color: 0x3a1a0a }), 0, 2.95, .52);
  add(new THREE.CylinderGeometry(.06, .06, .25, 10), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: .9, roughness: .2 }), .15, 2.55, .55).rotation.z = Math.PI / 2;
  g.scale.setScalar(.95); g.userData = { kind: 'boss', hp: 2, vx: 0, vy: 0, vr: 0, down: false, armL, armR }; return g;
}
let foe = null;
function spawnFoe(boss) {
  if (foe) scene.remove(foe); foe = boss ? makeBoss() : makeDummy(); foe.position.set(boss ? 5.4 : 4.8, 7, 0); foe.rotation.y = -Math.PI / 2 + .5; scene.add(foe);
  foe.userData.dropping = true; foe.userData.vy = 0;
}

// crystals + shards + coins
const crystals = []; const shardGeo = new THREE.TetrahedronGeometry(.12); const shards = []; const coins = []; const miniMats = [];
function labelTex(txt, grey) { return canvasTex(256, 256, (g, w, h) => { g.font = '170px "Lilita One"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 18; g.strokeStyle = grey ? '#333' : '#0b2a7a'; g.strokeText(txt, w / 2, h / 2 + 10); g.fillStyle = '#fff'; g.fillText(txt, w / 2, h / 2 + 10); }); }
function makeCrystal(value, x) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(.62, 0), new THREE.MeshPhysicalMaterial({ color: 0x4aa8ff, emissive: 0x1a5cff, emissiveIntensity: .9, roughness: .08, metalness: .1, clearcoat: 1, transparent: true, opacity: .92, flatShading: true }));
  m.scale.set(.85, 1.15, .85); m.castShadow = true;
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(String(value)), depthTest: false, toneMapped: false })); lab.scale.set(1.15, 1.15, 1); lab.renderOrder = 10;
  const g = new THREE.Group(); g.add(m, lab); g.position.set(x, -1, 0); scene.add(g);
  const c = { g, m, lab, value, x, baseY: 3.15, used: false, rise: 0, pulse: 0 }; crystals.push(c); return c;
}
function clearCrystals() { crystals.splice(0).forEach(c => scene.remove(c.g)); }
function shatter(c, toward) {
  for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffe066 : 0x9ad0ff, toneMapped: false })); s.position.copy(c.g.position); scene.add(s);
    const dir = toward ? Math.sign(toward - c.x) : rand(-1, 1); shards.push({ s, vx: dir * rand(3, 9) + rand(-2, 2), vy: rand(1, 6), vz: rand(-2, 2), life: 1.2 }); }
  scene.remove(c.g);
}
function dealCoins(t) {
  coins.splice(0).forEach(o => scene.remove(o.m)); miniMats.splice(0).forEach(m => scene.remove(m));
  const gap = 1.25, x0 = -((t.g - 1) * gap) / 2 - 1;
  for (let k = 0; k < t.g; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.05, .06, .8), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: .5 })); m.position.set(x0 + k * gap, .03, -2.6); m.receiveShadow = true; scene.add(m); miniMats.push(m); }
  if (t.mode !== 'deal' && !t.hinted) return;
  const coinGeo = new THREE.CylinderGeometry(.15, .15, .05, 20), gold = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: .85, roughness: .25, emissive: 0x4a3000 });
  for (let i = 0; i < t.n; i++) { const mi = i % t.g, j = Math.floor(i / t.g); const m = new THREE.Mesh(coinGeo, gold); m.castShadow = true;
    const tx = x0 + mi * gap + ((j % 4) - 1.5) * .22, tz = -2.6 + (Math.floor(j / 4) - .5) * .26; m.position.set(tx, 6, tz); scene.add(m);
    coins.push({ m, ty: .08, delay: i * .09, vy: 0, landed: false }); }
}
function clearCoins() { coins.splice(0).forEach(o => scene.remove(o.m)); miniMats.splice(0).forEach(m => scene.remove(m)); }

// shockwave rings
const rings = [];
function ring(x, color = 0xffd23f) { const r = new THREE.Mesh(new THREE.RingGeometry(.3, .5, 48), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(x, .02, 0); scene.add(r); rings.push({ r, life: .6 }); }

// ---------------- HUD helpers ----------------
let bubbleT; function say(s, ms = 1800) { $('bubbleText').textContent = s; $('bubble').classList.add('show'); clearTimeout(bubbleT); bubbleT = setTimeout(() => $('bubble').classList.remove('show'), ms); }
let bigT; function big(s, ms = 900) { $('big').textContent = s; $('big').classList.add('show'); clearTimeout(bigT); bigT = setTimeout(() => $('big').classList.remove('show'), ms); }
let shake = 0; let hitstop = 0;

// ---------------- game flow ----------------
const G = { state: 'loading', round: 0, takedowns: 0, gems: 0, misses: 0, hint: 0, tries: 0, t0: 0, talk: '', talkHelped: false };
window.__g = G; window.__chest = () => chest; window.__crystals = crystals; window.__player = player; window.__tasks = TASKS;
function questionText(t) { if (t.raw) return t.text; return t.mode === 'times' ? `${t.g} × ? = ${t.n}` : `${t.n} ÷ ${t.g} = ?`; }
function startRound() {
  const t = TASKS[G.round]; G.hint = 0; G.talkHelped = false; G.tries = 0; G.stepStart = performance.now(); t.hinted = false;
  $('card').textContent = questionText(t); $('card').classList.add('show'); setJumbo(questionText(t));
  t.tried = new Set(); const ch = spawnChoices(t); dealCoins(t);
  if (t.raw) { say(t.text, 3600); LIB.speak?.(t.text, { reason: 'library_game_problem' }); } else if (t.mode === 'deal') say(`Deal ${t.n} into ${t.g} squads. How many in each?`, 2600); else if (t.mode === 'times') say('In your head this time!', 1600);
  EV('targetPresented', { target: t.target, itemIndex: G.round, visibleState: { choices: ch, mode: t.mode } });
}
function choiceSet(t) { const pool = [t.a + 1, t.a - 1, t.a + 2, t.a - 2, t.g, t.a + 3, t.n - t.g, t.a + 4, t.a * 2].filter(v => v > 0 && v !== t.a && !t.tried.has(v));
  const picks = [...new Set(pool)].sort(() => Math.random() - .5).slice(0, 3); return [t.a, ...picks].sort(() => Math.random() - .5); }
function spawnChoices(t) { clearCrystals(); const xs = [-4.4, -2.2, 0, 2.2]; const ch = choiceSet(t); ch.forEach((v, k) => makeCrystal(v, xs[k])); return ch; }
function judge(c) {
  if (c.used || G.state !== 'play') return; const t = TASKS[G.round]; const ok = c.value === t.a; G.tries++;
  EV('attemptRecorded', { target: t.target, attemptNumber: G.tries, childAction: { chose: c.value }, result: { correct: ok, hintLevel: G.hint, companionHelp: G.talkHelped, ms: Math.round(performance.now() - G.stepStart) } });
  if (ok) correct(c, t); else wrong(c, t);
}
function correct(c, t) {
  G.state = 'resolve'; c.used = true; play('correct', .8); play('hit_pop', .6); shatter(c, foe.position.x); hitstop = .06; shake = .25; ring(c.x);
  crystals.forEach(o => { if (o !== c) { o.used = true; o.fadeOut = true; } });
  player.celebrate = 0; playOnce('fireball', 1.1); G.gems += 2; hype = 1;
  setTimeout(() => hitFoe(t), 330);
}
function hitFoe(t) {
  const u = foe.userData; play('takedown', .9); play('crowd-cheer', .7); shake = .5; ring(foe.position.x, 0xff5a70); confettiBurst(t.boss ? 60 : 30, foe.position.x, 8, 4);
  if (u.kind === 'boss' && --u.hp > 0) { u.vx = 2.2; u.vy = 3; u.vr = -1.5; u.stagger = 1; $('bossfill').style.width = (u.hp / 2 * 100) + '%'; big('HIT!'); play('boss', .7);
    G.takedowns++; refresh(); EV('targetCompleted', { target: t.target, result: { correct: true, companionHelp: G.talkHelped } }); next(1600); return; }
  if (u.kind === 'boss') { $('bossfill').style.width = '0%'; }
  u.down = true; u.vx = 7; u.vy = 6; u.vr = -9; big(['TAKEDOWN!', 'すごい!', 'PINNED!', 'やった!'][G.round % 4]);
  G.takedowns++; refresh(); EV('targetCompleted', { target: t.target, result: { correct: true, companionHelp: G.talkHelped } });
  say(['Takedown!', 'すごい! Next opponent!', 'Too fast for them!', 'やった!'][G.round % 4]);
  if (G.round >= TASKS.length - 1) { G.state = 'chest'; setTimeout(dropChest, 1300); return; }
  next(1700);
}
function next(ms) { setTimeout(() => { clearCrystals(); clearCoins(); G.round++; const t = TASKS[G.round];
  if (t.boss && foe.userData.kind !== 'boss') { bossIntro(); return; } if (!t.boss && foe.userData.down) spawnFoe(false); G.state = 'play'; startRound(); }, ms); }
function wrong(c, t) {
  c.used = true; play('miss_thunk', .7); c.m.material.color.set(0x777788); c.m.material.emissive.set(0x111118); c.lab.material.map = labelTex(String(c.value), true); c.shakeT = .4;
  G.misses++; G.hint = Math.min(2, G.hint + 1); player.hurt = .6; playOnce('shrug', 1.4); $('card').classList.remove('shake'); void $('card').offsetWidth; $('card').classList.add('shake');
  t.tried.add(c.value); setTimeout(() => { if (G.state === 'play' && TASKS[G.round] === t) { spawnChoices(t); play('tick', .5); } }, 1300);
  if (t.raw) { say(t.hint || 'Not quite. Read it again!', 2600); }
  else if (G.hint === 1) { say(`Not quite. Watch: deal ${t.n} into ${t.g} squads.`, 2600); t.hinted = true; dealCoins(t); }
  else { say(`${t.g} × what = ${t.n}?`, 2600); setTimeout(() => { const r = crystals.find(k => k.value === t.a); if (r) r.pulse = 3; }, 1400); }
}
function bossIntro() {
  G.state = 'intro'; spawnFoe(true); play('rumble', .9); play('boss-roar', .9); hype = 1; shake = .8;
  scene.fog.color.set(0x2a0612); scene.background.set(0x14040a); key.color.set(0xff8a8a);
  big('BOSS: COACH CRUSHER', 1600); setJumbo('BOSS FIGHT', '#ff5a70'); $('bossbar').classList.add('show'); say('Two takedowns and the belt is yours!', 2400);
  setTimeout(() => { G.state = 'play'; startRound(); }, 2200);
}
let chest = null;
function dropChest() {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a3e12, roughness: .6 }), gold = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: .85, roughness: .25, emissive: 0x4a3000 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, .9, 1), wood); base.position.y = .45; base.castShadow = true; g.add(base);
  [-.62, .62].forEach(x => { const b = new THREE.Mesh(new THREE.BoxGeometry(.14, .95, 1.04), gold); b.position.set(x, .46, 0); g.add(b); });
  const lid = new THREE.Group(); lid.position.set(0, .9, -.5); const lm = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1.6, 20, 1, false, 0, Math.PI), wood); lm.rotation.z = Math.PI / 2; lm.position.set(0, 0, .5); lm.castShadow = true; lid.add(lm);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(.28, .3, .1), gold); lock.position.set(0, .05, 1.02); lid.add(lock); g.add(lid);
  const glow = chestGlow; glow.intensity = 0; glow.position.set(0, 1.4, 0); g.add(glow);
  $('card').classList.remove('show'); $('bossbar').classList.remove('show'); setJumbo('TREASURE!');
  g.position.set(1.5, 8, 0); scene.add(g); chest = { g, lid, glow, vy: 0, landed: false, opened: false };
  big('TREASURE!', 1200); say('The belt is in the chest. Go open it!', 3000); play('riser', .7);
}
function openChest() {
  chest.opened = true; play('legendary', .9); play('epic', .6); shake = .6; hype = 1.5; ring(chest.g.position.x, 0xffd23f);
  for (let i = 0; i < 40; i++) setTimeout(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .04, 16), new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: .85, roughness: .2, emissive: 0x6a4500 }));
    m.position.set(chest.g.position.x, 1.2, 0); scene.add(m); shards.push({ s: m, vx: rand(-3, 3), vy: rand(6, 11), vz: rand(-1.5, 2), life: 2.2 }); if (i % 6 === 0) play('coin', .25, rand(1.1, 1.6)); }, i * 30);
  setTimeout(win, 2400);
}
function win() {
  G.state = 'win'; play('fanfare', .9); play('complete_fanfare', .7); play('crowd-cheer', .9); confettiBurst(500, 0, 10, 14); hype = 1.5; player.celebrate = 0; playOnce('dance_victory');
  scene.fog.color.set(0x070a1e); scene.background.set(0x070a1e); key.color.set(0xfff4e0); setJumbo('CHAMPION!'); $('card').classList.remove('show'); $('bossbar').classList.remove('show');
  G.gems += 10; refresh(); const secs = Math.round((performance.now() - G.t0) / 1000);
  EV('activityCompleted', { result: { coinsEarned: G.gems, misses: G.misses, seconds: secs } }); log('[complete]', `gems=${G.gems} misses=${G.misses} seconds=${secs}`);
  setTimeout(() => { $('winTxt').textContent = `${TASKS.length} takedowns · ${G.gems} gems · すごい!`; $('win').classList.remove('hidden'); }, 1800);
}
function refresh() { $('score').textContent = `TAKEDOWNS ${G.takedowns}/${TASKS.length}`; $('gems').textContent = `◆ ${G.gems}`; }

// ---------------- input ----------------
const keys = {}; addEventListener('keydown', e => { keys[e.code] = true; if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault(); }); addEventListener('keyup', e => keys[e.code] = false);
const touch = { L: false, R: false, J: false };
[['padL', 'L'], ['padR', 'R'], ['padJ', 'J']].forEach(([id, k]) => { const el = $(id); el.addEventListener('pointerdown', e => { touch[k] = true; el.setPointerCapture(e.pointerId); }); ['pointerup', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => touch[k] = false)); });
let jumpHeld = false;

// ---------------- loop ----------------
const clock = new THREE.Clock(); let t = 0;
window.__frames = 0; let stepErrors = 0;
function step() { try { frame(); } catch (e) { if (stepErrors++ < 5) console.error(' 🎮 [arena3d] [frame] [failed]', e); } }
function frame() { window.__frames++;
  let dt = Math.min(.05, clock.getDelta()); t += dt;
  if (hitstop > 0) { hitstop -= dt; dt *= .05; }
  const p = player; const L = keys.ArrowLeft || keys.KeyA || touch.L, R = keys.ArrowRight || keys.KeyD || touch.R, J = keys.Space || keys.ArrowUp || keys.KeyW || touch.J;
  if (G.state === 'play' || G.state === 'resolve' || G.state === 'intro' || G.state === 'chest') {
    const acc = p.ground ? 38 : 22; if (L) { p.vx -= acc * dt; p.face = -1; } else if (R) { p.vx += acc * dt; p.face = 1; } else p.vx *= p.ground ? .82 : .97;
    p.vx = THREE.MathUtils.clamp(p.vx, -6.5, 6.5);
    if (J && !jumpHeld && p.ground) { p.vy = 10.2; p.ground = false; play('jump', .45); p.squash = -1; }
    jumpHeld = J; if (!J && p.vy > 3) p.vy *= .9;
  }
  p.vy -= 26 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  const maxX = chest ? 9 : foe ? foe.position.x - 1.2 : 9; p.x = THREE.MathUtils.clamp(p.x, -9.5, maxX);
  if (p.y <= 0) { if (!p.ground && p.vy < -4) { p.squash = 1; ring(p.x, 0xffffff); } p.y = 0; p.vy = 0; p.ground = true; }
  p.celebrate = Math.max(0, p.celebrate - dt); p.hurt = Math.max(0, p.hurt - dt);
  // crystal hits from below (head ~1.55 above feet)
  for (const c of crystals) {
    c.rise = Math.min(1, c.rise + dt * 2.5); const ease = 1 - Math.pow(1 - c.rise, 3);
    const y = -1 + (c.baseY + 1) * ease + Math.sin(t * 2 + c.x) * .08; c.g.position.y = y; c.m.rotation.y += dt * 1.2;
    if (c.shakeT > 0) { c.shakeT -= dt; c.g.position.x = c.x + Math.sin(t * 60) * .08; } else c.g.position.x = c.x;
    if (c.pulse > 0) { c.pulse -= dt; const s = 1 + Math.abs(Math.sin(t * 8)) * .25; c.g.scale.setScalar(s); } else if (!c.fadeOut) c.g.scale.setScalar(1);
    if (c.fadeOut) { c.g.scale.multiplyScalar(.9); }
    if (!c.used && G.state === 'play' && c.rise >= 1 && p.vy > 0 && Math.abs(p.x - c.x) < .7 && p.y + 1.95 >= y - .62) { p.vy = -2; c.g.position.y += .2; play('hit_pop', .5, 1.2); judge(c); }
  }
  if (chest) { if (!chest.landed) { chest.vy -= 30 * dt; chest.g.position.y += chest.vy * dt; if (chest.g.position.y <= 0) { chest.g.position.y = 0; chest.landed = true; shake = .5; play('boom', .6); ring(chest.g.position.x, 0xffd23f); } }
    else if (!chest.opened) { chest.glow.intensity = 6 + Math.sin(t * 6) * 3; chest.g.rotation.y = Math.sin(t * 2) * .15; if (Math.abs(p.x - chest.g.position.x) < 1.1) openChest(); }
    else { chest.lid.rotation.x = Math.max(-1.9, chest.lid.rotation.x - dt * 6); chest.glow.intensity = Math.min(40, chest.glow.intensity + dt * 60); } }
  // foe physics
  if (foe) { const u = foe.userData;
    if (u.dropping) { u.vy -= 30 * dt; foe.position.y += u.vy * dt; if (foe.position.y <= 0) { foe.position.y = 0; u.dropping = false; shake = .35; play('boom', .5); ring(foe.position.x, 0xffffff); } }
    else if (u.down || u.stagger) { u.vy -= 26 * dt; foe.position.x += u.vx * dt; foe.position.y = Math.max(0, foe.position.y + u.vy * dt); foe.rotation.z += u.vr * dt;
      if (u.stagger) { u.stagger -= dt; if (u.stagger <= 0) { u.stagger = 0; foe.rotation.z = 0; u.vx = 0; foe.position.x = 5.4; } }
      if (u.down && foe.position.y === 0) { u.vx *= .9; u.vr *= .85; foe.rotation.z = Math.max(foe.rotation.z, -Math.PI / 2); } }
    else { foe.position.y = Math.abs(Math.sin(t * 3)) * (u.kind === 'boss' ? .12 : .04); foe.rotation.y = -Math.PI / 2 + .5 + Math.sin(t * 1.5) * .1;
      if (u.armL) { u.armL.rotation.z = .5 + Math.sin(t * 4) * .3; u.armR.rotation.z = -.5 - Math.sin(t * 4) * .3; } } }
  // shards, rings, coins, confetti, crowd
  for (let i = shards.length - 1; i >= 0; i--) { const s = shards[i]; s.vy -= 18 * dt; s.s.position.x += s.vx * dt; s.s.position.y += s.vy * dt; s.s.position.z += s.vz * dt; s.s.rotation.x += 10 * dt; s.life -= dt; s.s.scale.setScalar(Math.max(.01, s.life)); if (s.life <= 0) { scene.remove(s.s); shards.splice(i, 1); } }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= dt; r.r.scale.setScalar(1 + (.6 - r.life) * 9); r.r.material.opacity = Math.max(0, r.life / .6); if (r.life <= 0) { scene.remove(r.r); rings.splice(i, 1); } }
  coins.forEach(o => { o.delay -= dt; if (o.delay > 0 || o.landed) return; o.vy -= 30 * dt; o.m.position.y += o.vy * dt; o.m.rotation.x += dt * 8; if (o.m.position.y <= o.ty) { o.m.position.y = o.ty; o.m.rotation.x = 0; if (Math.abs(o.vy) > 3) { o.vy *= -.35; if (!o.clinked) { o.clinked = true; play('coin', .18, 1.4); } } else { o.landed = true; } } });
  for (let i = 0; i < CONF; i++) { const c = confP[i]; if (!c.on) continue; c.life -= dt; c.vy = Math.max(-2.2, c.vy - dt * .8); c.x += c.vx * dt + Math.sin(t * 3 + i) * .01; c.y += c.vy * dt; c.r += c.vr * dt;
    tmp.position.set(c.x, c.y, c.z); tmp.rotation.set(c.r, c.r * .7, 0); tmp.scale.setScalar(1); if (c.y < -.2 || c.life <= 0) { c.on = false; tmp.position.y = -50; } tmp.updateMatrix(); confetti.setMatrixAt(i, tmp.matrix); }
  confetti.instanceMatrix.needsUpdate = true;
  hype = Math.max(.2, hype - dt * .35);
  for (let i = 0; i < CROWD; i++) { const c = crowd[i]; const j = Math.max(0, Math.sin(t * c.sp + c.ph)) * .25 * hype; tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1);
    tmp.position.set(c.x, c.y + j, c.z); tmp.updateMatrix(); body.setMatrixAt(i, tmp.matrix); tmp.position.y += .5; tmp.updateMatrix(); head.setMatrixAt(i, tmp.matrix); }
  body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true;
  // camera
  const fx = foe ? foe.position.x : 6; const cx = THREE.MathUtils.clamp((p.x + fx) * .18, -1.5, 2); shake = Math.max(0, shake - dt * 1.6);
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 3) + (Math.random() - .5) * shake * .4; camera.position.y = 3.2 + p.y * .15 + (Math.random() - .5) * shake * .3; camera.position.z = camZ();
  camera.lookAt(camera.position.x, 1.9 + p.y * .1, 0);
  if (chest?.landed) { const k = Math.min(1, dt * 2.5); camera.position.x += (chest.g.position.x - 1 - camera.position.x) * k; camera.position.z += (8.5 - camera.position.z) * k; camera.position.y += (2.6 - camera.position.y) * k; camera.lookAt(camera.position.x + .6, 1.3, 0); }
  if (window.__camOverride) { const o = window.__camOverride; camera.position.set(o[0], o[1], o[2]); camera.lookAt(o[3], o[4], o[5]); }
  talkFrame(dt);
  poseMatilda(dt, t);
  if (!LITE || window.__frames % 60 === 0) composer.render();   // lite lab runs: full game logic, occasional draws
}
if (TEST || LITE) setInterval(step, 16); else renderer.setAnimationLoop(step);

// ---------------- boot ----------------
spawnFoe(false);
document.fonts.load('40px "Lilita One"').catch(e => console.warn(' 🎮 [arena3d] [font] [failed]', e)).finally(() => setJumbo('SQUAD GYM'));
// Warm-up: build one of everything the match spawns and compile its shaders now, so nothing freezes mid-match (measured 434 ms at round 1).
async function warmUp() {
  const t0 = performance.now(); const c = makeCrystal(1, 0); dealCoins({ g: 2, n: 2, mode: 'deal' }); ring(0); shatter(c, 0); const b = makeBoss(); b.position.y = -20; scene.add(b);
  try { await (renderer.compileAsync ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera)); composer.render(); }
  catch (e) { console.warn(' 🎮 [arena3d] [warmup] [failed]', e); }
  clearCrystals(); clearCoins(); scene.remove(b); rings.splice(0).forEach(r => scene.remove(r.r)); shards.splice(0).forEach(x => scene.remove(x.s));
  log('[warmup] [compiled]', Math.round(performance.now() - t0) + 'ms');
}
loadMatilda().then(warmUp).then(() => { $('loadTxt').textContent = `${TASKS.length} takedowns to win the belt`; $('start').classList.remove('hidden'); G.state = 'title'; })
  .catch(e => { console.error(' 🎮 [arena3d] [vrm] [failed]', e); $('loadTxt').textContent = 'Could not load your friend: ' + e.message; });
function begin() { if (G.state !== 'title') return; $('title').classList.add('hidden'); G.state = 'play'; G.t0 = performance.now(); music.play().catch(e => console.warn(' 🎮 [arena3d] [music] [blocked]', e.message)); crowdLoop.play().catch(e => console.warn(' 🎮 [arena3d] [crowd] [blocked]', e.message));
  play('riser', .6); big('READY… WRESTLE!', 1200); EV('activityStarted', {}); log('[start]'); setTimeout(startRound, 900); }
$('start').addEventListener('click', begin); window.__begin = begin;
// ---------------- "Hey Matilda": Reina talks to Matilda (trial 11/11) ----------------
const ear = $('ear'); let talk = null, AC = null, analyser = null, talkSpeaking = false; const lipBuf = new Float32Array(1024); const talkV = new THREE.Vector3();
function setTalk(v) { G.talk = v; ear.classList.toggle('on', v === 'listening'); }
let talkBlend = 0; const talkCam = new THREE.Vector3(), talkLook = new THREE.Vector3(), baseLook = new THREE.Vector3();
function talkFrame(dt) {   // the arena camera is rebuilt every frame; blend from it toward Matilda's face while she and Reina talk
  talkBlend += ((G.talk ? 1 : 0) - talkBlend) * Math.min(1, dt * 3);
  let mouth = 0; if (talkSpeaking && analyser) { analyser.getFloatTimeDomainData(lipBuf); let s2 = 0; for (let i = 0; i < lipBuf.length; i += 4) s2 += lipBuf[i] * lipBuf[i]; mouth = Math.min(1, Math.sqrt(s2 / (lipBuf.length / 4)) * 9); }
  try { vrm?.expressionManager?.setValue('aa', mouth); } catch { /* model without aa */ }
  if (talkBlend > .002) { const p = player; baseLook.set(camera.position.x, 1.9 + p.y * .1, 0);
    talkCam.set(p.x + .9, 2.35 + p.y, 5.4); talkLook.set(p.x + .35, 1.95 + p.y, 0);
    camera.position.lerp(talkCam, talkBlend); camera.lookAt(baseLook.lerp(talkLook, talkBlend)); }
  if (G.talk === 'listening' && vrm) { const hp = vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(talkV).project(camera); ear.style.left = ((hp.x + 1) / 2 * innerWidth + 60) + 'px'; ear.style.top = ((1 - hp.y) / 2 * innerHeight) + 'px'; }
}
async function playReply(bytes) {
  try {
    const b = await AC.decodeAudioData(bytes); const src = AC.createBufferSource(); src.buffer = b; src.connect(analyser);
    music.volume = .08; crowdLoop.volume = .1; talkSpeaking = true;
    await new Promise(res => { src.onended = res; src.start(); });
  } catch (e) { console.error(' 🎮 [arena3d] [talk] [play-failed]', e); }
  finally { talkSpeaking = false; music.volume = .28; crowdLoop.volume = .35; }
}
function startTalk() {
  if (!window.CompanionTalk) { console.warn(' 🎮 [arena3d] [talk] [client-missing]'); return; }
  try { AC = new AudioContext(); analyser = AC.createAnalyser(); analyser.fftSize = 1024; analyser.connect(AC.destination); AC.resume().catch(e => console.warn(' 🎮 [arena3d] [talk] [resume-failed]', e)); }
  catch (e) { console.error(' 🎮 [arena3d] [talk] [audio-failed]', e); return; }
  talk = CompanionTalk.start({
    child: LIB.childId, childName: '', companion: '', names: [],
    isSpeaking: () => talkSpeaking,
    getContext: () => { const t = TASKS[G.round]; return {
      game: 'Squad Gym: a wrestling arena. Reina moves Matilda and jumps to punch the crystal with the right answer; a right answer is a takedown on the foe. 8 takedowns, a boss, then a chest.',
      screen: G.state, takedowns: G.takedowns, misses: G.misses,
      problem: t && { shown: questionText(t), answer: t.a, mode: t.mode === 'deal' ? 'share equally: deal the total into squads' : t.mode === 'times' ? 'missing factor, in her head' : t.mode,
        crystalsOnScreen: crystals.filter(c => !c.used).map(c => c.value), alreadyTriedWrong: t.tried ? [...t.tried] : [], hintLevel: G.hint, triesThisProblem: G.tries, boss: !!t.boss } }; },
    onWake() { setTalk('listening'); play('hit_pop', .5, 1.4); },
    onSleep() { setTalk(''); },
    onThinking() { setTalk('thinking'); playOnce('ponder_moment', 1.6); },
    async onReply({ text, audio }) { setTalk('speaking'); if (G.state === 'play') G.talkHelped = true; say(text, 6000); await playReply(audio); setTalk('listening'); },
    onFollowUp() { setTimeout(() => { if (G.talk === 'listening' && !talk.awake && !talk.busy) setTalk(''); }, 7200); },
    onError() { setTalk(''); },
  });
  window.__talk = talk;
}
// tap Matilda to talk (works without a microphone)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => {
  if (!talk || !vrm) return; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(pivot, true).length) { log('[talk] [tap]'); talk.wake(); }
});
$('start').addEventListener('click', () => { if (!talk) startTalk(); });
$('again').addEventListener('click', () => location.reload());
