import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SL = window.SunnyLibrary || { hasItems: false, items: [] };
const SE = (n, p) => { try { const s = window.SunnyEvidence; if (s && typeof s[n] === 'function') s[n](p || {}); } catch (e) { console.warn('evidence', e); } };
const store = {
  get(k, d) { try { const v = localStorage.getItem('splitsecond.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('splitsecond.' + k, JSON.stringify(v)); } catch (e) {} }
};
const arr = v => Array.isArray(v) ? v : [];
const SAVE = { best: +store.get('best', 0) || 0, splits: arr(store.get('splits', [])), tier: +store.get('tier', 2) || 2, stickers: arr(store.get('stickers', [])), missed: arr(store.get('missed', [])), seen: store.get('seen', {}) || {}, runs: +store.get('runs', 0) || 0 };

/* ---------- audio: everything is fetched and decoded during loading, nothing after the tap ---------- */
const SND = {}; let AC = null, musicGain, sfxGain, voiceGain, voiceSrcs = [], voiceTok = 0;
try { AC = new (window.AudioContext || window.webkitAudioContext)(); const mk = v => { const g = AC.createGain(); g.gain.value = v; g.connect(AC.destination); return g; }; musicGain = mk(.26); sfxGain = mk(.85); voiceGain = mk(1.25); } catch (e) { AC = null; }
const dec = ab => new Promise(res => { try { const p = AC.decodeAudioData(ab, b => res(b), () => res(null)); if (p && p.catch) p.catch(() => res(null)); } catch (e) { res(null); } });
const reg = (id, url) => { const s = SND[id] = { buf: null, p: null }; s.p = fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(ab => (ab && AC) ? dec(ab) : null).then(b => (s.buf = b)).catch(() => null); };
const LIB = { coin: 'coin.mp3', combo: 'combo.wav', cheer: 'crowd-cheer.mp3', crowd: 'crowd-loop.mp3', fanfare: 'fanfare.mp3', pop: 'hit_pop.wav', legendary: 'legendary.mp3', thunk: 'miss_thunk.wav', music2: 'music-loop.mp3', onfire: 'on_fire.wav', riser: 'riser.mp3', takedown: 'takedown.mp3', tick: 'tick.mp3', boom: 'boom.mp3', roar: 'boss-roar.mp3' };
for (const k in LIB) reg(k, '/a3d/sfx/' + LIB[k]);
try { const A = JSON.parse($('sunny-assets').textContent); A.voice.forEach(v => reg(v.id, 'assets/voice/' + v.id + '.mp3')); A.sfx.forEach(s => reg(s.id, 'assets/sfx/' + s.id + '.mp3')); } catch (e) { console.warn(e); }
const hasV = id => !!(SND[id] && SND[id].buf);
function play(id, o = {}) {
  const s = SND[id]; if (!AC || !s || !s.buf) return null;
  try { const src = AC.createBufferSource(); src.buffer = s.buf; src.loop = !!o.loop; src.playbackRate.value = o.rate || 1; const g = AC.createGain(); g.gain.value = o.vol == null ? 1 : o.vol; src.connect(g); g.connect(o.bus || sfxGain); src.start(); return src; } catch (e) { return null; }
}
function sfx(ids, o) { for (const id of [].concat(ids)) if (hasV(id)) return play(id, o); return null; }
function stopVoice() { voiceSrcs.forEach(s => { try { s.stop(); } catch (e) {} }); voiceSrcs = []; }
function sayRec(ids) {
  if (!AC) return 0; ids = [].concat(ids); voiceTok++; stopVoice();
  let t = AC.currentTime + .04, total = 0;
  for (const id of ids) { const s = SND[id]; if (!s || !s.buf) continue; try { const src = AC.createBufferSource(); src.buffer = s.buf; src.connect(voiceGain); src.start(t); voiceSrcs.push(src); t += s.buf.duration + .12; total += s.buf.duration + .12; } catch (e) {} }
  if (total) { try { const n = AC.currentTime; musicGain.gain.cancelScheduledValues(n); musicGain.gain.setTargetAtTime(.1, n, .05); musicGain.gain.setTargetAtTime(.26, n + total, .3); } catch (e) {} M.talkUntil = T + total; }
  return total;
}
// Lines with no recording (the board's own problems) are said by the companion: 'tts:<text>' ids.
function say(ids) {
  ids = [].concat(ids); const tts = ids.filter(i => typeof i === 'string' && i.startsWith('tts:')).map(i => i.slice(4));
  const rec = ids.filter(i => !(typeof i === 'string' && i.startsWith('tts:'))); const d = rec.length ? sayRec(rec) : 0;
  if (!tts.length || !SL.speak) return d;
  const text = tts.join(' '), est = Math.min(9, .7 + text.split(/\s+/).length * .38);
  setTimeout(() => SL.speak(text, { reason: 'library_game_problem' }), d * 1000); M.talkUntil = T + d + est; return d + est;
}
function initAudio() {
  if (!AC) return; try { AC.resume(); } catch (e) {}
  play(hasV('dojo-music') ? 'dojo-music' : 'music2', { loop: true, bus: musicGain }); play('crowd', { loop: true, bus: musicGain, vol: .5 });
}

/* ---------- 3D world ---------- */
const V = {}; const vv = (k, ...a) => { try { return V[k] && V[k](...a); } catch (e) { console.warn(k, e); } };
const M = { vrm: null, mixer: null, actions: {}, cur: null, talkUntil: 0, happyUntil: 0, blink: 3 };
let renderer, composer, scene, camera, T = 0, abandon = false;
const CAM = { play: [[0, 6.2, 9.5], [0, .8, 0]], face: [[-.7, 4.75, 8.9], [-1.25, 4.2, 5.59]] };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camPosT = new THREE.Vector3(), camLookT = new THREE.Vector3();
function setCam(n, snap) { camPosT.set(...CAM[n][0]); camLookT.set(...CAM[n][1]); if (snap) { camPos.copy(camPosT); camLook.copy(camLookT); } }
function fit() {
  if (!renderer) return; const w = innerWidth, h = innerHeight, a = w / h; camera.aspect = a;
  camera.fov = a >= 16 / 9 ? 40 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) * (16 / 9) / a));
  camera.updateProjectionMatrix(); renderer.setSize(w, h); composer.setSize(w, h);
}
function buildWorld() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const PR = 1.25; renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
  $('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0b24); scene.fog = new THREE.Fog(0x0d0b24, 22, 50);
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .1, 140);
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .45, .45, .92)); composer.addPass(new OutputPass());
  setCam('play', true); fit(); addEventListener('resize', fit);

  // lights (all created now, never added later)
  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x2a1838, 1.25));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.5); key.position.set(4.5, 13, 9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40; key.shadow.bias = -.0006; key.shadow.normalBias = .02; scene.add(key, key.target);
  const rimA = new THREE.PointLight(0xff5a3c, 30, 22, 2); rimA.position.set(-6.5, 3.2, -4); const rimB = new THREE.PointLight(0x4cc9ff, 26, 22, 2); rimB.position.set(6.5, 3.2, -4);
  const flash = new THREE.PointLight(0xffc46b, 0, 16, 2); flash.position.set(0, 2.2, -2.6); scene.add(rimA, rimB, flash);

  const std = (c, r = .6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const glow = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
  const mesh = (g, m, x, y, z, par = scene, cast = true) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = !cast; par.add(o); return o; };

  // arena
  const floor = mesh(new THREE.PlaneGeometry(90, 90), std(0x17142e, .9), 0, -.08, 0, scene, false); floor.rotation.x = -Math.PI / 2;
  mesh(new THREE.CylinderGeometry(6.4, 6.4, .08, 64), std(0x27348f, .75), 0, -.04, -.6, scene, false);
  const ring = mesh(new THREE.RingGeometry(5.3, 5.55, 64), glow(0xffc94d, 1.5), 0, .03, -.6, scene, false); ring.rotation.x = -Math.PI / 2; ring.receiveShadow = false;
  mesh(new THREE.PlaneGeometry(60, 5), std(0x1c1648, .9), 0, 2.5, -13.5, scene, false);
  const banG = new THREE.PlaneGeometry(1.6, 3.4); [-12, -6, 0, 6, 12].forEach((x, i) => mesh(banG, std(i % 2 ? 0xf2efe6 : 0xc2182f, .8), x, 2.9, -13.4, scene, false));
  const lanG = new THREE.SphereGeometry(.28, 14, 10), lanM = glow(0xff9a3c, 2.4);
  for (let i = 0; i < 11; i++) { const l = mesh(lanG, lanM, -10 + i * 2, 4.4 - Math.sin(i / 10 * Math.PI) * .7, -8, scene, false); l.scale.y = 1.2; l.receiveShadow = false; }
  [[-5.4, -3], [-5.4, .5], [5.4, -3], [5.4, .5]].forEach(p => { const l = mesh(lanG, lanM, p[0], 1.7, p[1], scene, false); l.scale.y = 1.2; l.receiveShadow = false; mesh(new THREE.CylinderGeometry(.05, .05, 1.5, 8), std(0x3a2a55), p[0], .75, p[1]); });
  const moonM = glow(0xfff3c4, 1.5); moonM.fog = false; mesh(new THREE.CircleGeometry(2.4, 40), moonM, 2.5, 9.5, -26, scene, false).receiveShadow = false;
  const sp = new Float32Array(240 * 3); for (let i = 0; i < 240; i++) { sp[i * 3] = rnd(-45, 45); sp[i * 3 + 1] = rnd(6, 34); sp[i * 3 + 2] = rnd(-48, -30); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: .22, fog: false })));

  // crowd
  const dummy = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color();
  const crowd = [], cPal = [0xff6b6b, 0xffd45e, 0x5aa9ff, 0x7dffb0, 0xff8ad4, 0xf2efe6, 0xb48cff];
  for (let r = 0; r < 3; r++) {
    const im = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.26, .35, 4, 10), std(0xffffff, .8), 32);
    for (let i = 0; i < 32; i++) { dummy.position.set(-10.9 + i * .7 + (r % 2) * .35, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(rnd(.85, 1.15)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col.set(pick(cPal)).multiplyScalar(.55)); }
    im.position.set(0, .5 + r * .6, -9 - r * 1.2); im.userData.y = im.position.y; scene.add(im); crowd.push(im);
  }
  let crowdE = 0;

  // pedestal (taiko drum) for Matilda
  mesh(new THREE.CylinderGeometry(.85, .85, 2.15, 32), std(0xb3262b, .5), -2, 1.075, 5.59);
  mesh(new THREE.CylinderGeometry(.8, .8, .04, 32), std(0xf3e3c0, .7), -2, 2.16, 5.59, scene, false);

  // squad mats
  const MPAL = [0xff5d5d, 0xffc234, 0x3ddbb4, 0x5aa9ff, 0xff8ad4, 0xb48cff, 0xff9a3c, 0x9be564, 0xf2efe6];
  const matG = new THREE.CylinderGeometry(.66, .7, .07, 40), mats = [], matOn = [], matT0 = new Float32Array(9), matPulse = new Float32Array(9).fill(-9);
  for (let i = 0; i < 9; i++) { const m = mesh(matG, std(MPAL[i], .55), 0, .045, 0, scene, false); m.visible = false; mats.push(m); matOn.push(false); }
  function layout(kind, n) {
    const P = [];
    if (kind === 'groups' || n === 9) { for (let i = 0; i < 9; i++) P.push([(i % 3 - 1) * 1.5, -1.8 + ((i / 3) | 0) * 1.4]); return P; }
    if (n <= 4) { for (let i = 0; i < n; i++) P.push([(i - (n - 1) / 2) * 1.5, -.3]); return P; }
    const top = Math.ceil(n / 2), bot = n - top;
    for (let i = 0; i < top; i++) P.push([(i - (top - 1) / 2) * 1.5, -1.1]);
    for (let i = 0; i < bot; i++) P.push([(i - (bot - 1) / 2) * 1.5, .4]);
    return P;
  }

  // bag
  const bag = new THREE.Group(); bag.position.set(0, 0, 2.5); scene.add(bag);
  const bb = mesh(new THREE.CapsuleGeometry(.42, .9, 8, 20), std(0xd93a3a, .5), 0, .42, 0, bag); bb.rotation.z = Math.PI / 2;
  [-.3, .3].forEach(x => { const s = mesh(new THREE.TorusGeometry(.44, .05, 8, 24), std(0xf2efe6), x, .42, 0, bag); s.rotation.y = Math.PI / 2; });
  let bagT = -9;

  // counters (tiny wrestlers)
  const tint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const cGeo = mergeGeometries([
    tint(new THREE.SphereGeometry(.165, 18, 14).scale(1, .92, 1).translate(0, .152, 0), 0xfff0d2),
    tint(new THREE.TorusGeometry(.158, .034, 8, 22).rotateX(Math.PI / 2).translate(0, .215, 0), 0xe23b3b),
    tint(new THREE.SphereGeometry(.027, 8, 6).translate(-.06, .17, .15), 0x1a1020),
    tint(new THREE.SphereGeometry(.027, 8, 6).translate(.06, .17, .15), 0x1a1020),
    tint(new THREE.SphereGeometry(.055, 10, 8).translate(0, .33, 0), 0x2a1c3a)]);
  const NC = 81, counters = new THREE.InstancedMesh(cGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55 }), NC);
  counters.castShadow = true; counters.frustumCulled = false; scene.add(counters);
  const cState = new Uint8Array(NC), cT = new Float32Array(NC), cFrom = new Float32Array(NC * 3), cTo = new Float32Array(NC * 3), cMat = new Int8Array(NC), cHop = new Float32Array(NC).fill(-1), cRot = new Float32Array(NC);
  for (let i = 0; i < NC; i++) counters.setMatrixAt(i, ZERO);
  let cLive = 0;

  // sparks / confetti
  const NS = 160, sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), NS);
  sparks.frustumCulled = false; scene.add(sparks);
  const sPos = new Float32Array(NS * 3), sVel = new Float32Array(NS * 3), sLife = new Float32Array(NS), sSize = new Float32Array(NS), sGr = new Float32Array(NS); let sNext = 0, sLive = 0;
  for (let i = 0; i < NS; i++) { sparks.setMatrixAt(i, ZERO); sparks.setColorAt(i, col.set(0xffc24a)); }
  function burst(x, y, z, n, o) {
    for (let k = 0; k < n; k++) { const i = sNext, j = i * 3; sNext = (sNext + 1) % NS; const a = rnd(0, 6.283), u = rnd(-.2, 1), s = rnd(o.v0, o.v1), h = Math.sqrt(Math.max(0, 1 - u * u));
      sPos[j] = x; sPos[j + 1] = y; sPos[j + 2] = z; sVel[j] = Math.cos(a) * h * s; sVel[j + 1] = (u * .8 + .5) * s; sVel[j + 2] = Math.sin(a) * h * s;
      sLife[i] = rnd(.5, o.life); sSize[i] = rnd(.6, 1.4) * o.size; sGr[i] = o.g; sparks.setColorAt(i, col.set(pick(o.colors)).multiplyScalar(o.hdr || 1)); }
    sparks.instanceColor.needsUpdate = true; sLive = 1;
  }
  const FIRE = [0xffe46b, 0xff9a3c, 0xff5d5d, 0xffffff], CONF = [0xff5d5d, 0xffd45e, 0x5aa9ff, 0x7dffb0, 0xff8ad4, 0xffffff];
  const O_TRAIL = { v0: .3, v1: 1, life: .5, size: .9, g: 0, colors: FIRE, hdr: 2 };

  // opponent (daruma bully)
  const opp = new THREE.Group(); opp.position.set(0, 0, -4); scene.add(opp); const ob = new THREE.Group(); opp.add(ob);
  const mBody = std(0xd8322f, .45), mTrim = std(0xffc94d, .35, .3), mFace = std(0xfff0d8, .6), mDark = std(0x1b1420, .6), mWhite = std(0xffffff, .4);
  mesh(new THREE.SphereGeometry(1.15, 36, 24), mBody, 0, 1.22, 0, ob).scale.set(1, 1.08, .95);
  mesh(new THREE.SphereGeometry(.74, 28, 20), mFace, 0, 1.5, .72, ob).scale.set(1, .82, .62);
  [-1, 1].forEach(s => {
    mesh(new THREE.SphereGeometry(.17, 14, 10), mWhite, s * .27, 1.6, 1.1, ob); mesh(new THREE.SphereGeometry(.085, 10, 8), mDark, s * .27, 1.58, 1.24, ob);
    mesh(new THREE.BoxGeometry(.46, .1, .12), mDark, s * .3, 1.86, 1.12, ob).rotation.z = s * .42;
    mesh(new THREE.SphereGeometry(.33, 14, 10), mBody, s * 1.22, 1.25, .25, ob);
  });
  mesh(new THREE.TorusGeometry(.22, .045, 8, 20, Math.PI), mDark, 0, 1.14, 1.16, ob);
  mesh(new THREE.TorusGeometry(1.1, .1, 10, 48), mTrim, 0, .78, 0, ob).rotation.x = Math.PI / 2;
  const horns = new THREE.Group(); ob.add(horns); [-1, 1].forEach(s => { mesh(new THREE.ConeGeometry(.16, .5, 12), mFace, s * .55, 2.45, .1, horns).rotation.z = -s * .35; });
  const crown = new THREE.Group(); ob.add(crown); mesh(new THREE.CylinderGeometry(.5, .4, .34, 10), mTrim, 0, 2.6, 0, crown);
  for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(.1, .28, 8), mTrim, Math.cos(i * 1.2566) * .42, 2.9, Math.sin(i * 1.2566) * .42, crown);
  let oppA = 0, oppV = 0, oppTarget = 0, oppScale = 1, oppS = 1, oppST = 1, oppY = 0, oppVY = 0, tauntT = -9, flashI = 0, shakeAmt = 0;

  // fireball
  const fb = mesh(new THREE.SphereGeometry(.28, 16, 12), glow(0xffd070, 3), 0, 0, 0, scene, false); fb.receiveShadow = false; fb.visible = false; let fbT = -1;
  const fbFrom = new THREE.Vector3(-1.35, 4.35, 5.45), fbTo = new THREE.Vector3();

  // DOM labels
  const labs = [], LW = $('labels'); for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'lab dg hidden'; LW.appendChild(d); labs.push({ el: d, on: false, p: new THREE.Vector3(), lx: -1, ly: -1 }); }
  const bagLab = labs[9], v3 = new THREE.Vector3();
  const setLab = (L, txt, x, y, z, cls) => { L.on = txt !== '' && txt != null; L.el.classList.toggle('hidden', !L.on); if (L.on) { L.el.textContent = txt; L.p.set(x, y, z); L.el.classList.toggle('ans', !!cls); L.lx = -1; } };

  /* view API */
  V.setup = item => {
    for (let i = 0; i < NC; i++) if (cState[i]) { cState[i] = 0; counters.setMatrixAt(i, ZERO); } cLive = 1;
    const P = layout(item.kind, item.kind === 'each' ? item.by : 9);
    for (let i = 0; i < 9; i++) { if (i < P.length) { mats[i].position.set(P[i][0], .045, P[i][1]); matOn[i] = item.kind === 'each' || i === 0; matT0[i] = T + i * .04; } else matOn[i] = false; }
    for (let i = 0; i < 9; i++) setLab(labs[i], '');
    bag.visible = true; V.setBag(item.total);
  };
  V.setBag = n => setLab(bagLab, n > 0 ? String(n) : '', 0, .5, 2.5);
  V.launch = (i, m, s) => {
    if (!matOn[m]) { matOn[m] = true; matT0[m] = T; } const p = mats[m].position, j = i * 3;
    cFrom[j] = rnd(-.25, .25); cFrom[j + 1] = .8; cFrom[j + 2] = 2.5; cTo[j] = p.x + (s % 3 - 1) * .34; cTo[j + 1] = .082; cTo[j + 2] = p.z + (((s / 3) | 0) - 1) * .34;
    cState[i] = 1; cT[i] = 0; cMat[i] = m; cHop[i] = -1; cRot[i] = rnd(-.35, .35); bagT = T; cLive = 1;
  };
  V.clear = () => { for (let i = 0; i < NC; i++) if (cState[i]) { cState[i] = 3; cT[i] = 0; } for (let i = 0; i < 9; i++) { matOn[i] = false; setLab(labs[i], ''); } setLab(bagLab, ''); bag.visible = false; };
  V.hop = i => { if (cState[i] === 2) cHop[i] = 0; };
  V.hopMat = m => { matPulse[m] = T; for (let i = 0; i < NC; i++) if (cState[i] === 2 && cMat[i] === m) cHop[i] = 0; };
  V.showAnswer = item => { const n = item.kind === 'each' ? item.by : item.ans; for (let i = 0; i < n; i++) { const p = mats[i].position; setLab(labs[i], String(item.kind === 'each' ? item.ans : i + 1), p.x, .75, p.z, true); } };
  V.setOpp = c => { mBody.color.set(c.color); horns.visible = !!c.horns; crown.visible = !!c.crown; oppScale = c.scale; oppS = 1; oppST = 1; oppA = 0; oppV = 0; oppTarget = 0; oppY = 9; oppVY = 0; opp.visible = true; };
  V.fire = () => { fbTo.set(0, 1.4 * oppScale, -3.4); fbT = 0; fb.visible = true; };
  V.hit = strong => { fbT = -1; fb.visible = false; if (strong) { oppTarget = -1.42; oppV = -16; flashI = 70; shakeAmt = .45; crowdE = 1; burst(0, 1.5 * oppScale, -3.2, 36, { v0: 3, v1: 8, life: 1, size: 1.1, g: 12, colors: FIRE, hdr: 2.2 }); } else { oppV = -6; shakeAmt = .12; burst(0, 1.5 * oppScale, -3.2, 8, { v0: 2, v1: 4, life: .7, size: .8, g: 12, colors: FIRE, hdr: 1.5 }); } };
  V.oppUp = () => { oppTarget = 0; oppV += 5; };
  V.oppOut = () => { oppST = 0; };
  V.taunt = () => { tauntT = T; };
  V.shake = a => { shakeAmt = Math.max(shakeAmt, a); };
  V.cheer = () => { crowdE = 1; };
  V.confetti = face => { for (let k = 0; k < 3; k++) face ? burst(rnd(-3.6, .5), rnd(5.4, 6.2), rnd(4.6, 6.4), 12, { v0: .6, v1: 2.4, life: 2.4, size: 1.2, g: 2.5, colors: CONF, hdr: 1.3 }) : burst(rnd(-3.5, 3.5), rnd(2.5, 4), rnd(-3, 1), 14, { v0: 1, v1: 4, life: 2, size: 1.4, g: 4, colors: CONF, hdr: 1.3 }); };
  V.warm = on => {
    fb.visible = on; horns.visible = on; crown.visible = on; mats.forEach(m => { m.visible = on; });
    for (let i = 0; i < NC; i++) { if (on) { dummy.position.set((i % 9 - 4) * .4, .1, (((i / 9) | 0) - 4) * .4); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); counters.setMatrixAt(i, dummy.matrix); } else counters.setMatrixAt(i, ZERO); }
    for (let i = 0; i < NS; i++) { if (on) { dummy.position.set(rnd(-2, 2), 2, rnd(-2, 2)); dummy.updateMatrix(); sparks.setMatrixAt(i, dummy.matrix); } else sparks.setMatrixAt(i, ZERO); }
    counters.instanceMatrix.needsUpdate = true; sparks.instanceMatrix.needsUpdate = true;
  };
  V.update = dt => {
    const k = 1 - Math.exp(-dt * 3.5); camPos.lerp(camPosT, k); camLook.lerp(camLookT, k); shakeAmt *= Math.exp(-dt * 7);
    camera.position.set(camPos.x + (Math.random() - .5) * shakeAmt, camPos.y + (Math.random() - .5) * shakeAmt, camPos.z); camera.lookAt(camLook); camera.updateMatrixWorld();
    // opponent
    oppV += (-(oppA - oppTarget) * 70 - oppV * 6.5) * dt; oppA += oppV * dt;
    if (oppA < -1.5) { oppA = -1.5; oppV = Math.abs(oppV) * .3; } if (oppA > .5) { oppA = .5; oppV = -Math.abs(oppV) * .3; }
    if (oppY > 0 || oppVY !== 0) { oppVY -= 60 * dt; oppY += oppVY * dt; if (oppY <= 0) { oppY = 0; oppVY = oppVY < -6 ? -oppVY * .25 : 0; } }
    oppS += (oppST - oppS) * Math.min(1, dt * 10); opp.visible = oppS > .02; opp.scale.setScalar(Math.max(.001, oppScale * oppS)); opp.position.y = oppY;
    const tk = T - tauntT; ob.rotation.x = oppA; ob.rotation.z = Math.sin(T * 2) * .04 + (tk < .5 ? Math.sin(tk * 40) * .12 * (1 - tk * 2) : 0);
    flashI *= Math.exp(-dt * 9); flash.intensity = flashI;
    // fireball
    if (fbT >= 0) { fbT += dt / .3; const f = Math.min(1, fbT); fb.position.lerpVectors(fbFrom, fbTo, f); fb.position.y += Math.sin(f * Math.PI) * .8; fb.scale.setScalar(1 + Math.sin(T * 40) * .15); if (Math.random() < .7) burst(fb.position.x, fb.position.y, fb.position.z, 1, O_TRAIL); if (fbT > 1.3) { fbT = -1; fb.visible = false; } }
    // counters
    if (cLive) {
      let any = 0;
      for (let i = 0; i < NC; i++) {
        const st = cState[i]; if (!st) continue; any = 1; const j = i * 3; let x, y, z, sx = 1, sy = 1;
        if (st === 1) { cT[i] += dt / .24; const f = Math.min(1, cT[i]); x = cFrom[j] + (cTo[j] - cFrom[j]) * f; z = cFrom[j + 2] + (cTo[j + 2] - cFrom[j + 2]) * f; y = cFrom[j + 1] + (cTo[j + 1] - cFrom[j + 1]) * f + Math.sin(f * Math.PI) * 1.1; if (f >= 1) { cState[i] = 2; cT[i] = 0; } }
        else { x = cTo[j]; y = cTo[j + 1]; z = cTo[j + 2]; cT[i] += dt;
          if (st === 2) { const w = Math.exp(-cT[i] * 10) * Math.cos(cT[i] * 24) * .35; sy = 1 - w; sx = 1 + w * .6; if (cHop[i] >= 0) { cHop[i] += dt; const h = cHop[i] / .28; if (h >= 1) cHop[i] = -1; else { y += Math.sin(h * Math.PI) * .42; sy *= 1.12; } } }
          else { const f = 1 - cT[i] * 4; if (f <= 0) { cState[i] = 0; counters.setMatrixAt(i, ZERO); continue; } sx = sy = f; y += (1 - f) * .5; } }
        dummy.position.set(x, y, z); dummy.rotation.set(0, cRot[i], 0); dummy.scale.set(sx, sy, sx); dummy.updateMatrix(); counters.setMatrixAt(i, dummy.matrix);
      }
      counters.instanceMatrix.needsUpdate = true; cLive = any;
    }
    // sparks
    if (sLive) {
      let any = 0;
      for (let i = 0; i < NS; i++) {
        if (sLife[i] <= 0) continue; sLife[i] -= dt; const j = i * 3; if (sLife[i] <= 0) { sparks.setMatrixAt(i, ZERO); continue; } any = 1;
        sVel[j + 1] -= sGr[i] * dt; sPos[j] += sVel[j] * dt; sPos[j + 1] += sVel[j + 1] * dt; sPos[j + 2] += sVel[j + 2] * dt; if (sPos[j + 1] < .05) { sPos[j + 1] = .05; sVel[j + 1] *= -.4; }
        dummy.position.set(sPos[j], sPos[j + 1], sPos[j + 2]); dummy.rotation.set(T * 5 + i, i, 0); dummy.scale.setScalar(sSize[i] * Math.min(1, sLife[i] * 3)); dummy.updateMatrix(); sparks.setMatrixAt(i, dummy.matrix);
      }
      sparks.instanceMatrix.needsUpdate = true; sLive = any;
    }
    // mats, bag, crowd
    for (let i = 0; i < 9; i++) { const m = mats[i]; if (!matOn[i]) { m.visible = false; continue; } m.visible = true; const f = clamp((T - matT0[i]) / .28, 0, 1), e = f <= 0 ? .001 : 1 + 2.7 * Math.pow(f - 1, 3) + 1.7 * Math.pow(f - 1, 2), pu = Math.max(0, 1 - (T - matPulse[i]) * 4) * .18; m.scale.set(e + pu, 1, e + pu); }
    const sq = Math.max(0, 1 - (T - bagT) * 8); bag.scale.set(1 + sq * .15, 1 - sq * .2, 1);
    crowdE *= Math.exp(-dt * .9); for (let i = 0; i < 3; i++) { const c = crowd[i]; c.position.y = c.userData.y + Math.abs(Math.sin(T * (2.2 + crowdE * 5) + i * 1.3)) * (.05 + crowdE * .35); }
    // labels (DOM is only touched when a label actually moves)
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 10; i++) { const L = labs[i]; if (!L.on) continue; v3.copy(L.p).project(camera); const x = Math.round((v3.x * .5 + .5) * W), y = Math.round((-v3.y * .5 + .5) * H); if (x !== L.lx || y !== L.ly) { L.lx = x; L.ly = y; L.el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)'; } }
  };
  V.setOpp({ color: 0xd8322f, scale: 1 }); oppY = 0;
}

