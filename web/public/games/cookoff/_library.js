/**
 * Sunny library-game bridge. Loaded right after /games/_contract.js by every hand-built game in /games/cookoff/.
 *
 * Code owns truth here, the game owns play:
 * - Content: window.SUNNY_GAME_CONFIG = { childId, nodeId, subject, items: [{ itemId, prompt, answer }] } when the
 *   board injected it (a <script type="application/json" id="sunny-game-config">), else the game keeps its own content.
 * - Companion: GET /api/companion/current/<childId> (childId from ?child=, ?childId= or the config). Falls back to
 *   /companions/sample.vrm with a console warning.
 * - Evidence: the game keeps calling window.SunnyEvidence.*; this bridge maps each game target to the node's frozen
 *   itemId by normalized text and drives the same contract path a generated Quest/Boss uses:
 *   window.openItem / openSpellingItem bookkeeping, window.fireAttemptEvent(...) and window.sendNodeComplete(...).
 *   A target that matches no item is still sent on the activity_evidence stream, marked as play (never homework).
 */
(function () {
  "use strict";

  function log(action, result) {
    try { console.log(" 🎮 [library-game] [" + action + "] " + result); } catch (_e) { /* logging never breaks play */ }
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------------- config ----------------
  var config = null;
  try {
    var el = document.getElementById("sunny-game-config");
    if (el) config = JSON.parse(el.textContent || "null");
  } catch (err) {
    console.warn(" 🎮 [library-game] [config] [unreadable]", err);
  }
  if (!config && window.SUNNY_GAME_CONFIG && typeof window.SUNNY_GAME_CONFIG === "object") config = window.SUNNY_GAME_CONFIG;
  var items = (config && Array.isArray(config.items) ? config.items : []).filter(function (it) {
    return it && typeof it.itemId === "string" && it.itemId.trim() && String(it.answer == null ? "" : it.answer).trim();
  }).map(function (it) {
    return { itemId: it.itemId, prompt: String(it.prompt == null ? "" : it.prompt), answer: String(it.answer).trim() };
  });
  if (config) window.SUNNY_GAME_CONFIG = Object.assign({}, config, { items: items });

  var params = window.GAME_PARAMS || { itemBindings: [], spellingItemBindings: [] };
  var query = new URLSearchParams(location.search);
  var childId = query.get("child") || query.get("childId") || (config && config.childId) || "";
  var subject = (config && config.subject) || (params.spellingItemBindings && params.spellingItemBindings.length ? "spelling" : "math");
  var activityId = (config && config.gameId) || document.title || "library-game";
  log("config", items.length ? "[injected] game=" + activityId + " items=" + items.length + " subject=" + subject : "[none] game=" + activityId + " using built-in content");

  // The board launch carries the node's frozen bindings. When it did not, the config's items are that same node's
  // frozen items (written by the board for this stop), so they become the bindings: never invented ids.
  if (items.length && subject === "math" && Array.isArray(params.itemBindings) && !params.itemBindings.length) {
    items.forEach(function (it) { params.itemBindings.push({ itemId: it.itemId, display: it.prompt || it.answer }); });
    log("bindings", "[from-config] kind=item count=" + items.length);
  }
  if (items.length && subject === "spelling" && Array.isArray(params.spellingItemBindings) && !params.spellingItemBindings.length) {
    items.forEach(function (it) { params.spellingItemBindings.push({ itemId: it.itemId, word: it.answer }); });
    log("bindings", "[from-config] kind=spelling count=" + items.length);
  }

  // ---------------- target -> item ----------------
  function norm(value) {
    var s = String(value == null ? "" : value).normalize("NFC").toLowerCase().trim();
    if (subject === "spelling") return s.replace(/[^\p{L}]+/gu, "");
    return s.replace(/[×*]/g, "x").replace(/[÷/]/g, "÷").replace(/[^\p{L}\p{N}x÷=?+\-]+/gu, "");
  }
  function itemKey(it) { return subject === "spelling" ? it.answer : (it.prompt || it.answer); }
  function itemFor(target) {
    if (target == null) return null;
    var byId = items.filter(function (it) { return it.itemId === target; });
    if (byId.length === 1) return byId[0];
    var wanted = norm(target);
    if (!wanted) return null;
    var matches = items.filter(function (it) { return norm(itemKey(it)) === wanted; });
    return matches.length === 1 ? matches[0] : null;   // ambiguous text is not a match
  }

  // ---------------- companion ----------------
  var FALLBACK_COMPANION = { companionId: "sample", name: "", vrmUrl: "/companions/sample.vrm", voiceId: "" };
  var companionPromise = null;
  function companion() {
    if (companionPromise) return companionPromise;
    if (!childId) {
      console.warn(" 🎮 [library-game] [companion] [fallback] reason=no_child vrm=" + FALLBACK_COMPANION.vrmUrl);
      companionPromise = Promise.resolve(FALLBACK_COMPANION);
      return companionPromise;
    }
    companionPromise = fetch("/api/companion/current/" + encodeURIComponent(childId), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (c) {
        if (!c || typeof c.vrmUrl !== "string" || !c.vrmUrl.trim()) throw new Error("no_vrmUrl");
        log("companion", "[loaded] child=" + childId + " companion=" + (c.companionId || "?") + " name=" + (c.name || "?"));
        return { companionId: String(c.companionId || ""), name: String(c.name || ""), vrmUrl: c.vrmUrl, voiceId: String(c.voiceId || "") };
      })
      .catch(function (err) {
        console.warn(" 🎮 [library-game] [companion] [fallback] child=" + childId + " reason=" + (err && err.message) + " vrm=" + FALLBACK_COMPANION.vrmUrl);
        return FALLBACK_COMPANION;
      });
    return companionPromise;
  }
  companion();   // start now; the game awaits it while its world builds

  /** Load the child's companion VRM with the game's GLTFLoader; a model that fails to load falls back to sample.vrm. */
  function loadCompanion(loader, onProgress) {
    return companion().then(function (c) {
      return loader.loadAsync(c.vrmUrl, onProgress).catch(function (err) {
        if (c.vrmUrl === FALLBACK_COMPANION.vrmUrl) throw err;
        console.warn(" 🎮 [library-game] [companion] [fallback] reason=vrm_load_failed url=" + c.vrmUrl, err);
        return loader.loadAsync(FALLBACK_COMPANION.vrmUrl, onProgress);
      });
    });
  }

  // ---------------- voice for lines with no recording ----------------
  // In the board the companion says it in her own voice (narration_request); opened on its own, the browser says it.
  function speak(text, opts) {
    opts = opts || {};
    text = String(text == null ? "" : text).trim();
    if (!text) return Promise.resolve();
    var ms = Math.min(9000, 700 + text.split(/\s+/).length * 380);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "narration_request", text: text, reason: opts.reason || "library_game_line", activityId: activityId,
        nodeId: params.nodeId, itemId: opts.itemId, word: opts.word, launchToken: params.launchToken }, "*");
      log("voice", "[narration-requested] reason=" + (opts.reason || "library_game_line"));
      return wait(ms);
    }
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      return new Promise(function (res) {
        var done = false; var fin = function () { if (!done) { done = true; res(); } };
        try { var u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.onend = fin; u.onerror = fin; window.speechSynthesis.speak(u); } catch (_e) { fin(); }
        setTimeout(fin, ms + 1500);
      });
    }
    return wait(ms);
  }

  // Meaning pictures for this week's words (pictures carry meaning, never letters). Unknown words get a neutral picture.
  var PICTURES = {
    alarm: ["⏰🔔", "🚨😲"], charge: ["🔋⚡", "🐂💨"], starving: ["🍽️😫", "🐻🍯"], forgot: ["🤔🎒", "🙈📝"],
    "import": ["🚢📦", "🌍🏠"], ornament: ["🎄✨", "🔴🌟"], forward: ["⏩🏃", "👉🚗"], carnivore: ["🦁🍖", "🦖🦷"],
    carton: ["🥛📦", "🥚📦"], dormant: ["🌋😴", "🌱❄️"], march: ["🥁🚶", "📅🌷"], pardon: ["👑🐲", "🙇☂️"],
  };
  function pictures(word) { return PICTURES[String(word).toLowerCase()] || ["⭐❓", "✨❓"]; }
  /** Words for a spelling game: each item's answer, with its sentence when the prompt is one. */
  function spellingWords() {
    return items.map(function (it) {
      var word = it.answer.toLowerCase();
      var sentence = it.prompt && norm(it.prompt) !== norm(word) ? it.prompt : "";
      return { itemId: it.itemId, word: word, sentence: sentence, pics: pictures(word) };
    });
  }

  // ---------------- evidence bridge ----------------
  var base = window.SunnyEvidence || {};
  var firstTries = Object.create(null), attempts = Object.create(null), unmatchedLogged = Object.create(null);
  var completionSent = false, startedAt = Date.now();

  function unmatched(target, eventName) {
    var key = eventName + "|" + String(target);
    if (unmatchedLogged[key]) return;
    unmatchedLogged[key] = true;
    log("evidence", "[unmatched] target=" + String(target) + " event=" + eventName);
  }
  function annotate(payload, item) {
    var p = Object.assign({ activityId: activityId }, payload || {});
    if (item) return Object.assign(p, { target: item.itemId, itemId: item.itemId, gameTarget: payload && payload.target, evidenceRole: "homework" });
    if (payload && payload.target != null) return Object.assign(p, { evidenceRole: "play", homeworkEvidence: false });
    return p;   // start/finish events carry no target
  }
  function pass(name, payload, item) {
    if (typeof base[name] === "function") base[name](annotate(payload, item));
  }
  function attemptedValueOf(p) {
    var a = (p && p.childAction) || {};
    var v = a.typed != null ? a.typed : a.value != null ? a.value : a.chose != null ? a.chose : a.answer != null ? a.answer : p && p.attemptedValue;
    return v == null ? "" : String(v);
  }
  function openItemFor(item, progress) {
    if (subject === "spelling") {
      // Same bookkeeping as window.openSpellingItem, without asking the companion to say the word: the game says it.
      var screen = (document.body && document.body.innerText) || "";
      var escaped = item.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var shown = new RegExp("(^|[^\\p{L}])" + escaped + "($|[^\\p{L}])", "iu").test(screen);
      window.GameBridge.openingSpellingWord(item.answer);
      window.GameBridge.reportState(progress || "Spelling word ready.", { game: activityId, spellingItemOpened: true, currentWord: item.answer,
        answerVisibility: shown ? "visible" : "hidden", phase: "playing", targetMasked: !shown });
    } else {
      window.openItem(item.itemId, progress);
    }
  }

  function sendComplete(result) {
    if (completionSent) return;
    completionSent = true;
    var rows = items.filter(function (it) { return firstTries[it.itemId]; }).map(function (it) {
      var f = firstTries[it.itemId];
      return { target: it.itemId, correct: f.correct, attemptedValue: f.attemptedValue, responseTime_ms: f.ms, scaffoldLevel: f.hintLevel, attempts: attempts[it.itemId] || 1 };
    });
    var scored = rows.filter(function (r) { return typeof r.correct === "boolean"; });
    var accuracy = scored.length ? scored.filter(function (r) { return r.correct; }).length / scored.length : 0;
    log("complete", "[sent] game=" + activityId + " answered=" + rows.length + "/" + items.length + " accuracy=" + accuracy.toFixed(2));
    window.fireCompanionEvent("session_complete", { activityId: activityId });
    window.sendNodeComplete({ completed: true, ended: true, won: true, accuracy: accuracy, timeSpent_ms: Date.now() - startedAt,
      targetResults: rows, gameResult: result || {} });
  }

  window.SunnyEvidence = Object.assign({}, base, {
    activityStarted: function (p) {
      startedAt = Date.now();
      pass("activityStarted", p, null);
      window.reportStep("started", activityId);
    },
    targetPresented: function (p) {
      var item = items.length ? itemFor(p && p.target) : null;
      if (!item) { unmatched(p && p.target, "targetPresented"); pass("targetPresented", p, null); return; }
      openItemFor(item, "Item " + ((p && p.itemIndex != null ? p.itemIndex : 0) + 1) + " of " + items.length);
      pass("targetPresented", p, item);
    },
    attemptRecorded: function (p) {
      var item = items.length ? itemFor(p && p.target) : null;
      if (!item) { unmatched(p && p.target, "attemptRecorded"); pass("attemptRecorded", p, null); return; }
      var value = attemptedValueOf(p), r = (p && p.result) || {};
      var correct = typeof r.correct === "boolean" ? r.correct : undefined;
      attempts[item.itemId] = (attempts[item.itemId] || 0) + 1;
      if (!firstTries[item.itemId]) firstTries[item.itemId] = { attemptedValue: value, correct: correct, ms: Number(r.ms) || undefined, hintLevel: Number(r.hintLevel) || 0 };
      pass("attemptRecorded", p, item);
      window.fireAttemptEvent({ target: item.itemId, attemptedValue: value, domain: subject, correct: correct, hintLevel: Number(r.hintLevel) || 0,
        responseTime_ms: Number(r.ms) || undefined, attemptNumber: p && p.attemptNumber, companionHelp: r.companionHelp === true, source: activityId });
    },
    targetCompleted: function (p) {
      var item = items.length ? itemFor(p && p.target) : null;
      if (!item) unmatched(p && p.target, "targetCompleted");
      pass("targetCompleted", p, item);
    },
    audioRequested: function (p) { var item = items.length ? itemFor(p && p.target) : null; pass("audioRequested", p, item); },
    audioPlayed: function (p) { var item = items.length ? itemFor(p && p.target) : null; pass("audioPlayed", p, item); },
    activityCompleted: function (p) {
      pass("activityCompleted", p, null);
      // Only a stop with injected items finishes the board stop; a free-play run with built-in content is play.
      if (items.length) sendComplete(p && p.result);
      else log("complete", "[play-only] game=" + activityId + " no injected items, board not advanced");
    },
  });

  window.SunnyLibrary = {
    config: config, items: items, subject: subject, childId: childId, activityId: activityId,
    hasItems: items.length > 0, itemFor: itemFor, companion: companion, loadCompanion: loadCompanion,
    speak: speak, pictures: pictures, spellingWords: spellingWords,
  };
})();
