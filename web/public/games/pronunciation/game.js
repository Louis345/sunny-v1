// game.js
//
// Orchestration layer. All pure logic lives in logic.js (and has tests).
// This file is the glue: DOM, Web Audio, camera, Web Speech API, rAF loop.
// When Sunny migration happens, this file splits into a hook and the HTML
// gets templated — logic.js does not change.

import {
  matchWord,
  beltPosition,
  scoreForHit,
  shouldSpawn,
  createWordQueue,
  pitchForStreak,
  curveFor,
  findKidNormCollisions,
  buildNodeResult,
} from './logic.js';
import { SUNNY_AUDIO } from './constants.js';

// ---------------------------------------------------------------------------
// Default config — the prototype's hardcoded word list.
// ---------------------------------------------------------------------------
// This is the one piece of "hardcoded" intentionally kept for the prototype.
// getConfig() still reads URL params so a test harness can override without
// editing this file. When this migrates into Sunny, this constant gets
// deleted and getConfig() reads from URL params only (NodeConfig pipes words
// in from buildProfile(childId).dueWords).

const DEFAULT_WORDS = [
  'blister', 'carpet', 'thirteen', 'orbit', 'harvest',
  'confirm', 'interrupt', 'perfume', 'hamburger', 'corner',
  'kindergarten', 'chimp', 'inhabit', 'instruments', 'band',
];

const PALETTE = [
  ['#8b7cff', '#6D5EF5'],
  ['#f9a8d4', '#f472b6'],
  ['#22d3ee', '#06b6d4'],
  ['#34d399', '#10b981'],
  ['#fbbf24', '#f59e0b'],
  ['#a78bfa', '#8b5cf6'],
];

function getConfig() {
  const p = new URLSearchParams(location.search);
  const wordsParam = p.get('words');
  const words = wordsParam
    ? wordsParam.split(',').map(w => w.trim()).filter(Boolean)
    : DEFAULT_WORDS;
  const difficulty = parseInt(p.get('difficulty') || '2', 10);

  // beltMode is canonical; `mode` is legacy and warns.
  let beltMode = p.get('beltMode');
  if (!beltMode) {
    const legacy = p.get('mode');
    if (legacy) {
      console.warn('[pronunciation-game] ?mode= is deprecated, use ?beltMode=');
      beltMode = legacy;
    } else {
      beltMode = 'depth';
    }
  }

  const duration = parseInt(p.get('duration') || '60000', 10);
  const nodeId = p.get('nodeId') || 'pronunciation-game';
  const childId = p.get('childId') || 'unknown';
  return { words, difficulty, beltMode, duration, nodeId, childId };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  running: false,
  calibrated: false,
  audioOn: true,
  startedAt: 0,
  active: [],            // list of live pill entries
  lastSpawnAt: 0,
  hits: 0,
  wordsAttempted: 0,     // hits + resolved misses. In-flight at timeout excluded.
  xp: 0,
  streak: 0,
  bestStreak: 0,
  missesByWord: new Map(),
  paletteIdx: 0,
  queue: null,
};

let config;
let audioCtx = null;
let ambientNodes = [];
let rec = null;
let nextPillId = 1;
const particles = [];

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
function ensureAudio() {
  if (audioCtx) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  audioCtx = new Ctor();
}

function startAmbient() {
  if (!audioCtx || !state.audioOn || ambientNodes.length) return;
  const master = audioCtx.createGain();
  master.gain.value = 0.063; // ~-24 dB
  master.connect(audioCtx.destination);

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  lp.connect(master);

  [130.81, 196.00].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (i === 0 ? 1.003 : 0.997);
    osc.connect(lp);
    osc.start();
    ambientNodes.push(osc);
  });

  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.1;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 0.015;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();
  ambientNodes.push(lfo);
  ambientNodes.push(master);
}