/* ---------- Matilda ---------- */
const MIXAMO = { Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head', LeftShoulder: 'leftShoulder', LeftArm: 'leftUpperArm', LeftForeArm: 'leftLowerArm', LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder', RightArm: 'rightUpperArm', RightForeArm: 'rightLowerArm', RightHand: 'rightHand', LeftUpLeg: 'leftUpperLeg', LeftLeg: 'leftLowerLeg', LeftFoot: 'leftFoot', LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg', RightLeg: 'rightLowerLeg', RightFoot: 'rightFoot', RightToeBase: 'rightToes' };
function retarget(vrm, clip, root) {
  const legacy = String(vrm.meta?.metaVersion ?? '').startsWith('0'); const tracks = []; const qi = new THREE.Quaternion(), qp = new THREE.Quaternion(), q = new THREE.Quaternion();
  const srcHips = root.getObjectByName('mixamorigHips') || root.getObjectByName('mixamorig:Hips');
  const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips'); const restY = vrm.humanoid.normalizedRestPose?.hips?.position?.[1] ?? hipsNode.position.y;
  const hipScale = srcHips?.position.y ? restY / srcHips.position.y : .01;
  for (const tr of clip.tracks) {
    const rig = tr.name.slice(0, tr.name.lastIndexOf('.')), prop = tr.name.slice(tr.name.lastIndexOf('.') + 1);
    const bone = MIXAMO[rig.replace(/^.*\|/, '').replace(/^mixamorig[:_]?/, '')]; if (!bone) continue;
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
async function loadMatilda() {
  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
  const gltf = await SL.loadCompanion(loader); const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.combineSkeletons?.(gltf.scene); VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false;
    [].concat(o.material).forEach(m => { if (m.isMToonMaterial) { m.color?.multiplyScalar(.3); m.shadeColorFactor?.multiplyScalar(.3); } }); } });
  const pivot = new THREE.Group(); vrm.scene.rotation.y = String(vrm.meta?.metaVersion ?? "").startsWith("0") ? Math.PI : 0; pivot.add(vrm.scene);
  pivot.position.set(-2, 2.18, 5.59); pivot.scale.setScalar(1.7); pivot.rotation.y = .45;
  const names = { idle: 'idle_stand', fireball: 'fireball', dance: 'dance_victory', wave: 'wave', jump: 'surprise_jump', think: 'thinking_2' }, clips = {}, fbx = new FBXLoader();
  await Promise.all(Object.entries(names).map(async ([k, f]) => { try { const root = await fbx.loadAsync('/animations/' + f + '.fbx'); const raw = root.animations.find(c => c.tracks.length > 0); if (raw) clips[k] = retarget(vrm, raw, root); } catch (e) { console.warn('anim', f, e); } }));
  if (abandon) return;
  const mixer = new THREE.AnimationMixer(vrm.scene); for (const k in clips) M.actions[k] = mixer.clipAction(clips[k]);
  mixer.addEventListener('finished', e => { if (e.action === M.cur && e.action !== M.actions.idle) M.play('idle', true); });
  scene.add(pivot); M.vrm = vrm; M.mixer = mixer; M.play('idle', true);
}
M.play = (name, loop = false, speed = 1) => {
  try { const a = M.actions[name]; if (!M.mixer || !a) return; const prev = M.cur; a.reset(); a.enabled = true; a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = speed; a.setEffectiveWeight(1); a.play(); if (prev && prev !== a) prev.crossFadeTo(a, .16, false); M.cur = a; } catch (e) { console.warn(e); }
};
M.update = dt => {
  if (!M.vrm) return; M.mixer.update(dt); const em = M.vrm.expressionManager;
  if (em) { const happy = T < M.happyUntil; em.setValue('aa', T < M.talkUntil ? .2 + .5 * Math.abs(Math.sin(T * 13)) : 0); em.setValue('happy', happy ? .9 : 0); M.blink -= dt; let b = 0; if (M.blink < 0) { b = 1; if (M.blink < -.12) M.blink = rnd(2, 5); } em.setValue('blink', happy ? 0 : b); }
  M.vrm.update(dt);
};
let lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try { const dt = Math.min(.05, Math.max(0, (now - lastT) / 1000)); lastT = now; T += dt; V.update(dt); M.update(dt); composer.render(); } catch (e) { console.error(e); }
}

