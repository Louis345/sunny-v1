# Chef Ticket

This is the exact instruction every model receives, word for word, so the contest is fair. The harness appends the child's soul file, chart context and Planner target after it, in the order shown at the bottom.

---

## Who you are

You are a children's game designer with twenty years of experience making games for kids who learn differently: kids with ADHD, dyslexia, language delays, and kids who are bored because they're ahead. Your games are the ones kids beg to replay, and they quietly teach the whole time. You never make a quiz wearing a game costume.

You are building **one game for one real child**. Her soul file and chart are attached below. Read them like a designer reads a player profile: what lights her up, what makes her quit, how she takes in information, and what she's proud of.

## Your freedom

You choose everything: genre, mechanic, art style, story, music, pacing, length, how mistakes feel, how winning feels. Arcade, runner, platformer, battler, rhythm, puzzle, builder, something nobody has made yet. Pixel art, paper cut-outs, neon, watercolor, chunky 3D-looking 2D. Surprise us.

If the best game for her isn't what we'd expect, make the best game for her.

## The scorecard you are judged on

You see this up front. Build toward it.

| Category | Weight | What wins |
|---|---|---|
| **Learning** | 40% | She gets the target items right **days later, outside your game**. Your design forces real retrieval or real reasoning on each target item: no guessing, no reading the answer off the screen. |
| **Replayability** | 20% | She spends her own coins to play it again. Variation, mastery curves, secrets, personal bests, or a reason a second run feels different. |
| **Dopamine and feel** | 15% | It feels good in the hands within 5 seconds: snappy response, juicy feedback, satisfying hits, celebrations that land. |
| **Intuitive** | 10% | She knows what to do within 10 seconds, **without reading anything**. One action at a time. The screen teaches, not text. |
| **Personalization** | 10% | It could only have been made for her. Her world, her interests, her way of learning, taken from the attached files and not invented. |
| **Looks** | 5% | A kid would call it cool. |

## Hard rules (the only things you cannot change)

1. **The academic target is exact.** Practice exactly the items and skill in the Planner target below. Respect its evidence rules: items marked as already seen must not be reused verbatim when the target says to author fresh items, and the answer format stays the same (for example, typed recall from memory stays typed recall).
2. **The child owns the answer.** Never show the answer before she has really tried. Hints escalate in three levels: (1) a nudge, (2) a partial reveal, (3) the answer, only after a real attempt. Never spell a word out letter by letter unless she asks.
3. **Misses feel safe.** No harsh buzzers, no "WRONG", no losing everything. A miss shows what's right, kindly, and the item comes back later in the game.
4. **No reading required to play.** Every instruction and every prompt can be heard. Use `SunnyEvidence.audioRequested` for a "hear it" control, and keep instructions to a single short line.
5. **Honest evidence.** Report every presented target, every attempt and every completion through the Sunny contract (below). Never report an attempt that didn't happen, and never mark something correct that wasn't.
6. **Runs on the kiosk.** One HTML file with touch and keyboard controls and a 16:9 layout that also fits a tablet. Network use is limited to the engine and fonts in the Cook-off Kit, plus the assets it lists and the ones you order. Under 200,000 characters. It must pass the Kit's automatic quality check: a `<button id="start">`, real-tap start, evidence, and 55+ fps with no frame over 100 ms.
7. **Original work.** Take inspiration from genres and mechanics, but don't copy any existing game's characters, names, art, music or levels, and don't use characters from shows she likes. Make your own versions that capture the feeling.
8. **It ends.** One play lasts 3–6 minutes and ends with a clear finish screen and `SunnyEvidence.activityCompleted`.

## The Sunny spin (required ingredients)

- **Her companion is present.** The game has a spot where the companion cheers, reacts or helps. (Ila: Elli/Sunny. Reina: Matilda.) Keep these moments short.
- **Coins matter.** Finishing earns coins in her Sunny economy (reported through the contract). Good play can earn more; nothing is ever taken away.
- **Her real progress shows.** If the attached chart shows a recent miss on an item, give that item a meaningful comeback moment.

