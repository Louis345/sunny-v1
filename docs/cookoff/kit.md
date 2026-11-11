# Cook-off Kit (every chef gets this, word for word)

This is everything the house learned building the current champion, **Squad Gym 3D** (Opus 5.5, Reina's division boss match). The owner's reaction after playing it: "the sound effects and everything… this is perfect." You get its lessons and its engine plumbing, not its game design. Beat it.

## The bar you are competing against

Squad Gym 3D: a three.js wrestling arena with real lighting, bloom, shadows, an animated crowd and the companion **as a 3D character** (her real VRM model with motion-capture moves: idle, fireball on a correct answer, shrug on a miss, victory dance). ElevenLabs sound effects and arena music. Each correct answer is a takedown. A boss with 2 HP closes it out, and a treasure chest drops at the end. It runs at a steady 60 fps on the kiosk's Apple M1.

## Engine (allowed network imports)

Use three.js and three-vrm through this exact import map. Google Fonts are also allowed. Nothing else from the network. (Phaser 3.80.1 from jsdelivr is still allowed if you choose 2D.)

```html
<script type="importmap">{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/",
  "@pixiv/three-vrm":"https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.5.1/lib/three-vrm.module.min.js"}}</script>
<script src="/games/_contract.js"></script>
```

## Assets on the server (absolute paths)

- **Companions (VRM 0.x models):** `/a3d/models/elli.vrm` (Ila's companion Elli), `/a3d/models/matilda.vrm` (Reina's companion Matilda). Both are anime-style girls about 1.5 units tall at scale 1.
- **Motion-capture clips (Mixamo FBX)** in `/a3d/anim/`: `idle_stand`, `idle`, `dance_victory`, `silly_dancing`, `hip_hop_dancing`, `fireball`, `shrug`, `surprise_jump`, `wave`, `think`, `thinking_2`, `ponder_moment`, `talking`, `blow_a_kiss`, `quick_formal_bow`, `silly_laugh`, `defeated`, `sitting` (`.fbx`).
- **Sound library (ElevenLabs)** in `/a3d/sfx/`, with lengths in seconds: `boom.mp3` 2.5, `boss-roar.mp3` 2.5, `boss.mp3` 3.5, `coin.mp3` 0.6, `combo.wav` 0.3, `complete_fanfare.wav` 0.9, `correct.mp3` 1.5, `crowd-cheer.mp3` 4.0, `crowd-loop.mp3` 12 (loop), `epic.mp3` 2.5, `fanfare.mp3` 3.0, `hit_pop.wav` 0.2, `jump.mp3` 0.6, `legendary.mp3` 4.0, `miss_thunk.wav` 0.3 (soft), `music-loop.mp3` 20 (upbeat sports loop), `on_fire.wav` 0.5, `riser.mp3` 1.6, `rumble.mp3` 3.0, `takedown.mp3` 1.2, `tick.mp3` 0.5. Several are arena/sports themed. If your world needs different sounds, order them (below).

## Ordering your own voice lines and sounds

The house renders them with ElevenLabs before your game is played. Put this block in your `<head>`; it is required even if empty. Then load the files from relative paths `assets/voice/<id>.mp3` and `assets/sfx/<id>.mp3`.

```html
<script type="application/json" id="sunny-assets">{
  "voice": [ { "id": "word-pardon", "text": "pardon" }, { "id": "go", "text": "Ready… go!" } ],
  "sfx":   [ { "id": "lantern-whoosh", "prompt": "soft magical whoosh of a paper lantern floating up, warm chime", "seconds": 1.5 },
             { "id": "forest-music", "prompt": "gentle playful spooky-cute night forest music loop, kalimba and soft bells", "seconds": 20, "loop": true } ]
}</script>
```

- `voice`: up to 40 lines, 200 characters each, spoken in **the child's companion's real voice** (Elli for Ila, Matilda for Reina; multilingual, so short Japanese works: すごい!).
- `sfx`: up to 10 sounds, 0.5–22 seconds each, `loop` optional.
- There is no runtime text-to-speech. Every word or sentence the child must hear has to be ordered here.

## Plumbing that works (copy freely)

**Renderer, sharp and fast.** EffectComposer draws into its own target, and that target ignores `antialias:true`. Without MSAA, thin hair and edges break into speckles; the owner called it "480p". This setting measured a steady 60 fps on the M1:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const PR = 1.25; renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .45, .45, .92)); composer.addPass(new OutputPass());
```

**Loading the companion.** MToon materials blow out under bright physical lights; scaling their color down fixes it. VRM 0 models face away from the camera, so put them in a pivot.

```js
const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
const gltf = await loader.loadAsync('/a3d/models/elli.vrm'); const vrm = gltf.userData.vrm;
VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.combineSkeletons?.(gltf.scene); VRMUtils.rotateVRM0(vrm);
vrm.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false;
  [].concat(o.material).forEach(m => { if (m.isMToonMaterial) { m.color?.multiplyScalar(.3); m.shadeColorFactor?.multiplyScalar(.3); } }); } });