function stopAmbient() {
  for (const n of ambientNodes) {
    try { if (n.stop) n.stop(); } catch (e) { /* gain nodes don't stop */ }
    try { n.disconnect(); } catch (e) {}
  }
  ambientNodes = [];
}

function playHitPop(streak) {
  if (!audioCtx || !state.audioOn) return;
  const now = audioCtx.currentTime;
  const freq = pitchForStreak(streak);
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.1);

  // noise snap 30ms after the tone
  const bufSize = Math.floor(audioCtx.sampleRate * 0.06);
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  const ngain = audioCtx.createGain();
  ngain.gain.value = 0.18;
  noise.connect(ngain).connect(audioCtx.destination);
  noise.start(now + 0.03);
}

function playMiss() {
  if (!audioCtx || !state.audioOn) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(filter).connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

function playWhoosh() {
  if (!audioCtx || !state.audioOn) return;
  const now = audioCtx.currentTime;
  const bufSize = Math.floor(audioCtx.sampleRate * 0.15);
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufSize; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1000;
  bp.Q.value = 1;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.08;
  noise.connect(bp).connect(gain).connect(audioCtx.destination);
  noise.start(now);
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    const video = document.getElementById('camera');
    video.srcObject = stream;
    document.getElementById('bg-fallback').style.display = 'none';
    return true;
  } catch (e) {
    console.warn('camera denied or unavailable:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Starfield (behind everything but camera)
// ---------------------------------------------------------------------------
function initStars() {
  const c = document.getElementById('stars');
  function resize() { c.width = innerWidth; c.height = innerHeight; }
  resize();
  addEventListener('resize', resize);
  const stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      r: Math.random() * 1.5 + 0.3,
      a: Math.random(),
      s: (Math.random() * 0.02 + 0.005) * (Math.random() < 0.5 ? -1 : 1),
    });
  }
  const ctx = c.getContext('2d');
  function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of stars) {
      s.a += s.s;
      if (s.a > 1 || s.a < 0.2) s.s = -s.s;
      ctx.globalAlpha = s.a * 0.55;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

// ---------------------------------------------------------------------------
// Particles (explosion on hit)
// ---------------------------------------------------------------------------
function initParticles() {
  const c = document.getElementById('particles');
  function resize() { c.width = innerWidth; c.height = innerHeight; }
  resize();
  addEventListener('resize', resize);
  const ctx = c.getContext('2d');
  function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 1 / 60;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

function burst(x, y, colors) {
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      r: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
    });
  }
}

// ---------------------------------------------------------------------------
// Belt: spawn / update / hit / miss
// ---------------------------------------------------------------------------
function spawnWord() {
  const word = state.queue.next();
  if (!word) return;
  const pal = PALETTE[state.paletteIdx % PALETTE.length];
  state.paletteIdx++;

  const el = document.createElement('div');
  el.className = 'pill';
  el.textContent = word;
  el.style.background = `linear-gradient(135deg, ${pal[0]}, ${pal[1]})`;
  el.style.boxShadow = `0 10px 24px rgba(0,0,0,0.45), 0 0 40px ${pal[1]}44`;
  document.getElementById('belt').appendChild(el);

  const missedBefore = state.missesByWord.get(word) || 0;
  const curve = curveFor(config.difficulty);
  const travelMs = missedBefore > 0 ? 3800 : curve.travelMs;

  state.active.push({
    id: nextPillId++,
    word,
    spawnedAt: performance.now(),
    travelMs,
    palette: pal,
    el,
    hit: false,
    fading: false,
    inSayZone: false,
  });
  state.lastSpawnAt = performance.now();
  playWhoosh();
}