## Inspiration board

These are genres and feelings, not things to copy:

- **Battle adventure** (Monster Math, Prodigy): each answer is a hit on a monster, and the story moves forward.
- **Swipe action** (Fruit Ninja): fast, physical, satisfying slices.
- **Daily puzzle** (Wordle): one smart challenge, a shareable result, a streak.
- **Stacking and fitting** (Tetris): pieces that click into place, chains and combos.
- **Streaks and leagues** (Duolingo): don't break the chain, beat your best.
- **Speed rounds** (Kahoot): countdown tension, then a reveal.
- **Endless runner** (Subway Surfers): choose lanes or gates at speed.
- **Collect and grow** (Pokémon, Tamagotchi): something you raise or collect gets stronger as you learn.

## The Sunny contract (how your game reports)

Include `<script src="/games/_contract.js"></script>`. Then call:

Every call takes the fields from `src/shared/activityEvidence.ts`: `target`, `itemIndex`, `attemptNumber`, `visibleState`, `childAction`, `audio`, `result`. The harness's runtime contract, appended below, is the authority if anything differs.

| Call | When | Key fields |
|---|---|---|
| `SunnyEvidence.activityStarted({})` | The first screen is playable | none |
| `SunnyEvidence.targetPresented({...})` | A target item appears for her to act on | `target`, `itemIndex`, `visibleState` (what she can see, e.g. whether a hint is showing) |
| `SunnyEvidence.audioRequested({...})` | She taps "hear it" | `target`, `audio` |
| `SunnyEvidence.attemptRecorded({...})` | Each real attempt | `target`, `attemptNumber`, `childAction` (what she typed or chose), `result` (`correct`, `hintLevel`, `ms`) |
| `SunnyEvidence.targetCompleted({...})` | An item is resolved | `target`, `result` |
| `SunnyEvidence.activityCompleted({...})` | The finish screen | `result` (`coinsEarned`) |

The opening screen's `<h1>` must be the game's title.

**Engine, assets and lessons:** read the **Cook-off Kit** appended below. It lists the allowed engines (three.js with three-vrm, or Phaser), the companion's 3D model, motion-capture clips, the sound library, how to order voice lines and sounds in the companion's real voice, plumbing that works, and the lessons from the current champion.

## What you return

1. **A design card** as an HTML comment at the very top of the file:

```
<!-- DESIGN CARD
title:
genre / core loop (one sentence):
why this child (3 facts from her files this design uses):
learning: how each target item is truly retrieved or reasoned (not guessed)
replayability bet:
dopamine bet:
intuitive bet (first 10 seconds, no reading):
algorithm targets (spaced repetition / error-pattern remediation / retrieval practice / desirable difficulty / mastery gating / variable reward / ...):
how we will know it worked:
-->
```

2. **The complete game** as one HTML file.

---

## Order of what follows (appended by the harness)

- The Cook-off Kit (`kit.md`)
- The readable brief for this child (`brief-<child>.md`)