/* ---------- game data ---------- */
const TIERS = { 1: [[20, 4], [18, 3], [20, 5], [24, 4]], 2: [[28, 4], [27, 3], [30, 5], [32, 4], [24, 6], [36, 4], [30, 6]], 3: [[42, 6], [48, 6], [45, 5], [54, 6], [56, 7], [36, 9], [48, 8], [42, 7], [36, 6]], 4: [[63, 7], [72, 8], [56, 8], [54, 9], [72, 9], [63, 9], [45, 9], [27, 9]] };
const VOICED = new Set([16, 18, 20, 24, 27, 28, 30, 32, 36, 42, 45, 48, 54, 56, 63, 72]);
const CHAMP = { g: [{ total: 45, by: 9, v: 'champ-g1', ico: '🍣' }, { total: 42, by: 6, v: 'champ-g2', ico: '🍟' }], e: [{ total: 32, by: 4, v: 'champ-e1', ico: '📚' }, { total: 35, by: 5, v: 'champ-e2', ico: '♟️' }] };
const BOUTS = { 1: { name: 'DARUMA DAN', title: 'BOUT 1', color: 0xd8322f, scale: 1, voice: 'how-deal' }, 2: { name: 'ONI CRUSHER', title: 'BOUT 2', color: 0x2b6fd6, scale: 1.12, horns: 1, voice: 'how-head' }, 3: { name: 'KING GRUMP', title: 'CHAMPIONSHIP', color: 0x3a2a55, scale: 1.3, horns: 1, crown: 1, voice: 'champ-intro' } };
const STICKERS = [['🍣', 'スシ'], ['🍟', 'ポテト'], ['🍕', 'ピザ'], ['🍔', 'バーガー'], ['🍅', 'トマト'], ['♟️', 'チェス'], ['🎹', 'ピアノ'], ['🥇', 'メダル'], ['📚', 'ブック'], ['🤼', 'レスリング']];
const BELT = [['白', '#fff', '#222'], ['黄', '#ffd84a', '#222'], ['青', '#3aa0ff', '#fff'], ['黒', '#15131f', '#fff']];
const G = { phase: 'load', score: 0, combo: 0, bestCombo: 0, firstTry: 0, headPins: 0, resolved: 0, itemIndex: 0, tier: clamp(SAVE.tier | 0, 1, 4), tierProg: 0, used: new Set(['16/4', '24/3']), missed: new Set(), anchorMiss: {}, carry: [], splits: [], cur: null, t0: 0, champion: false, saidHead: false, sticker: -1, stickerNew: false, clockDur: 13, finAt: 0, lockerOpen: null };
const elapsed = () => (performance.now() - G.t0) / 1000;
const mkEach = (total, by, mode, tag) => ({ kind: 'each', total, by, ans: total / by, mode, tag, voice: ['n-' + total, 'g-' + by], ico: '🤼', key: total + '/' + by, target: `${total} ÷ ${by} equal groups: how many in each group` });
function mkChamp(type, v) { const c = CHAMP[type][v]; return type === 'g' ? { kind: 'groups', total: c.total, by: c.by, ans: c.total / c.by, mode: 'head', tag: 'champ', voice: [c.v], ico: c.ico, key: c.total + 'g' + c.by, target: `${c.total} in groups of ${c.by}: how many groups` } : { kind: 'each', total: c.total, by: c.by, ans: c.total / c.by, mode: 'head', tag: 'champ', voice: [c.v], ico: c.ico, key: c.total + 'e' + c.by, target: `${c.total} shared equally by ${c.by}: how many in each group` }; }
function tierItem(mode, up = 0) {
  const t = clamp(G.tier + up, 1, 4); let pool = TIERS[t].filter(f => !G.used.has(f.join('/'))); if (!pool.length) pool = TIERS[t];
  const heard = pool.filter(f => hasV('n-' + f[0]) && hasV('g-' + f[1])); if (heard.length) pool = heard;   // prefer facts whose prompt can be heard
  pool = shuffle(pool).sort((a, b) => (SAVE.seen[a.join('/')] || 0) - (SAVE.seen[b.join('/')] || 0)); const f = pool[0]; G.used.add(f.join('/')); return mkEach(f[0], f[1], mode, 'tier');
}
// The board's items (window.SUNNY_GAME_CONFIG via the library bridge) replace the built-in facts when present:
// the first half is Bout 1 (deal), the rest Bout 2 (in her head), the last two the Championship (read the move).
function cfgItem(it, mode, tag) {
  const a = Number(String(it.answer).trim()), nums = (String(it.prompt).match(/\d+/g) || []).map(Number);
  const groupsKind = /how many (groups|boxes|trays|cups|bags|teams|rows|plates|packs|jars)\b/i.test(it.prompt);
  const base = { mode, tag, voice: ['tts:' + it.prompt], key: 'cfg:' + it.itemId, target: it.prompt || it.answer, prompt: it.prompt };
  if (Number.isFinite(a) && a > 0) for (const n of nums) for (const g of nums) if (g > 1 && n !== g && n % g === 0 && n / g === a && n <= 100)
    return { ...base, kind: groupsKind ? 'groups' : 'each', total: n, by: g, ans: a, ico: groupsKind ? '📦' : '🤼' };
  return { ...base, kind: 'each', total: 0, by: 1, ans: a, ico: '❓', mode: 'head', raw: true };
}
const CFG = (() => {
  if (!SL.hasItems) return null;
  const its = SL.items.filter(it => { const ok = /^\d{1,2}$/.test(String(it.answer).trim()); if (!ok) console.warn(' 🎮 [library-game] [content] [skipped] item=' + it.itemId + ' reason=answer_not_a_1_or_2_digit_number'); return ok; });
  const champN = its.length >= 4 ? 2 : 0, body = its.slice(0, its.length - champN), half = Math.ceil(body.length / 2);
  return { 1: body.slice(0, half).map(it => cfgItem(it, 'deal', 'anchor')), 2: body.slice(half).map(it => cfgItem(it, 'head', 'tier')), champ: its.slice(its.length - champN).map(it => cfgItem(it, 'head', 'champ')) };
})();
console.log(' 🎮 [split-second] [content] [' + (CFG ? `items=${SL.items.length} raw=${[...CFG[1], ...CFG[2], ...CFG.champ].filter(i => i.raw).length}` : 'built-in') + ']');
function slotsBout1() {
  const an = SAVE.runs % 2 ? [[24, 3], [16, 4]] : [[16, 4], [24, 3]];
  const old = SAVE.missed.find(k => { const m = /^(\d+)\/(\d)$/.exec(k); return m && VOICED.has(+m[1]) && +m[2] >= 3 && +m[1] % +m[2] === 0; });
  const q = an.map(f => () => mkEach(f[0], f[1], 'deal', old === f.join('/') ? 'comeback' : 'anchor'));
  if (old && old !== '16/4' && old !== '24/3') { const [n, k] = old.split('/').map(Number); G.used.add(old); q.push(() => mkEach(n, k, 'head', 'comeback')); } else q.push(() => tierItem('deal'));
  return q;
}
function slotsBout2() {
  const ret = (G.anchorMiss['24/3'] || (!G.anchorMiss['16/4'] && SAVE.runs % 2 === 0)) ? [24, 3] : [16, 4];
  return [() => tierItem('head'), () => mkEach(ret[0], ret[1], 'head', 'anchor'), () => tierItem('head'), () => tierItem('head', 1)];
}