const pivot = new THREE.Group(); vrm.scene.rotation.y = Math.PI; pivot.add(vrm.scene); scene.add(pivot);
// every frame: vrm.update(dt)
```

**Mocap onto the companion.** Some FBX files have an empty clip first, so take the first clip that has tracks. Create the mixer only after every clip has loaded; a half-loaded mixer threw inside the frame loop and froze the game for good.

```js
const MIXAMO = { Hips:'hips', Spine:'spine', Spine1:'chest', Spine2:'upperChest', Neck:'neck', Head:'head', LeftShoulder:'leftShoulder', LeftArm:'leftUpperArm', LeftForeArm:'leftLowerArm', LeftHand:'leftHand',
  RightShoulder:'rightShoulder', RightArm:'rightUpperArm', RightForeArm:'rightLowerArm', RightHand:'rightHand', LeftUpLeg:'leftUpperLeg', LeftLeg:'leftLowerLeg', LeftFoot:'leftFoot', LeftToeBase:'leftToes',
  RightUpLeg:'rightUpperLeg', RightLeg:'rightLowerLeg', RightFoot:'rightFoot', RightToeBase:'rightToes' };
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
// const root = await new FBXLoader().loadAsync('/a3d/anim/wave.fbx'); const raw = root.animations.find(c => c.tracks.length > 0);
// const action = mixer.clipAction(retarget(vrm, raw, root));
```

## Lessons the owner had to catch (don't make him catch them again)

1. **Invisible overlays steal taps.** A hidden win screen's button sat on top of the start button, so "TAP TO WRESTLE" just reloaded the page. Hidden overlays need `pointer-events:none` on themselves **and every child**.
2. **Freezes when something new appears.** The first crystal, coin or spark compiled its shader mid-match: a 434 ms freeze. Build one of everything during loading and call `await renderer.compileAsync(scene, camera)` before the start button shows.
3. **Never add a light mid-game.** Adding one recompiles every material. Create every light at load time (intensity 0 if unused) and move it where you need it.
4. **One frame error must not kill the game.** Wrap the frame body in try/catch and log it.
5. **The companion's face must read.** At play distance the owner "couldn't make out her face". Keep her large enough on screen, and frame the camera on her for her moments.
6. **Sound must be rich, never cheap.** Beeps and oscillator tones read as cheap. Use the library and your ordered sounds. Music and ambience loops start on the first tap (browsers block audio before it).
7. **Big, simple touch controls** that also work with the keyboard.

## The automatic quality check (run after every build)

Before a child sees your game, a script plays it on the kiosk's GPU (Apple M1, 1512×860 at Retina scale) and reports back to you:

- **No page errors.** The opening screen has your `<h1>` title and a **`<button id="start">`**, shown once loading is done.
- `#start` is the top element under its own center, and a **real mouse tap** on it starts the game.
- After that tap, `SunnyEvidence.activityStarted` fires, and `targetPresented` fires within 15 seconds.
- **Smoothness:** at least 55 fps across 10 seconds of play, and no single frame over 100 ms.
- **Screenshots** of the title and of 10 s into play.

You get the report and the screenshots back, and you have **2 fix rounds**. Use them for anything you want to improve, not only failures.