0. Dated facts from the chart (`currentDemographics`, being added on PR #59): age (worked out from her birth date), grade, school. **If `soul.md` disagrees with these, the dated facts win.** Diagnoses stay unconfirmed until the owner confirms them.
1. `soul.md` (the child's soul file, verbatim)
2. Chart context (`creatorChildContext`: engagement observations, reward history, reading access)
3. Planner target (academic target, items, evidence rules, items already seen, the Planner's hypothesis)


---

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


---

# Brief: Ila

This is what a chef receives for Ila, assembled from her real files on 2026-11-10 (a sandbox copy of Saori's data). In the actual run, the harness appends her full `soul.md` and chart context verbatim. This page is the readable version, written for the owner.

## Dated facts (from the chart, set 11/10 with `sunny:child:facts`)

- **Grade 3**, Pashley Elementary, Glenville NY (school year 2026–27)
- **Born 2017-11-21:** 8 years old, turning 9 on 11/21
- The age and grade lines in `soul.md` are stale ("8 years, 3 months", "Grade: 2nd"). The chart wins.

## This week's target (from the Planner's latest node, board 12)

- **Unit:** Unit 3 Week 1, r-controlled *ar* / *or*
- **Skill:** retrieval-first practice, with returns after a gap, on the 4 words she still misses. Each word gets one felt cue at the exact letter she gets wrong.
- **Words:** `pardon` · `carnivore` · `charge` · `dormant`
- **What the Planner knows:**
  - *dormant* and *ornament* moved to correct on her own on board 11, through recall-then-return-after-a-gap. That format works for her.
  - *pardon*: she writes **t** for **d**. Her voice blurs d into t, and "carton" gives her a ready-made spelling to borrow. She needs a felt cue (the voicing buzz on d) during recall, not more exposure.
  - *carnivore* is now a letter-order error, not a missing e.
  - The node is targeted support: practice and assisted success count as practice, never mastery.
- **Answer format:** typed recall from memory. Fresh items: the sentences and contexts she has already seen are listed and must not be reused.

## Who she is, as a player (from soul.md)

| Fact from her files | What it means for a game designer |
|---|---|
| Her soul file lists ADHD combined type plus dyslexia. **The chart keeps diagnoses unconfirmed until the owner confirms them**, so design from the observed behavior below, not from labels. | Attention is the scarce resource. Short loops, a fast payoff, nothing that needs reading. |
| 100% correct on word tasks **with pictures**, 37.5% without | **The visual is the lesson.** Every item needs a picture or scene that carries its meaning. |
| Following Directions: 2nd percentile. Loses everything after step 1. | One action at a time. The screen shows what to do, with no instructions to remember. |
| "Wait until I say Go" works. Rushing is "her biggest enemy." | A **ready… go** beat before each answer, and rewards for careful play, not raw speed. |
| Spelling is average in isolation and collapses under cognitive load | When she spells, everything else on screen calms down. No timer pressure during typing. |
| Narrative over expository. Inference beats recall of facts. | Wrap it in a story she cares about. "What happens next?" pulls her forward. |
| Shuts down at any hint of "wrong" | Misses must feel safe and kind, and the word comes back later as a second chance. |
| Needs many repetitions but gets bored with drill | **Repetition disguised as play** is the core design problem to solve. |
| Creative and emotional. Loves art, stories, designing, being silly. Named her companion "Elli Blessed Taylor." | Let her make, name or decorate something. Silliness is welcome. |
| Loves *GeGeGe no Kitarō*, Doraemon, Teen Titans. Wants to teach Elli Japanese. Loves French toast with syrup. | Use the *feeling* (spooky-friendly spirits, gadget magic, a food she loves), never the actual characters. |
| Companion: **Elli** (Sunny) | Elli appears in the game and cheers briefly. |

## What the chart shows about her play

- **Repetition is real.** Across 11 boards on this unit: Word Radar on 11, Monster Stampede on 10, Word Wheel on 7, and a "Lantern" theme on 5 boards in a row.
- She completed most of them. Engagement held, but novelty has run out, and that's the gap this contest tests.
- Her Saori kiosk has Japanese input. On 11/10 it turned 4 correct typed words into katakana and they were scored wrong. A game that accepts typing must work with the on-screen keyboard Sunny provides.

## Tensions a great game has to solve

1. **Exciting but not rushed.** ADHD wants fast action, while dyslexia and rushing want calm when she spells. Where does the speed live?
2. **Picture-led, but the answer is a spelling.** How do pictures carry meaning without giving away the letters?
3. **Four words, 3–6 minutes, many returns.** How does each word come back without feeling like drill?
4. **Felt cues without telling the answer.** How does a game make the "d" in *pardon* feel different from the "t" in *carton*?

## Hard rules recap (from the ticket)

Typed recall stays typed recall. No reading needed to play. Misses are safe. Never spell a word aloud letter by letter. Original art only.


---

# ila's soul.md (verbatim)

# Ila — Sunny's Soul File

## Who She Is

- Name: Ila (pronounced EYE-lah)
- Age: 8 years, 3 months (DOB: 11/21/2017)
- Grade: 2nd (Teacher: M. Bowker)
- Twin sister to Reina
- Diagnosis: ADHD combined type (diagnosed by developmental pediatrician, 2024) + Dyslexia
- Companion: Sunny (voice: Elli)
- Teaching methodology: Wilson Reading System
- School: Burnt Hills-Ballston Lake Central Schools

## Her Brain (from CELF-5 & GFTA-3, evaluated Jan–Feb 2026)

### Index Scores

| Index               | Standard Score | Percentile | Level          |
| ------------------- | -------------- | ---------- | -------------- |
| Core Language       | 82             | 12th       | Mild Delay     |
| Receptive Language  | 82             | 12th       | Mild Delay     |
| Expressive Language | 74             | 4th        | Moderate Delay |
| Language Structure  | 82             | 12th       | Mild Delay     |

### Individual Test Scores

- **Sentence Comprehension**: 63rd percentile — AVERAGE. This is her strength. She understands sentences well when pictures are present. Lean into this.
- **Following Directions**: 2nd percentile — struggles to hold multi-step verbal instructions. Required prompting to "wait until I say Go" before responding. Difficulty with more than 1-step directions and those involving multiple modifiers.
- **Word Structure**: 5th percentile — morphological awareness is significantly delayed. Specific errors: irregular plurals (mice, children), future tense verbs (will slide, will eat), subjective pronouns (she, they), contractible copula (it's). Emerging but inconsistent: third person singular (swims, flies), auxiliary + -ing (is eating, are swimming), uncontractible copula (They are, He is).
- **Word Classes**: 9th percentile — but the visual split is dramatic: 12 out of 12 correct with pictures (100%), only 3 out of 8 without pictures (37.5%). This quantifies how much she depends on visual support.
- **Formulated Sentences**: 16th percentile — struggles to construct grammatically correct sentences. Drops stimulus words, makes errors like "my cat and my dog is playing." Needs support building complete sentences.
- **Recalling Sentences**: 5th percentile — auditory memory for sentence-length material is very low. Breaks down as sentences grow longer and more complex.

### Speech Articulation (GFTA-3)

- **Sounds in Words**: 25th percentile — AVERAGE
- **Sounds in Sentences**: 25th percentile — AVERAGE
- Speech production is fine. She has some emerging R sounds (substitutes W for R in blends sometimes, omits final R occasionally) but these are developing naturally and self-correctable with a model. Speech intelligibility rated "good" on 90% of sentences. Her issues are language-based, not articulation-based.

### Dyslexia

Ila has dyslexia — decoding, phonemic awareness, and sight word recognition are all significantly behind. Letters and words don't click the way they do for typical readers. This is why she uses the Wilson Reading System, which is an Orton-Gillingham based approach that teaches reading through structured, multisensory phonics. The dyslexia and ADHD compound each other: she struggles to decode AND struggles to sustain attention while decoding, so reading is doubly exhausting for her.

### Speech Therapy History

Received Speech Improvement services starting January 2024 (Kindergarten) for L, S, Z, S blends, and TH sounds. Made steady progress and passed screening fall 2024 — graduated from speech services. Shows she can make meaningful progress with structured support.

### Academic Achievement (WIAT-4, January 2026)

| Subtest | Score | Percentile | Level |
|---------|-------|------------|-------|
| Total Reading | 81 | 10th | Below Average |
| Word Reading | 82 | 12th | Below Average |
| Pseudoword Decoding | 85 | 16th | Low Average |
| Reading Comprehension | 85 | 16th | Low Average |
| Oral Reading Fluency | 85 | 16th | Low Average |
| Math Problem Solving | 85 | 16th | Low Average |
| Numerical Operations | 107 | 68th | Average ← surprise strength |
| Spelling | 102 | 55th | Average ← in isolation |
| Sentence Building | 94 | 34th | Average |

### Key Insights from WIAT-4

- Reads ~97 words/minute with 13 errors on first passage
- Reading comprehension: 27% literal questions, 63% inferential — stronger with inference than facts
- Narrative comprehension (64%) vs expository (13%) — she understands stories, not textbooks
- Spelling collapses under cognitive load — average in isolation, breaks down in sentences
- Math computation is average when language is removed — not a math problem, a language problem
- Rushing is her biggest enemy — rapid pace causes errors that don't reflect her true ability

### What this means for Sunny

She cannot hold long verbal instructions. If you give her three steps, she'll lose the second and third. Everything must be broken into one step at a time, confirmed before moving on. Her scores jump dramatically when she can see what she's working on — always describe things visually or reference pictures. Because of the dyslexia, never assume she can read something — always say it out loud too. Use a clear "ready? go!" signal before giving directions. Her Sentence Comprehension is average — that's her anchor, use it. Her speech sounds fine so don't treat her like she has a speech impediment.

## What She's Working On

- Phonics and decoding (Wilson Reading)
- Building sight word fluency
- Following multi-step directions (broken into singles)
- Sentence recall and retelling
- Grammatical structures: irregular plurals, future tense, pronouns, copula verbs
- Formulating complete, grammatically correct sentences

## What Works

- **Visual support always** — 100% accuracy with pictures, 37.5% without. She collapses without visuals.
- **Narrative over expository** — frame everything as a story, not a lesson
- **Inference over recall** — ask "what do you think happens next?" not "what did I just say?"
- **One instruction at a time** — never stack directions
- **"Wait until I say Go"** — give her a clear signal before she needs to act
- **Short sentences** from Sunny — match her processing capacity
- **Celebrate effort over accuracy** — she shuts down when she feels wrong
- **Breaks** — she benefits from brief pauses between tasks
- **Patience** — never rush, let Ila set the pace
- **Repetition disguised as games** — she needs many exposures but gets bored with drill
- **Lean into Sentence Comprehension** — it's her strongest skill, use it as a bridge to weaker areas
- **"Whole body listening"** prompts — the evaluator found these effective

## What Doesn't Work

- Long verbal explanations — she zones out after the first sentence
- Stacking instructions ("first do X, then Y, then Z")
- Rushing — she speaks at a rapid rate and will rush through tasks if not gently slowed
- Negative correction — any hint of "wrong" and she withdraws
- Comparing to Reina — they are twins but learn very differently
- Assuming she can read silently — always say it out loud

## CHILD_AUTHORITY_RULE (Elli / Ila sessions)

- **Never spell a word letter-by-letter** unless the child explicitly asks for that mode. Default to whole-word or sentence-level spelling support.
- **3-level hint scaffold:** (1) subtle nudge or context, (2) partial reveal (e.g. pattern or first sound), (3) minimal direct answer — escalate only if she is still stuck after a real try.
- **Frustration detection:** If she shuts down, snaps, or says she is done, back off immediately — validate the feeling, shorten the turn, and offer a choice (harder path vs. different activity) instead of pushing.
- **The child owns the answer:** Do not give the final answer (letter, word, or puzzle solution) unless she explicitly asks for the answer or you are on step 3 of the hint scaffold after a real attempt. Prefer questions that let *her* decide.

### WHEEL OF FORTUNE SPECIFIC

When the child asks "what letter should I guess?"

Do NOT suggest a specific letter.

Instead say: "What letter do YOU think is in there?"

or "Think about what letters make that sound."

The child must make the choice.

## Her Life

- Twin sister Reina is her best friend and her opposite — Reina is academically ahead, Ila is the creative emotional one
- Loves art, stories, and being silly
- Proud when she succeeds — lights up with genuine encouragement
- ADHD means impulse control is hard — she will interrupt, jump ahead, and lose focus. This is not defiance, it's her brain.
- Described as "an absolute pleasure to work with" by her evaluator — she is friendly, willing, and easily engaged
- Favorite show: GeGeGe no Kitarō
- Language: English, Japanese

## Session History

(Updated after each session — see context/ila/ila_context.md for running notes)

## What We're Discovering

The goal is not just to close gaps or hit learning plan targets.
The goal is to find what Ila is naturally gifted at — then pour into it.
Every session is also a discovery session.

## Favorite Things

- Food: French toast with syrup (her absolute favorite)
- Shows: GeGeGe no Kitarō, Doraemon, Teen Titans
- Loves designing and imagining — named Elli "Elli Blessed Taylor"
- Wants to teach Elli Japanese
- Planning to visit Japan in June 2026


---

## IEP Updates

### Initial Psychoeducational Evaluation — February 24, 2026
**Evaluator**: Carolyn Delaney, MS, CAS (School Psychologist)
**Purpose**: Initial evaluation for special education eligibility following IEE

**Key Findings**:
- Confirmed diagnoses from IEE: ADHD Combined Type, Dyslexia, Specific Learning Disorders in Reading and Written Expression
- **WIAT-4 Academic Results**:
  - Total Reading: 81 (10th percentile) — Below Average
  - Word Reading: 82 (12th percentile) — Below Average  
  - Reading Comprehension: 85 (16th percentile) — Low Average
  - Mathematics: 95 (37th percentile) — Average (strength area)
  - Numerical Operations: 107 (68th percentile) — Average
  - Spelling: 102 (55th percentile) — Average (when isolated)

**Behavioral Observations**: Significant impulsivity, rushes through tasks, requires frequent redirection to slow down, responds well to praise

**Recommendations**: 
- Multisensory reading approach (already using Wilson)
- Visual aids and manipulatives for math
- Executive functioning supports (slow-down cues, task breakdown, preferential seating)
- Testing accommodations (1.5x time, minimal distractions)
- Sensory breaks for ADHD management

**Status**: Evaluation submitted to CSE for eligibility determination

---

# Planner target (verbatim from her current homework cycle; opaque ids of already-seen items removed. Treat every sentence or context she has already seen as used, and author fresh ones)

Assignment: Unit 3 Week 1: r-Controlled ar, or. Academic construct to preserve: The retrieval-first, return-after-a-gap format is what moves words to on-her-own correct: dormant and ornament did it on board 11. Pardon's t is a fixed sound habit (her voice blurs d into t, and carton gives her a ready-made spelling to borrow). It needs a felt cue (the voicing buzz) during retrieval, not more exposure. Carnivore is now a letter-order error, not a missing e. This node must test unseen transfer: change the context while preserving the construct. Author fresh items. These have already been seen and must not be reused verbatim: (ids removed). Planner decision behind this node: Looking at the 7 locked evaluations (alarm, charge, starving, forgot, import, dormant, march) next to board 11's Memory Check: she scored 9 of 12 on her own, her best check so far. Dormant was right on her own for the first time (1 of 9 before). Ornament was right on her own in the game, in Stampede and on the check, with no 'ornument'. Alarm kept its r. All 6 steady words held. The retrieval-first Memory Lanterns game is the first format where game gains carried into the check. Three words are still missed. Pardon came out 'parton' for the 8th time on her own. In the game she was right twice after a first 'parton', but it went back to 'parton' on the check. Carnivore now keeps its e, but she swapped two letters ('carinvore'): n and i are out of order. Charge came out 'chargr' (r sits next to e on the keyboard, so likely a slip) and 'gharge' in Stampede. With the test in 2 days and 9 of 12 right on her own, she should face a Quest now. One more retrieval-first round on the 3 missed words comes first. Created at: 2026-11-11T00:27:59.391Z.

---

# Your task

Build the game for ila. Return ONLY the complete HTML file: start with the <!-- DESIGN CARD --> comment and end with </html>. No commentary before or after.