/* ---------- UI helpers ---------- */
function banner(txt, cls = '') { const b = $('banner'); b.className = 'dg'; b.textContent = txt; void b.offsetWidth; b.className = 'dg show ' + cls; }
function popPts(txt) { const p = $('pop'); p.className = 'dg'; p.textContent = txt; void p.offsetWidth; p.className = 'dg show'; }
const comboMult = c => c >= 8 ? 3 : c >= 5 ? 2 : c >= 3 ? 1.5 : 1;
function renderHud() {
  const s = $('score'); s.textContent = fmt(G.score); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
  const m = comboMult(G.combo); $('combo').textContent = G.combo >= 2 ? '🔥 ' + G.combo + (m > 1 ? '  ×' + m : '') : '';
  const b = BELT[G.tier - 1], bi = $('beltI'); bi.textContent = b[0]; bi.style.background = b[1]; bi.style.color = b[2]; $('beltTxt').textContent = 'LV ' + G.tier;
}
function renderGhost() {
  if (!(SAVE.best > 0) || !SAVE.splits.length) return; const ref = SAVE.splits[Math.min(G.resolved - 1, SAVE.splits.length - 1)] || 0, d = G.score - ref, g = $('ghost');
  g.textContent = d >= 0 ? '▲ +' + d + ' vs BEST' : '👻 +' + (-d); g.className = d >= 0 ? 'up' : 'dn';
}
const setPips = n => { $('pips').innerHTML = '<i></i>'.repeat(Math.max(0, n)); };
function renderCard(c) {
  const it = c.item;
  if (it.raw) { $('pic').innerHTML = `<span class="ic">${it.ico}</span>`; $('eq1').textContent = it.prompt; $('eq2').innerHTML = '<span class="box"></span>'; $('eq2').classList.remove('off'); $('card').classList.remove('won'); renderBoxes(c); return; }
  let pic = `<b class="n dg">${it.total}</b><span class="ic">${it.ico}</span><span class="ar">➜</span><span class="ms">`;
  pic += it.kind === 'each' ? '<i class="mt">?</i>'.repeat(it.by) : `<i class="tr">${it.by}</i><i class="tr">${it.by}</i><i class="tr">…</i>`;
  $('pic').innerHTML = pic + '</span>'; const box = '<span class="box"></span>';
  $('eq1').innerHTML = `${it.total} ÷ ${it.by} = ${box}`;
  $('eq2').innerHTML = it.kind === 'each' ? `${it.by} × ${box} = ${it.total}` : `${box} × ${it.by} = ${it.total}`;
  $('eq2').classList.toggle('off', it.mode === 'deal'); $('card').classList.remove('won'); renderBoxes(c);
}
function renderBoxes(c, wob) { document.querySelectorAll('#card .box').forEach(b => { b.textContent = c.typed || (c.hint >= 3 ? c.item.ans : '?'); b.classList.toggle('ghost', !c.typed); b.classList.remove('wob'); if (wob) { void b.offsetWidth; b.classList.add('wob'); } }); }
function startClock(mode) { const el = $('clockFill'); G.clockDur = mode === 'deal' ? 26 : 13; el.style.transition = 'none'; el.style.transform = 'scaleX(1)'; void el.offsetWidth; el.style.transition = `transform ${G.clockDur}s linear 3s`; el.style.transform = 'scaleX(0)'; }
const clockFrac = ms => clamp(1 - (ms / 1000 - 3) / G.clockDur, 0, 1);
function stopClock(f) { const el = $('clockFill'); el.style.transition = 'none'; el.style.transform = 'scaleX(' + f.toFixed(3) + ')'; }
const vis = c => ({ mode: c.item.mode, kind: c.item.kind, hintLevel: c.hint, countersDealt: c.dealt, allDealt: c.dealt >= c.item.total, multiplicationLinkShown: c.item.mode !== 'deal' || c.hint >= 1, answerVisible: c.hint >= 3 });
let idleTimer = null;
const clearIdle = () => { clearTimeout(idleTimer); idleTimer = null; };
function armIdle(c) { clearIdle(); idleTimer = setTimeout(() => { if (G.cur === c && !c.locked && !c.touched) say(c.item.voice); }, 15000); }