function updatePill(entry, now) {
  const t = (now - entry.spawnedAt) / entry.travelMs;

  if (entry.fading) {
    // let the CSS animation finish, then drop
    return t < 1.5;
  }

  if (t >= 1 && !entry.hit) {
    // miss
    entry.fading = true;
    const prev = state.missesByWord.get(entry.word) || 0;
    state.missesByWord.set(entry.word, prev + 1);
    state.queue.flag(entry.word);
    state.streak = 0;
    state.wordsAttempted++;
    updateHud();
    entry.el.classList.add('miss');
    playMiss();
    setTimeout(() => entry.el.remove(), 320);
    return true;
  }

  const pos = beltPosition(t, config.beltMode);
  entry.inSayZone = pos.inSayZone;
  entry.el.style.left = pos.x + '%';
  entry.el.style.top = pos.y + '%';
  entry.el.style.transform = `translate(-50%, -50%) scale(${pos.scale})`;
  entry.el.style.opacity = pos.opacity;
  return true;
}

function hitWord(entry) {
  if (entry.hit || entry.fading) return;
  entry.hit = true;
  state.hits++;
  state.wordsAttempted++;
  state.streak++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  state.xp += scoreForHit(state.streak);

  const r = entry.el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, entry.palette);
  playHitPop(state.streak);

  entry.el.classList.add('hit');
  setTimeout(() => entry.el.remove(), 200);
  updateHud();
}

function updateHud() {
  document.getElementById('streak').textContent = state.streak;
  document.getElementById('xp').textContent = state.xp;
}

// ---------------------------------------------------------------------------
// Speech recognition
// ---------------------------------------------------------------------------
function initSTT() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('mic-chip').textContent = 'Chrome only';
    return false;
  }
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';

  rec.onstart = () => {
    document.getElementById('mic-chip').classList.remove('inactive');
    document.getElementById('mic-chip').classList.add('active');
    document.getElementById('mic-chip').textContent = 'listening';
  };

  rec.onend = () => {
    document.getElementById('mic-chip').classList.remove('active');
    document.getElementById('mic-chip').classList.add('inactive');
    // Chrome kills continuous recognition periodically — restart if playing.
    if (state.running || !state.calibrated) {
      setTimeout(() => { try { rec.start(); } catch (e) {} }, 120);
    }
  };

  rec.onerror = (e) => {
    console.warn('STT error:', e.error);
  };

  rec.onresult = (ev) => {
    let latestFull = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      latestFull = ev.results[i][0].transcript;
    }
    const lastToken = latestFull.trim().split(/\s+/).pop() || '';
    document.getElementById('heard').textContent = lastToken || '—';

    if (!state.calibrated) {
      if (/\b(ready|start|ok|okay|go)\b/i.test(latestFull)) {
        state.calibrated = true;
        document.getElementById('calibrating').classList.add('hidden');
        beginPlay();
      }
      return;
    }
    checkHit(lastToken);
  };

  try { rec.start(); } catch (e) {}
  return true;
}

