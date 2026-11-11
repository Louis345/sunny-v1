/** When this game opened: the fallback for how long it was played. */
var CONTRACT_LOADED_AT = Date.now();
/**
 * Standard iframe game ↔ parent (adventure map / voice canvas) contract.
 * Load: <script src="/games/_contract.js"></script>
 *
 * ?preview=free|true — dry run: no postMessage for node_complete / game_complete (banner only);
 *   companion_event, game_state_update, and currency_award suppressed.
 * ?preview=go-live — walkthrough: posts behave like production.
 */
window.GameBridge = (function () {
  "use strict";

  var VERSION = "1.0";

  var GAME_PARAMS = (function () {
    var p = new URLSearchParams(location.search);
    var rawWords = p.get("words");
    var pv = (p.get("preview") || "").toLowerCase();
    var previewStorybook = pv === "storybook";
    var previewDryRun = pv === "true" || pv === "free" || previewStorybook;
    var previewGoLive = pv === "go-live";
    function csvList(value) {
      return value
        ? value.split(",").map(function (w) {
            return w.trim();
          }).filter(Boolean)
        : [];
    }
    return {
      words: csvList(rawWords),
      spellingItemBindings: JSON.parse(p.get("spellingItemBindings") || "[]"),
      // Any subject's items, [{itemId, display}]: the game shows display, Sunny scores the answer.
      itemBindings: JSON.parse(p.get("itemBindings") || "[]"),
      knownWords: csvList(p.get("knownWords")),
      weakWords: csvList(p.get("weakWords")),
      childId: p.get("childId") || "unknown",
      childName: p.get("childName") || "",
      companion: p.get("companion") || "",
      companionName: p.get("companionName") || "",
      difficulty: parseInt(p.get("difficulty") || "2", 10) || 2,
      fixtureState: p.get("fixtureState") || "",
      nodeId: p.get("nodeId") || "unknown",
      launchToken: p.get("launchToken") || undefined,
      planId: p.get("planId") || "",
      targetLane: p.get("targetLane") || "",
      sessionId: p.get("sessionId") || null,
      activityIntentId: p.get("activityIntentId") || "",
      activityIntentPurpose: p.get("activityIntentPurpose") || "",
      targetSelector: p.get("targetSelector") || "",
      targetSelectorId: p.get("targetSelectorId") || "",
      config: p.get("config") || null,
      preview: pv,
      chrome: p.get("chrome") || "",
      visualLearnerFlowMode: p.get("visualLearnerFlow") || "",
      previewDryRun: previewDryRun,
      previewStorybook: previewStorybook,
      previewGoLive: previewGoLive,
      isQuest: p.get("isQuest") === "true",
      traceId: [
        p.get("sessionId") || "session",
        p.get("nodeId") || "node",
        Math.random().toString(36).slice(2),
      ].join(":"),
      dyslexiaMode: p.get("dyslexiaMode") === "true",
      attentionConfig: (function () {
        var raw = p.get("attentionConfig");
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (_err) {
          return null;
        }
      })(),
      companionCurrency: (function () {
        var raw = p.get("companionCurrency");
        var n =
          raw != null && raw !== ""
            ? parseInt(raw, 10)
            : 0;
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.floor(n));
      })(),
    };
  })();

  var capturedSpellingTargets = Object.create(null);
  // Code keeps her first answer per item and the screen when it opened; a game cannot rewrite either.
  var firstAnswers = Object.create(null);
  // Every try per item, in order: a retry is her own answer too (2026-11-10: three fast "34"s were folded into one).
  var allAnswers = Object.create(null);
  var MAX_TRIES_PER_ITEM = 20;
  var screenAtOpen = Object.create(null);
  // The problem open now: every state report carries it, so a step or heartbeat never hides which problem and its
  // numbers are on screen (2026-11-10: reportStep replaced it with "Type where the kappa lands next").
  var openItemState = null;
  // A stop with bound problems finishes once each has a first answer, whatever the game shows next (a made-up
  // rematch or bonus round is free extra play; BUGS.md 2026-11-08, Reina's Boss Battle). Sent once.
  var itemCompletionSent = false;

  // Code, not the game, hands over every try it saw for each reported item.
  function withTries(rows) {
    return rows.map(function (row) {
      var tries = row && allAnswers[row.target];
      return tries && tries.length ? Object.assign({}, row, { tries: tries.slice() }) : row;
    });
  }

  // Bound problems in binding order: her first answer, the screen when it opened, and every try.
  function boundItemResults() {
    return withTries(GAME_PARAMS.itemBindings.map(function (item) {
      var first = firstAnswers[item.itemId];
      return Object.assign({ target: item.itemId, attemptedValue: first ? first.attemptedValue : "" },
        first && typeof first.screenAtOpen === "string" ? { screenAtOpen: first.screenAtOpen } : {});
    }));
  }

  function itemBinding(target) {
    if (typeof target !== "string") return null;
    var wanted = target.normalize("NFC").trim().toLowerCase();
    var matches = GAME_PARAMS.itemBindings.filter(function (item) {
      return item.itemId === target || String(item.display).normalize("NFC").trim().toLowerCase() === wanted;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function bindItemTarget(row) {
    var binding = row && itemBinding(row.target);
    return binding ? Object.assign({}, row, { target: binding.itemId }) : row;
  }

  function currentScreenText() {
    return String((document.body && document.body.innerText) || "").slice(0, 500);
  }

  function bindSpellingTarget(row) {
    var bindings = GAME_PARAMS.spellingItemBindings;
    if (!bindings.length || !row || typeof row.target !== "string") return row;
    var matches = bindings.filter(function (item) { return item.itemId === row.target || item.word.normalize("NFC").toLowerCase() === row.target.normalize("NFC").toLowerCase(); });
    if (matches.length !== 1) return row; // Unknown/ambiguous identities remain rejectable by the server.
    return Object.assign({}, row, { target: matches[0].itemId });
  }

  function showPreviewBanner(payload) {
    payload = payload || {};
    var acc = payload.accuracy != null ? payload.accuracy : 0;
    var xp = payload.xpEarned != null ? payload.xpEarned : 0;
    var flagged = payload.flaggedWords;
    var flaggedStr = flagged && flagged.length ? flagged.join(",") : "";
    var div = document.createElement("div");
    div.style.cssText =
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
      "background:rgba(0,0,0,0.85);color:#4ade80;padding:12px 24px;" +
      "border-radius:12px;font-family:monospace;font-size:13px;" +
      "z-index:99999;pointer-events:none;border:1px solid #4ade80;";
    div.textContent =
      "PREVIEW — accuracy:" +
      Math.round(acc * 100) +
      "% xp:" +
      xp +
      " flagged:[" +
      flaggedStr +
      "]";
    document.body.appendChild(div);
  }

  function logContract(action, result) {
    try {
      if (window.SUNNY_CONTRACT_LOGS === false) return;
      if (typeof console === "undefined" || typeof console.log !== "function") return;
      console.log("🎮 [game-contract] [" + action + "] " + result);
    } catch (_err) {
      // Contract logging should never break the child activity.
    }
  }

  function postSummary(type, payload) {
    var p = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
    return [
      "type=" + type,
      "child=" + (p.childId || GAME_PARAMS.childId),
      "node=" + (p.nodeId || GAME_PARAMS.nodeId),
    ].join(" ");
  }

  function post(type, payload) {
    if (GAME_PARAMS.previewDryRun) {
      if (
        type === "companion_event" ||
        type === "game_state_update" ||
        type === "currency_award"
      ) {
        logContract("suppressed", postSummary(type, payload));
        return;
      }
    }
    logContract("post", postSummary(type, payload));
    window.parent.postMessage(
      { type: type, payload: payload || {}, version: VERSION },
      "*",
    );
  }

  function compactEvidencePayload(eventName, payload) {
    var p = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
    var activityId = String(p.activityId || p.game || document.title || "activity").trim();
    if (!activityId) return null;
    var event = Object.assign({}, p, {
      type: "activity_evidence",
      eventName: eventName,
      ts: new Date().toISOString(),
      activityId: activityId,
      childId: String(p.childId || GAME_PARAMS.childId || "unknown"),
      sessionId: p.sessionId || GAME_PARAMS.sessionId,
      nodeId: p.nodeId || GAME_PARAMS.nodeId,
      planId: p.planId || GAME_PARAMS.planId,
      targetLane: p.targetLane || GAME_PARAMS.targetLane,
      activityIntentId: p.activityIntentId || GAME_PARAMS.activityIntentId,
      targetSelectorId: p.targetSelectorId || GAME_PARAMS.targetSelectorId,
      traceId: p.traceId || GAME_PARAMS.traceId,
    });
    Object.keys(event).forEach(function (key) {
      if (event[key] === undefined || event[key] === "") delete event[key];
    });
    return event;
  }

  function emitEvidence(eventName, payload) {
    var event = compactEvidencePayload(eventName, payload);
    if (!event) return;
    post("activity_evidence", event);
  }

  var SunnyEvidence = {
    activityStarted: function (payload) {
      emitEvidence("activity_started", payload);
    },
    targetPresented: function (payload) {
      emitEvidence("target_presented", payload);
    },
    audioRequested: function (payload) {
      emitEvidence("audio_requested", payload);
    },
    audioPlayed: function (payload) {
      emitEvidence("audio_played", payload);
    },
    attemptRecorded: function (payload) {
      emitEvidence("attempt_recorded", payload);
    },
    targetCompleted: function (payload) {
      emitEvidence("target_completed", payload);
    },
    activityCompleted: function (payload) {
      emitEvidence("activity_completed", payload);
    },
  };
  window.SunnyEvidence = SunnyEvidence;

  function listen(onStart) {
    window.addEventListener("message", function (e) {
      var msg = e.data;
      if (!msg || msg.type !== "start") return;
      onStart(msg);
    });
  }

  function createAttentionFeedback(options) {
    options = options || {};
    var feedbackPolicy = options.feedbackPolicy || {};
    var audioProfile = options.audioProfile || {};
    var ctx = null;
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    function audioEnabled() {
      return !!AudioContextCtor && audioProfile.baselineAudio !== "off";
    }

    function allowed(eventName) {
      if (eventName === "practice_correct" || eventName === "practice_miss") {
        return feedbackPolicy.practice === "corrective_audio_visual";
      }
      if (eventName === "measured_response" || eventName === "measured_advance") {
        return feedbackPolicy.measured === "neutral_audio_only";
      }
      if (eventName === "results_complete") {
        return feedbackPolicy.results === "reward_summary";
      }
      return false;
    }

    function ensureContext() {
      if (!audioEnabled()) return null;
      if (!ctx) ctx = new AudioContextCtor();
      if (ctx.state === "suspended") {
        ctx.resume().catch(function (err) {
          console.warn("🎮 [attention-audio] resume failed", err);
        });
      }
      return ctx;
    }

    function tone(frequency, startOffset, duration, gainValue) {
      var c = ensureContext();
      if (!c) return;
      var now = c.currentTime + startOffset;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    function play(eventName) {
      if (!allowed(eventName)) return;
      try {
        if (eventName === "practice_correct") {
          tone(660, 0, 0.08, 0.045);
          tone(880, 0.07, 0.1, 0.035);
        } else if (eventName === "practice_miss") {
          tone(220, 0, 0.09, 0.025);
          tone(185, 0.08, 0.12, 0.02);
        } else if (eventName === "measured_response") {
          tone(420, 0, 0.035, 0.02);
        } else if (eventName === "measured_advance") {
          tone(300, 0, 0.025, 0.012);
        } else if (eventName === "results_complete") {
          tone(523, 0, 0.08, 0.035);
          tone(659, 0.08, 0.09, 0.035);
          tone(784, 0.17, 0.12, 0.03);
        }
      } catch (err) {
        console.warn("🎮 [attention-audio] play failed", err);
      }
    }

    return { play: play };
  }

  window.GAME_PARAMS = GAME_PARAMS;
  window.showPreviewBanner = showPreviewBanner;

  document.addEventListener("DOMContentLoaded", function () {
    if (window.parent && window.parent !== window) {
      post("ready", {});
    }
  });

  return {
    init: function (onStart) {
      var params = window.GAME_PARAMS || null;
      if (params) {
        onStart(params);
      } else {
        listen(function (msg) {
          onStart(msg);
        });
      }
    },

    complete: function (result) {
      var r = result || {};
      if (GAME_PARAMS.previewDryRun) {
        console.log("[PREVIEW] complete suppressed:", r);
        showPreviewBanner(r);
        return;
      }
      if (GAME_PARAMS.itemBindings.length) {
        if (itemCompletionSent) return;
        itemCompletionSent = true;
      }
      // Letter-selection/aggregate results cannot stand in for typed word answers.
      if (GAME_PARAMS.launchToken && GAME_PARAMS.spellingItemBindings.length &&
          GAME_PARAMS.spellingItemBindings.some(function (item) { return !capturedSpellingTargets[item.itemId]; })) {
        window.fireAttemptEvent({ domain: "spelling", evidenceLimitation: "per_word_results_unavailable",
          attemptId: "completion-limitation:" + GAME_PARAMS.launchToken,
          rawChoice: null, aggregateAccuracy: typeof r.accuracy === "number" ? r.accuracy : null });
      }
      // A built game that reports no time gets the time it was open (2026-11-10: "0 ms" was saved as fact).
      var spent = Number(r.timeSpent_ms) > 0 ? Number(r.timeSpent_ms) : Date.now() - CONTRACT_LOADED_AT;
      var merged = Object.assign({}, r, {
        timeSpent_ms: spent,
        nodeId: GAME_PARAMS.nodeId,
        childId: GAME_PARAMS.childId,
        sessionId: GAME_PARAMS.sessionId,
        traceId: GAME_PARAMS.traceId,
        activityIntentId: GAME_PARAMS.activityIntentId,
        targetSelectorId: GAME_PARAMS.targetSelectorId,
      });
      if (Array.isArray(r.targetResults)) merged.targetResults = withTries(r.targetResults.map(bindSpellingTarget));
      if (GAME_PARAMS.itemBindings.length) merged.targetResults = boundItemResults();
      post("game_complete", merged);
      logContract("post", postSummary("node_complete", merged));
      window.parent.postMessage(
        Object.assign({ type: "node_complete", version: VERSION }, merged),
        "*",
      );
    },

    /**
     * Report current game state to the companion.
     * Call on EVERY meaningful interaction — not just round end.
     *
     * @param progress  Human-readable string describing what just happened
     * @param extras    Structured fields for buildGameContextSummary:
     *   {
     *     phase:       string  — "idle"|"playing"|"feedback"|"complete"
     *     currentWord: string  — the target word/problem
     *     itemIndex:   number  — current item (0-based)
     *     totalItems:  number  — total items in session
     *     correct:     boolean — was last action correct?
     *     score:       number  — current score/coins
     *     boardState:  string  — "I _ V E N _ O R" revealed tiles
     *   }
     *
     * Minimum required: progress string.
     * Structured extras give the companion richer context without screenshots.
     */
    openItem: function (itemId, progress) {
      screenAtOpen[itemId] = currentScreenText();
      var openBinding = itemBinding(itemId);
      openItemState = { itemId: itemId, itemPrompt: openBinding ? String(openBinding.display) : undefined };
      this.reportState(typeof progress === "string" && progress.trim() ? progress : "Item ready.", {
        game: "generated-game",
        itemOpened: true,
        itemId: itemId,
        phase: "playing",
      });
    },

    reportState: function (progress, extras) {
      if (!progress || typeof progress !== "string") return;
      if (extras && extras.spellingItemOpened === true && GAME_PARAMS.launchToken) {
        var bound = bindSpellingTarget({ target: extras.currentWord });
        if (GAME_PARAMS.spellingItemBindings.some(function (item) { return item.itemId === bound.target; })) {
          extras = Object.assign({}, extras, { itemId: bound.target, practiceCapture: true });
        }
      }
      if (openItemState && !itemCompletionSent && !(extras && extras.itemId && extras.itemId !== openItemState.itemId)) {
        extras = Object.assign({ itemId: openItemState.itemId }, openItemState.itemPrompt ? { itemPrompt: openItemState.itemPrompt } : {}, extras || {});
      }
      post(
        "game_state_update",
        Object.assign(
          {
            game: document.title,
            progress: progress.trim(),
            childId: GAME_PARAMS.childId,
            nodeId: GAME_PARAMS.nodeId,
            launchToken: GAME_PARAMS.launchToken,
            sessionId: GAME_PARAMS.sessionId,
            traceId: GAME_PARAMS.traceId,
            activityIntentId: GAME_PARAMS.activityIntentId,
            targetSelectorId: GAME_PARAMS.targetSelectorId,
            activityIntentPurpose: GAME_PARAMS.activityIntentPurpose,
          },
          extras || {},
        ),
      );
    },

    /**
     * Report a meaningful game action plus the authoritative state snapshot.
     * Use this from click/key handlers and after state transitions.
     *
     * @param action    Stable machine name, e.g. "letter_selected" or "wheel_landed"
     * @param progress  Human-readable one-line description
     * @param snapshot  Structured current state from the game, e.g. getSnapshot()
     */
    reportAction: function (action, progress, snapshot) {
      if (!action || typeof action !== "string") return;
      var state =
        snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
          ? snapshot
          : {};
      this.reportState(
        typeof progress === "string" && progress.trim()
          ? progress
          : action,
        Object.assign({}, state, {
          action: action,
          lastAction: state.lastAction || action,
        }),
      );
    },

    /**
     * Report the current learning context for the outer companion layer.
     * This is intentionally non-speaking: it gives VRM / future helper agents
     * the child's current visual learner phase without forcing a response.
     *
     * @param anchor Structured visual learner context, e.g.
     *   {
     *     artifactId, concept, learningGoal, phase, progress,
     *     question, selectedAnswer, correct, allowedRole
     *   }
     */
    reportCompanionAnchor: function (anchor) {
      if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return;
      post(
        "companion_anchor",
        Object.assign(
          {
            source: "visual_learner_artifact",
            childId: GAME_PARAMS.childId,
            childName: GAME_PARAMS.childName,
            companion: GAME_PARAMS.companion,
            companionName: GAME_PARAMS.companionName,
            nodeId: GAME_PARAMS.nodeId,
            sessionId: GAME_PARAMS.sessionId,
            activityIntentId: GAME_PARAMS.activityIntentId,
            targetSelectorId: GAME_PARAMS.targetSelectorId,
            timestamp: Date.now(),
          },
          anchor,
        ),
      );
    },

    /**
     * Start a heartbeat that reports game state every 5 seconds.
     * Call this after game starts. Clear it when game ends.
     *
     * @param getStateString  Function that returns current state description
     * @param getExtras       Optional function that returns structured extras object
     * @returns intervalId    Pass to clearInterval on game end
     *
     * @example
     *   var hb = GameBridge.startHeartbeat(
     *     function() { return 'Spelling "' + currentWord + '"'; },
     *     function() { return { phase: "playing", currentWord: currentWord }; }
     *   );
     *   // On game end: clearInterval(hb);
     */
    startHeartbeat: function (getStateString, getExtras) {
      var self = this;
      return setInterval(function () {
        if (self && typeof self.reportState === "function") {
          self.reportState(
            getStateString(),
            getExtras ? getExtras() : {},
          );
        }
      }, 5000);
    },

    /**
     * Report currency earned or spent. Parent forwards to the server; balance lives in learning_profile only.
     * @param {number} amount — positive = earn, negative = spend
     * @param {string} reason — label for logging (e.g. wheel_of_fortune_win)
     */
    awardCurrency: function (amount, reason) {
      var n = Number(amount);
      if (!Number.isFinite(n)) return;
      post("currency_award", { amount: n, reason: String(reason || "") });
    },

    createAttentionFeedback: createAttentionFeedback,

    fireEvent: function (trigger, payload) {
      if (!trigger) return;
      if (GAME_PARAMS.previewDryRun) {
        return;
      }
      post(
        "companion_event",
        Object.assign(
          {
            trigger: String(trigger),
            timestamp: Date.now(),
            childId: GAME_PARAMS.childId,
            nodeId: GAME_PARAMS.nodeId,
            sessionId: GAME_PARAMS.sessionId,
            traceId: GAME_PARAMS.traceId,
            activityIntentId: GAME_PARAMS.activityIntentId,
            targetSelectorId: GAME_PARAMS.targetSelectorId,
          },
          payload || {},
        ),
      );
    },

    /**
     * Report one assessable learning interaction.
     * This is separate from companion events: companion_event drives feedback;
     * attempt_event drives SM-2, diagnostics, and future assignment selection.
     */
    reportAttempt: function (attempt) {
      if (GAME_PARAMS.previewDryRun) return;
      if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) {
        return;
      }
      var payload = Object.assign({}, bindItemTarget(bindSpellingTarget(attempt)));
      if (itemBinding(payload.target) && typeof payload.attemptedValue === "string" && !firstAnswers[payload.target]) {
        firstAnswers[payload.target] = { attemptedValue: payload.attemptedValue, screenAtOpen: screenAtOpen[payload.target] };
      }
      var lateTry = false;
      if (typeof payload.target === "string" && typeof payload.attemptedValue === "string") {
        var tries = allAnswers[payload.target] || (allAnswers[payload.target] = []);
        if (tries.length < MAX_TRIES_PER_ITEM) {
          tries.push({ attemptedValue: payload.attemptedValue, at: Date.now() });
          lateTry = itemCompletionSent && Boolean(itemBinding(payload.target));
        }
      }
      // A try after the stop finished (BUGS.md 2026-11-10 evening): a follow-up record with every try so far; Sunny
      // saves only the tries it does not have yet. Bounded by MAX_TRIES_PER_ITEM per problem.
      if (lateTry) {
        logContract("items", "try after the stop finished; sending a follow-up record");
        post("late_tries", { nodeId: GAME_PARAMS.nodeId, sessionId: GAME_PARAMS.sessionId, launchToken: GAME_PARAMS.launchToken, targetResults: boundItemResults() });
      }
      if (payload.domain === "spelling" && typeof payload.attemptedValue === "string") capturedSpellingTargets[payload.target] = true;
      if (payload.word == null && payload.target != null) {
        payload.word = String(payload.target);
      }
      if (payload.target == null && payload.word != null) {
        payload.target = String(payload.word);
      }
      var timestamp = Date.now();
      var attemptId =
        GAME_PARAMS.sessionId +
        ":" +
        GAME_PARAMS.nodeId +
        ":" +
        timestamp +
        ":" +
        Math.random().toString(36).slice(2);
      post(
        "attempt_event",
        Object.assign(payload, {
          attemptId: typeof payload.attemptId === "string" ? payload.attemptId : attemptId,
          childId: GAME_PARAMS.childId,
          nodeId: GAME_PARAMS.nodeId,
          launchToken: GAME_PARAMS.launchToken,
          sessionId: GAME_PARAMS.sessionId,
          traceId: GAME_PARAMS.traceId,
          activityIntentId: GAME_PARAMS.activityIntentId,
          targetSelectorId: GAME_PARAMS.targetSelectorId,
          timestamp: timestamp,
        }),
      );
      if (GAME_PARAMS.itemBindings.length && !itemCompletionSent && GAME_PARAMS.itemBindings.every(function (item) { return firstAnswers[item.itemId]; })) {
        logContract("items", "every problem answered; finishing the stop");
        this.complete({ completed: true, ended: true });
      }
    },
  };
})();

window.sendNodeComplete = function (result) {
  window.GameBridge.complete(result);
};

window.fireCompanionEvent = function (trigger, payload) {
  window.GameBridge.fireEvent(trigger, payload);
};

window.fireAttemptEvent = function (attempt) {
  window.GameBridge.reportAttempt(attempt);
};

/**
 * Generated games open each spelling word here, then report the child's try with fireAttemptEvent.
 * The contract owns the bookkeeping: it binds the word to its frozen item, checks for itself whether
 * the word is written on the screen (a shown word is assisted, whatever the game says), and asks Elli
 * to say the word. Words drawn only on a canvas cannot be seen by this check.
 */
window.openSpellingItem = function (word, progress) {
  if (typeof word !== "string" || !word.trim()) return;
  var screen = (document.body && document.body.innerText) || "";
  var escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var shown = new RegExp("(^|[^\\p{L}])" + escaped + "($|[^\\p{L}])", "iu").test(screen);
  window.GameBridge.reportState(typeof progress === "string" && progress.trim() ? progress : "Spelling word ready.", {
    game: "generated-game",
    spellingItemOpened: true,
    currentWord: word,
    answerVisibility: shown ? "visible" : "hidden",
    phase: "playing",
    targetMasked: !shown,
  });
  window.parent.postMessage({ type: "narration_request", activityId: "generated-game", nodeId: window.GAME_PARAMS.nodeId, word: word, reason: "target_word" }, "*");
};

/**
 * Any subject's built game opens each item here before she answers it. The contract owns the bookkeeping:
 * it binds the item, keeps the screen as it was when the item opened, and keeps her first answer.
 */
window.openItem = function (itemIdOrDisplay, progress) {
  var params = window.GAME_PARAMS || {};
  var bindings = params.itemBindings || [];
  var wanted = String(itemIdOrDisplay == null ? "" : itemIdOrDisplay).normalize("NFC").trim().toLowerCase();
  var matches = bindings.filter(function (item) {
    return item.itemId === itemIdOrDisplay || String(item.display).normalize("NFC").trim().toLowerCase() === wanted;
  });
  if (matches.length !== 1) return;
  window.GameBridge.openItem(matches[0].itemId, progress);
};

/**
 * Built games report each step she is on and its on-screen instruction (BUGS.md 2026-11-09: a hidden keyboard behind
 * "Tap a stone" cost Ila 13 minutes while her companion could not see the step). Facts only: the companion and the
 * session retro see the step and when she reached it; nothing here decides what to say or when.
 */
window.reportStep = function (step, instruction) {
  if (typeof step !== "string" || !step.trim()) return;
  var text = typeof instruction === "string" ? instruction.trim() : "";
  window.GameBridge.reportState(text || step, { gameStep: step, currentChallenge: text || step, stepStartedAt: Date.now() });
};

window.SunnyActivity = {
  params: window.GAME_PARAMS,
  snapshot: function (snapshot) {
    var state = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot
      : {};
    window.GameBridge.reportState(
      typeof state.progress === "string" && state.progress.trim()
        ? state.progress
        : "activity snapshot",
      state,
    );
  },
  attempt: function (attempt) {
    window.GameBridge.reportAttempt(attempt);
  },
  complete: function (result) {
    window.GameBridge.complete(result);
  },
  helpRequest: function (payload) {
    window.GameBridge.fireEvent(
      "help_request",
      Object.assign(
        {
          activityIntentId: window.GAME_PARAMS.activityIntentId,
          targetSelectorId: window.GAME_PARAMS.targetSelectorId,
        },
        payload || {},
      ),
    );
  },
  productIssue: function (payload) {
    window.GameBridge.fireEvent(
      "product_issue",
      Object.assign(
        {
          activityIntentId: window.GAME_PARAMS.activityIntentId,
          targetSelectorId: window.GAME_PARAMS.targetSelectorId,
        },
        payload || {},
      ),
    );
  },
};