/* ---------- item loop ---------- */
function playItem(item, opt = {}) {
  return new Promise(resolve => {
    const c = G.cur = { item, idx: G.itemIndex++, attempts: 0, hint: 0, dealt: 0, usedDeal: false, typed: '', locked: false, missed: false, touched: false, resolve, t0: performance.now() };
    vv('setup', item); renderCard(c);
    const d = $('deal'), dm = item.mode === 'deal'; d.classList.toggle('mini', !dm); d.classList.toggle('pulse', dm); d.classList.remove('done'); $('pad').classList.toggle('glow', !dm); $('hand').classList.toggle('hidden', c.idx !== 0);
    const re = item.tag === 'rematch' || item.tag === 'comeback'; if (re) banner('REMATCH!', 'mid');
    if (item.kind === 'each' && item.tag !== 'champ') SAVE.seen[item.key] = (SAVE.seen[item.key] || 0) + 1;
    SE('targetPresented', { target: item.target, itemIndex: c.idx, visibleState: vis(c) });
    startClock(item.mode); say((opt.voice ? [opt.voice] : re ? ['rematch'] : []).concat(item.voice)); armIdle(c);
  });
}
function dealOne(c, quiet) {
  const it = c.item; if (c.dealt >= it.total) return false; const i = c.dealt++; let m, s;
  if (it.kind === 'each') { m = i % it.by; s = (i / it.by) | 0; } else { m = (i / it.by) | 0; s = i % it.by; }
  vv('launch', i, m, s); if (!quiet) sfx('pop', { rate: .85 + s * .07 + m * .012, vol: .7 }); vv('setBag', it.total - c.dealt);
  if (c.dealt >= it.total) { $('deal').classList.add('done'); $('deal').classList.remove('pulse'); $('pad').classList.add('glow'); }
  return true;
}
function userDeal() { const c = G.cur; if (!c || c.locked) return; if (dealOne(c)) { c.usedDeal = true; c.touched = true; $('hand').classList.add('hidden'); } }
async function autoDeal(c, dur) {
  const rem = c.item.total - c.dealt; if (rem <= 0) return; const per = Math.ceil(rem / Math.max(1, Math.round(dur / 22))); let n = 0;
  while (c.dealt < c.item.total) { for (let k = 0; k < per && c.dealt < c.item.total; k++) dealOne(c, (n++ % 3) !== 0); await wait(22); }
  await wait(280);
}
function keyDigit(d) { const c = G.cur; if (!c || c.locked) return; if (c.typed.length >= 2) c.typed = ''; c.typed += d; c.touched = true; sfx(['key-tap', 'tick'], { vol: .5 }); $('hand').classList.add('hidden'); renderBoxes(c); }
function keyBack() { const c = G.cur; if (!c || c.locked) return; c.typed = c.typed.slice(0, -1); sfx(['key-tap', 'tick'], { vol: .4, rate: .8 }); renderBoxes(c); }
function hear() { const c = G.cur; if (!c) return; SE('audioRequested', { target: c.item.target, itemIndex: c.idx, audio: { clip: c.item.voice.join('+'), kind: 'prompt' } }); say(c.item.voice); }
function bail(c) { if (G.cur === c) G.cur = null; try { vv('clear'); } catch (e) {} c.resolve({ missed: c.missed, first: false, clean: false }); }
function submit() {
  const c = G.cur; if (!c || c.locked) return; if (!c.typed) { renderBoxes(c, true); return; }
  const ok = parseInt(c.typed, 10) === c.item.ans, ms = Math.round(performance.now() - c.t0); c.attempts++; c.touched = true;
  SE('attemptRecorded', { target: c.item.target, itemIndex: c.idx, attemptNumber: c.attempts, visibleState: vis(c), childAction: { type: 'typed-number', value: c.typed, dealtByHer: c.usedDeal }, result: { correct: ok, hintLevel: c.hint, ms } });
  (ok ? win(c, ms) : miss(c)).catch(e => { console.error(e); bail(c); });
}
async function miss(c) {
  const it = c.item; c.locked = true;
  if (!c.missed) { c.missed = true; G.combo = G.combo >> 1; G.tierProg = 0; if (it.tag !== 'champ') { G.missed.add(it.key); G.anchorMiss[it.key] = true; } if (it.tag === 'tier') G.tier = Math.max(1, G.tier - 1); renderHud(); }
  sfx('thunk', { vol: .8 }); renderBoxes(c, true); vv('taunt'); c.hint = Math.min(3, c.hint + 1);
  await wait(450); c.typed = '';
  if (c.hint === 1) { $('eq2').classList.remove('off'); M.play('think'); say(['hint1']); renderBoxes(c); await wait(500); }
  else if (c.hint === 2) {
    $('eq2').classList.remove('off'); renderBoxes(c); say(['hint2']); await autoDeal(c, 1300);
    if (it.kind === 'each') for (let s = 0; s < it.ans; s++) { vv('hop', s * it.by); sfx('pop', { rate: .9 + s * .08 }); await wait(290); }
    else for (let m = 0; m < it.ans; m++) { vv('hopMat', m); sfx(['tick', 'pop'], { rate: .9 + m * .08 }); await wait(330); }
  } else { await autoDeal(c, 500); vv('showAnswer', it); say(['hint3']); renderBoxes(c); await wait(400); }
  if (G.cur === c) c.locked = false;
}
async function win(c, ms) {
  const it = c.item, first = c.attempts === 1, head = first && !c.usedDeal, clean = c.hint < 3, frac = clockFrac(ms), re = it.tag === 'rematch' || it.tag === 'comeback';
  c.locked = true; clearIdle(); stopClock(frac); $('hand').classList.add('hidden');
  let pts = first ? (head ? 300 + 200 * frac : 150 + 80 * frac) : clean ? 60 : 20, levelUp = false;
  if (first) { G.combo++; G.firstTry++; G.bestCombo = Math.max(G.bestCombo, G.combo); pts *= comboMult(G.combo); if (head) { G.headPins++; if (++G.tierProg >= 2 && G.tier < 4) { G.tier++; G.tierProg = 0; levelUp = true; } } if (re) { pts += 200; G.missed.delete(it.key); } }
  pts = Math.round(pts / 10) * 10;
  SE('targetCompleted', { target: it.target, itemIndex: c.idx, attemptNumber: c.attempts, result: { correct: clean, firstTry: first, hintLevel: c.hint, ms, inHead: head, usedDealing: c.usedDeal, answerWasShown: !clean } });
  $('eq2').classList.remove('off'); $('card').classList.add('won'); renderBoxes(c); $('pad').classList.remove('glow');
  if (c.dealt < it.total) await autoDeal(c, 420);
  if (clean) { M.play('fireball', false, 1.7); M.happyUntil = T + 1.8; sfx(['fire-whoosh', 'riser'], { vol: .6 }); await wait(230); vv('fire'); await wait(300); }
  vv('hit', clean); sfx(clean ? 'takedown' : 'pop', { vol: .9 }); if (first) { sfx('cheer', { vol: .3 }); sfx('coin', { vol: .5 }); }
  G.score += pts; G.resolved++; G.splits.push(G.score); renderHud(); renderGhost(); popPts('+' + pts);
  if (re && first) banner('REVENGE! リベンジ!', 'mid'); else if (head) banner('HEAD PIN! 🧠'); else if (first) banner('TAKEDOWN!'); else if (clean) banner('GOT IT!', 'sm'); else banner('REMATCH SOON', 'sm');
  if (first && (G.combo === 3 || G.combo === 5 || G.combo === 8)) sfx(['combo', 'onfire'], { vol: .8 });
  if (re && first) say(['yatta']); else if (head && !G.saidHead) { G.saidHead = true; say(['headpin']); } else if (first && (G.combo === 3 || G.combo === 5 || G.combo === 8)) say([G.combo === 5 ? 'yatta' : 'sugoi']); else if (head && Math.random() < .35) say([pick(['sugoi', 'yatta'])]);
  await wait(1000);
  if (levelUp) { banner('LEVEL UP!', 'lv'); sfx(['level-up', 'onfire'], { vol: .8 }); renderHud(); await wait(450); }
  vv('clear'); if (G.cur === c) G.cur = null; c.resolve({ missed: c.missed, first, clean });
}