function checkHit(heard) {
  if (!heard) return;
  const sayable = state.active.filter(e => !e.hit && !e.fading && e.inSayZone);
  const pool = sayable.map(e => e.word);
  for (const entry of sayable) {
    if (matchWord(heard, entry.word, pool)) {
      hitWord(entry);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function beginPlay() {
  state.running = true;
  state.startedAt = performance.now();
  state.queue = createWordQueue(config.words);
  startAmbient();
  loop();
}

function loop() {
  if (!state.running) return;
  const now = performance.now();

  const curve = curveFor(config.difficulty);
  const activeCount = state.active.filter(e => !e.hit && !e.fading).length;
  // Gently accelerate spawn cadence per 5 hits, floor at 1200ms.
  const cadence = Math.max(1200, curve.cadenceMs - Math.floor(state.hits / 5) * 300);

  if (shouldSpawn({
    now,
    lastSpawnAt: state.lastSpawnAt,
    activeCount,
    maxActive: curve.maxActive,
    cadenceMs: cadence,
  })) {
    spawnWord();
  }

  state.active = state.active.filter(e => updatePill(e, now));

  if (now - state.startedAt > config.duration) {
    endGame();
    return;
  }
  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  stopAmbient();
  if (rec) { try { rec.stop(); } catch (e) {} }

  // In-flight pills at timeout are NOT counted into wordsAttempted.
  // The child never got a chance to resolve them — penalizing accuracy
  // with words they didn't see finish would punish engagement speed.
  document.querySelectorAll('.pill').forEach(p => p.remove());
  state.active = [];

  const accuracy = state.wordsAttempted
    ? state.hits / state.wordsAttempted
    : 0;

  document.getElementById('end-title').textContent =
    accuracy >= 0.7 ? '🎉 amazing!' : 'keep practicing!';
  document.getElementById('end-hits').textContent = state.hits;
  document.getElementById('end-xp').textContent = state.xp;
  document.getElementById('end-streak').textContent = state.bestStreak;

  const flagged = [...state.missesByWord.entries()]
    .filter(([, c]) => c >= 2)
    .map(([w]) => w);

  if (flagged.length) {
    document.getElementById('end-flagged-wrap').style.display = 'block';
    const list = document.getElementById('end-flagged');
    list.innerHTML = '';
    for (const w of flagged) {
      const chip = document.createElement('div');
      chip.className = 'flagged-chip';
      chip.textContent = `🔊 ${w}`;
      chip.onclick = () => {
        const u = new SpeechSynthesisUtterance(w);
        u.rate = 0.8;
        speechSynthesis.speak(u);
      };
      list.appendChild(chip);
    }
  } else {
    document.getElementById('end-flagged-wrap').style.display = 'none';
  }

  document.getElementById('end-screen').classList.remove('hidden');

  // Post the new NodeResult shape — see MIGRATION.md for the Sunny-side
  // changes this assumes. Old 'node_result' type is gone.
  try {
    const payload = buildNodeResult({
      config,
      wordsHit: state.hits,
      wordsAttempted: state.wordsAttempted,
      missesByWord: state.missesByWord,
      xpEarned: state.xp,
      timeSpent_ms: performance.now() - state.startedAt,
      completed: true,
    });
    window.parent.postMessage(payload, '*');
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
async function onStart() {
  config = getConfig();

  const collisions = findKidNormCollisions(config.words);
  if (collisions.length) {
    console.warn('[pronunciation-game] kidNorm collisions in word list — ' +
      'matcher will reject ambiguous matches at runtime:', collisions);
  }

  ensureAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch (e) {}
  }

  await initCamera();
  initSTT();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('calibrating').classList.remove('hidden');
}

function onReplay() {
  Object.assign(state, {
    running: false,
    calibrated: false,
    startedAt: 0,
    active: [],
    lastSpawnAt: 0,
    hits: 0,
    wordsAttempted: 0,
    xp: 0,
    streak: 0,
    bestStreak: 0,
    missesByWord: new Map(),
    paletteIdx: 0,
    queue: null,
  });
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('calibrating').classList.remove('hidden');
  document.getElementById('end-flagged-wrap').style.display = 'none';
  updateHud();
  if (rec) { try { rec.start(); } catch (e) {} }
}

function onBack() {
  try {
    const payload = buildNodeResult({
      config: config || { nodeId: 'pronunciation-game', childId: 'unknown' },
      wordsHit: state.hits,
      wordsAttempted: state.wordsAttempted,
      missesByWord: state.missesByWord,
      xpEarned: state.xp,
      timeSpent_ms: state.startedAt ? performance.now() - state.startedAt : 0,
      completed: false,
    });
    window.parent.postMessage(payload, '*');
  } catch (e) {}
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
}

function onAudioToggle() {
  state.audioOn = !state.audioOn;
  document.getElementById('audio-toggle').textContent =
    state.audioOn ? '🎵 on' : '🎵 off';
  if (state.audioOn) startAmbient();
  else stopAmbient();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initStars();
initParticles();
document.getElementById('start-btn').onclick = onStart;
document.getElementById('replay-btn').onclick = onReplay;
document.getElementById('back-btn').onclick = onBack;
document.getElementById('audio-toggle').onclick = onAudioToggle;
