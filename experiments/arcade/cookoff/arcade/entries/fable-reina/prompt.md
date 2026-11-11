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

# Brief: Reina

This is what a chef receives for Reina, assembled from her real files on 2026-11-10 (a sandbox copy of Saori's data). In the actual run, the harness appends her full `soul.md` and chart context verbatim. This page is the readable version, written for the owner.

## This week's target (from the Planner's latest node, board ready 11/10)

- **Chapter 5:** Represent division and find the size of equal groups
- **Worksheet items:**
  - "You have 16 counters and 4 equal groups. How many counters go in each group?"
  - "You have 24 counters and 3 equal groups. How many counters go in each group?"
- **The Planner's intent:** practice finding the size of each group with bigger facts (16 ÷ 4, 24 ÷ 3), using the worksheet's way of dealing out one at a time and linking it to multiplication (3 × ? = 24), "so she can do it in her head."
- **Answer format:** she finds and enters the number in each group. The game must make her reason about it, not pick from a set of guesses.
- The two worksheet items are anchors. A great game builds more equal-group problems at the same level, then pushes past it.

## Who she is, as a player (from soul.md)

| Fact from her files | What it means for a game designer |
|---|---|
| A year ahead of grade level. "Gets frustrated when things are too easy, not when they're too hard." | **Start harder than you think.** Ramp fast. Boredom is the enemy, not difficulty. |
| Thrives on competition, personal bests and streaks | Scoreboards, records, "beat your best", combos and streaks are the hook. |
| A wrestler on an 8-year-old girls team. Takedowns, pins and championships land with her. | Wrestling is a natural world: matches, rounds, moves, a championship belt. |
| Loves chess and strategy games | Choices with consequences. Smart play should beat button mashing. |
| Speed and energy: "match her pace, she's fast and likes it fast" | Snappy controls, quick rounds, no slow cut-scenes. |
| Wants to be seen as smart. Hates baby talk and oversimplification. | Respect her. Hard-mode bragging rights. |
| Bilingual, proud of her Japanese. すごい! やった! | Japanese celebrations when she wins. |
| Loves the movie *Matilda* (a smart girl who doesn't back down) and chose Matilda as her companion | Use the *feeling* (brains beat bullies, books as power), never the actual film characters. |
| Shows: GeGeGe no Kitarō, Teen Titans, Doraemon. Foods: fries, burgers, pizza, sushi. | Flavor for the world, all original. |
| Her own goals: math, especially subtraction, multiplication and division | She *wants* this skill. Frame it as leveling up something she chose. |
| Companion: **Matilda** | Matilda appears in the game and reacts briefly. |

## What the chart shows about her play

- Her current math board (3 game stops plus a mystery) has just been built and isn't played yet, so this contest runs alongside it.
- On 11/8 a server setting blocked her math session ("Sunny lost the connection"). She has had less math time than Ila has had spelling time, so her engagement data is thin. The game should earn its data.

## Tensions a great game has to solve

1. **Fast but real.** She likes speed, but division needs real reasoning. How does speed reward thinking instead of guessing?
2. **Equal groups made physical.** The worksheet "deals" counters one at a time. Can dealing become the game's core action, with skill visible in the hands?
3. **From dealing to "in my head."** The Planner wants her to move from dealing out to knowing (3 × ? = 24). Does the game ramp her from one to the other?
4. **Competition with no rival present.** She plays alone. Who or what does she beat: her own best, a ghost of her last run, a boss?

## Hard rules recap (from the ticket)

The exact skill is equal-group division at this level and up. She reasons; she doesn't guess from options. Misses are safe and come back later. Original art only. Never compare her with Ila.


---

# reina's soul.md (verbatim)

# Reina — Matilda's Soul File

## Who She Is

- Name: Reina
- Age: 8 years old
- Twin sister to Ila
- Academically a year ahead of peers
- Companion: Matilda (voice: Matilda)
- Speaks Japanese

## Her Brain

- Consistently scores 100 on spelling tests — never misses
- A year ahead of grade level — standard work bores her
- Needs harder challenges to stay engaged
- Thrives on competition, personal bests, and streaks
- Quick learner who gets frustrated when things are too easy, not when they're too hard

## What She's Working On

- Advanced vocabulary and spelling challenges beyond grade level
- Critical thinking and deeper comprehension
- Building on her bilingual advantage (English + Japanese)
- Competitive goal-setting — streaks, records, personal bests

## What Works

- **Challenge her** — she wants to be pushed, easy work makes her disengage
- **Competition framing** — scoreboards, streaks, "can you beat your record?"
- **Wrestling metaphors** — she's a wrestler on her 8-year-old girls team; takedowns, pins, championships land with her
- **Japanese celebration** — すごい and やった mixed naturally into English when she succeeds
- **Matilda movie references** — she chose her companion because she loves the movie; Miss Honey, standing up to the Trunchbull, the magic of books
- **Speed and energy** — match her pace, she's fast and likes it fast
- **Acknowledge her strengths** — she's smart and wants to be seen as smart

## What Doesn't Work

- Going too slow or too easy — she checks out
- Baby talk or over-simplification
- Ignoring her competitive nature — she wants to win
- Not acknowledging her Japanese — it's part of her identity and makes her feel special

## Her Life

- Twin sister Ila has her own companion (Sunny) — Reina knows about this and thinks it's cool
- Loves the movie Matilda — sees herself in the character (smart girl who doesn't back down)
- Wrestler — training and competing on an 8-year-old girls team
- Bilingual — speaks Japanese, which she's proud of
- Her father built Matilda specifically for her

## Session History

(Updated after each session — see context/reina/reina_context.md for running notes)

## What We're Discovering

The goal is not just to accelerate academics.
The goal is to find what Reina is innately talented at — then pour into it.
Every session is also a talent discovery session.

## Her Goals (In Her Own Words)

- Math: loves it, specific gap is subtraction, multiplication, division
- Japanese: wants to learn kanji and katakana before Japan trip (June 2026)
- Wrestling: wants to talk about double leg takedowns and how to handle losing
- Reading the Constitution with dad
- Interested in learning piano
- Loves chess

## Parent Goals (Saori)

- Improve vocabulary in both English and Japanese
- Establish a baseline and measure improvement over time
- Make assessment feel like play not a test
- Discover her innate talents and gifts

## Favorite Things

- Food: French fries, hamburgers, pizza, sushi, tomatoes
- Shows: Matilda, GeGeGe no Kitarō, Teen Titans, Doraemon
- Speaks Japanese, proud of it
- Wrestler on an 8-year-old girls team
- Loves chess and strategy games

## MATILDA_CHILD_AUTHORITY_RULE

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


---

# Planner target (verbatim from her current homework cycle; opaque ids of already-seen items removed. Treat every sentence or context she has already seen as used, and author fresh ones)

Assignment: Chapter 5, represent division and find the size of equal groups (worksheet: 16 counters into 4 equal groups; 24 counters into 3 equal groups). Her current board's stops, as the Planner wrote them. This game is the board's Boss/Quest node: it should cover the Team Split Takedown skill and finish with a Championship Match.

- Weigh-In (baseline): Before the tournament, every wrestler steps on the scale. Matilda wants to see how fast Reina can split counters into equal teams, with no coaching. Three quick bouts, all on the clock. Can she go 3-for-3?
- Team Split Takedown (baseline): The coach needs equal squads for practice. Reina deals counters onto the mats one at a time, like dealing cards, until none are left, then counts each squad. Each clean split is a takedown on the scoreboard. Bigger numbers, faster rounds.
- Locker Room Mystery (mystery): The locker room door is glowing. Something is waiting behind it before the championship match. すごい!
- Championship Match (baseline): The final match has two rounds. In Round 1, José's CDs have to be packed in boxes of 9: how many boxes? In Round 2, Mary's library books, like Matilda's favorite place, have to be shared equally across 4 shelves. Reina has to read each move: is she finding how many groups, or how many in each group? Win both rounds for the pin. やった!

---

# Your task

Build the game for reina. Return ONLY the complete HTML file: start with the <!-- DESIGN CARD --> comment and end with </html>. No commentary before or after.