/* ---------- match flow ---------- */
async function pinSeq() {
  for (const k of ['一', '二', '三']) { banner(k, 'count'); sfx(['taiko-hit', 'boom'], { vol: .7 }); vv('shake', .15); await wait(340); }
  banner('PIN!', 'big'); sfx(['ring-bell', 'fanfare'], { vol: .7 }); sfx('cheer', { vol: .5 }); vv('cheer'); M.play('jump'); M.happyUntil = T + 1.5; vv('confetti', false); await wait(950); vv('oppOut'); await wait(300);
}
async function intro(cfg) { vv('setOpp', cfg); $('boutName').textContent = cfg.name; banner(cfg.title, 'big'); sfx(['ring-bell', 'fanfare'], { vol: .6 }); await wait(520); sfx('boom', { vol: .5 }); vv('shake', .3); await wait(700); }
async function bout(n) {
  const cfg = BOUTS[n]; await intro(cfg);
  const q = CFG ? CFG[n].slice() : n === 1 ? slotsBout1() : slotsBout2(); if (!q.length) return; if (n === 2 && G.carry.length) q.splice(1, 0, ...G.carry.splice(0, 2));
  let first = true;
  while (q.length) {
    const s = q.shift(), item = typeof s === 'function' ? s() : s; setPips(q.length + 1);
    const r = await playItem(item, { voice: first ? cfg.voice : null }); first = false;
    if (r.missed && item.tag !== 'rematch' && item.tag !== 'comeback' && elapsed() < 270) { const rm = Object.assign({}, item, { tag: 'rematch', mode: 'head' }); if (q.length) q.splice(Math.min(q.length, 2), 0, rm); else if (n === 1) G.carry.push(rm); }
    if (elapsed() > 285) q.length = 0;
    if (q.length) { vv('oppUp'); await wait(250); }
  }
  setPips(0); await pinSeq();
}
function locker() {
  return new Promise(res => {
    const L = $('locker'), door = $('door'), prize = $('prize'); door.classList.remove('open'); prize.classList.remove('show'); L.classList.remove('hidden');
    say(['locker']); sfx('riser', { vol: .4 }); let opened = false, to = null;
    const open = async () => {
      if (opened) return; opened = true; clearTimeout(to); G.lockerOpen = null;
      const have = new Set(SAVE.stickers), fresh = STICKERS.map((s, i) => i).filter(i => !have.has(i)), si = fresh.length ? pick(fresh) : (Math.random() * STICKERS.length) | 0, bonus = pick([100, 100, 150, 200, 300]);
      G.sticker = si; G.stickerNew = fresh.length > 0; if (G.stickerNew) SAVE.stickers.push(si);
      $('prizeIco').textContent = STICKERS[si][0]; $('prizeKana').textContent = STICKERS[si][1]; $('prizeBonus').textContent = '+' + bonus;
      door.classList.add('open'); prize.classList.add('show'); sfx(['locker-open', 'fanfare'], { vol: .7 }); setTimeout(() => sfx(['sticker-pop', 'coin'], { vol: .8 }), 450);
      G.score += bonus; renderHud(); M.play('jump'); await wait(2100); L.classList.add('hidden'); res();
    };
    door.onclick = open; G.lockerOpen = open; to = setTimeout(open, 8000);
  });
}
async function championship() {
  const cfg = BOUTS[3];
  if (CFG) {
    if (!CFG.champ.length) { G.champion = G.firstTry >= G.resolved / 2; return; }
    await intro(cfg); sfx('roar', { vol: .5 }); let wins = 0, first = true;
    for (const item of CFG.champ) { setPips(CFG.champ.length - wins); const r = await playItem(item, { voice: first ? cfg.voice : null }); first = false; if (r.clean) wins++; vv('oppUp'); await wait(250); }
    G.champion = wins >= Math.ceil(CFG.champ.length / 2); setPips(0); if (G.champion) await pinSeq(); return;
  }
  await intro(cfg); sfx('roar', { vol: .5 });
  const pv = (type, v) => (hasV(CHAMP[type][v].v) || !hasV(CHAMP[type][1 - v].v)) ? v : 1 - v;   // prefer the round whose prompt can be heard
  const order = shuffle(['g', 'e']), v = SAVE.runs % 2, pending = [{ type: order[0], v: pv(order[0], v) }, { type: order[1], v: pv(order[1], v) }]; let wins = 0, shown = 0, first = true;
  while (pending.length && shown < (elapsed() > 320 ? 2 : 4)) {
    const p = pending.shift(); shown++; setPips(2 - wins);
    const r = await playItem(mkChamp(p.type, p.v), { voice: first ? cfg.voice : null }); first = false;
    if (r.clean) wins++; else if (!p.retry) pending.push({ type: p.type, v: 1 - p.v, retry: true });
    if (wins >= 2) break; vv('oppUp'); await wait(250);
  }
  G.champion = wins >= 2; setPips(0); if (G.champion) await pinSeq();
}
function finish() {
  G.phase = 'finish'; G.finAt = performance.now(); G.cur = null; clearIdle();
  const newBest = G.score > SAVE.best, coins = 10 + G.firstTry + G.headPins + (G.champion ? 5 : 0) + (newBest ? 3 : 0);
  if (newBest) { store.set('best', G.score); store.set('splits', G.splits); }
  store.set('tier', G.tier); store.set('stickers', SAVE.stickers); store.set('missed', Array.from(G.missed).slice(0, 3)); store.set('seen', SAVE.seen); store.set('runs', SAVE.runs + 1);
  SE('activityCompleted', { result: { coinsEarned: coins, score: G.score, champion: G.champion, itemsPresented: G.itemIndex, firstTryCorrect: G.firstTry, inHeadCorrect: G.headPins, ms: Math.round(performance.now() - G.t0) } });
  $('ui').classList.add('hidden'); setCam('face');
  $('fTitle').textContent = G.champion ? '🏆 CHAMPION! やった!' : 'GREAT FIGHT!';
  $('fBest').textContent = newBest ? '★ NEW PERSONAL BEST! ★' : 'BEST ' + fmt(SAVE.best);
  $('fRows').innerHTML = `<span>🤼 ${G.firstTry}/${G.itemIndex}</span><span>🧠 ${G.headPins}</span><span>🔥 ${G.bestCombo}</span><span>${BELT[G.tier - 1][0]} LV ${G.tier}</span>`;
  $('fCoins').textContent = '🪙 +' + coins;
  const have = new Set(SAVE.stickers); $('fStick').innerHTML = STICKERS.map((s, i) => have.has(i) ? `<i class="on${i === G.sticker && G.stickerNew ? ' new' : ''}">${s[0]}</i>` : '<i>?</i>').join('');
  $('finish').classList.remove('hidden');
  const fs = $('fScore'), t0 = performance.now(); const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900); fs.textContent = fmt(G.score * k); if (k < 1) setTimeout(tick, 40); }; tick();
  M.play(G.champion ? 'dance' : 'wave', true); M.happyUntil = T + 30;
  sfx(G.champion ? ['legendary', 'fanfare'] : ['fanfare'], { vol: .7 }); sfx('cheer', { vol: .5 }); vv('cheer');
  say(newBest ? [G.champion ? 'win' : 'sugoi', 'best'] : [G.champion ? 'win' : 'sugoi']);
  let n = 0; const iv = setInterval(() => { vv('confetti', true); if (++n > 9) clearInterval(iv); }, 600);
}
async function run() {
  G.t0 = performance.now();
  await bout(1); await bout(2); if (elapsed() < 300) await locker(); await championship(); finish();
}
function startGame() {
  if (G.phase !== 'title') return; G.phase = 'play'; initAudio();
  $('title').classList.add('hidden'); $('ui').classList.remove('pre'); setCam('play'); M.play('idle', true);
  SE('activityStarted', {}); run().catch(e => console.error(e));
}

/* ---------- input ---------- */
$('start').addEventListener('click', startGame);
$('again').addEventListener('click', () => location.reload());
$('hear').addEventListener('pointerdown', e => { e.preventDefault(); hear(); });
$('pad').addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); const k = b.dataset.k; if (k === 'b') keyBack(); else if (k === 'e') submit(); else keyDigit(k); });
let holdTimer = null; const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };
$('deal').addEventListener('pointerdown', e => { e.preventDefault(); userDeal(); clearHold(); let iv = 230; const rep = () => { userDeal(); iv = Math.max(60, iv * .82); holdTimer = setTimeout(rep, iv); }; holdTimer = setTimeout(rep, 320); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('deal').addEventListener(ev, clearHold)); addEventListener('blur', clearHold);
addEventListener('contextmenu', e => e.preventDefault());
let lastKeyDeal = 0;
addEventListener('keydown', e => {
  const k = e.key;
  if (G.phase === 'load') return;
  if (G.phase === 'title') { if ((k === 'Enter' || k === ' ') && !$('start').classList.contains('hidden')) { e.preventDefault(); startGame(); } return; }
  if (!$('locker').classList.contains('hidden')) { if (k === 'Enter' || k === ' ') { e.preventDefault(); if (G.lockerOpen) G.lockerOpen(); } return; }
  if (G.phase === 'finish') { if (k === 'Enter' && performance.now() - G.finAt > 2500) location.reload(); return; }
  if (k.length === 1 && k >= '0' && k <= '9') keyDigit(k);
  else if (k === 'Backspace') { e.preventDefault(); keyBack(); }
  else if (k === 'Enter') { e.preventDefault(); submit(); }
  else if (k === ' ' || k === 'ArrowDown' || k === 'd' || k === 'D') { e.preventDefault(); const n = performance.now(); if (n - lastKeyDeal > 45) { lastKeyDeal = n; userDeal(); } }
  else if (k === 'h' || k === 'H') hear();
});

/* ---------- boot: load, decode and warm everything before the start button shows ---------- */
async function boot() {
  const bar = p => { $('loadFill').style.width = p + '%'; }; let ok = false;
  try { buildWorld(); ok = true; } catch (e) { console.error(e); }
  bar(30);
  const mat = ok ? loadMatilda().catch(e => console.warn('matilda', e)) : Promise.resolve();
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  const audio = Promise.all(Object.values(SND).map(s => s.p)).then(() => bar(60));
  await Promise.race([Promise.all([mat, fonts, audio]), wait(24000)]); abandon = true; bar(85);
  renderHud(); $('best').textContent = fmt(SAVE.best);
  if (ok) {
    try { V.warm(true); await renderer.compileAsync(scene, camera); composer.render(); composer.render(); } catch (e) { console.warn(e); }
    try { V.warm(false); composer.render(); } catch (e) { console.warn(e); }
    setCam('face', true); M.play('wave', true); lastT = performance.now(); requestAnimationFrame(frame);
  }
  bar(100);
  if (SAVE.runs > 0) $('tstats').textContent = `BEST ${fmt(SAVE.best)}  ·  ${BELT[clamp(SAVE.tier | 0, 1, 4) - 1][0]} LV ${clamp(SAVE.tier | 0, 1, 4)}  ·  🎴 ${SAVE.stickers.length}/10`;
  await wait(1500);   // let loading garbage settle before play is measured
  $('loading').classList.add('hidden'); $('start').classList.remove('hidden'); G.phase = 'title';
}
boot();
