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
      knownWords: csvList(p.get("knownWords")),
      weakWords: csvList(p.get("weakWords")),
      childId: p.get("childId") || "unknown",
      childName: p.get("childName") || "",
      companion: p.get("companion") || "",
      companionName: p.get("companionName") || "",
      difficulty: parseInt(p.get("difficulty") || "2", 10) || 2,
      fixtureState: p.get("fixtureState") || "",
      nodeId: p.get("nodeId") || "unknown",
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
      var merged = Object.assign({}, r, {
        nodeId: GAME_PARAMS.nodeId,
        childId: GAME_PARAMS.childId,
        sessionId: GAME_PARAMS.sessionId,
        traceId: GAME_PARAMS.traceId,
        activityIntentId: GAME_PARAMS.activityIntentId,
        targetSelectorId: GAME_PARAMS.targetSelectorId,
      });
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
    reportState: function (progress, extras) {
      if (!progress || typeof progress !== "string") return;
      post(
        "game_state_update",
        Object.assign(
          {
            game: document.title,
            progress: progress.trim(),
            childId: GAME_PARAMS.childId,
            nodeId: GAME_PARAMS.nodeId,
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
      var payload = Object.assign({}, attempt);
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
          attemptId: attemptId,
          childId: GAME_PARAMS.childId,
          nodeId: GAME_PARAMS.nodeId,
          sessionId: GAME_PARAMS.sessionId,
          traceId: GAME_PARAMS.traceId,
          activityIntentId: GAME_PARAMS.activityIntentId,
          targetSelectorId: GAME_PARAMS.targetSelectorId,
          timestamp: timestamp,
        }),
      );
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
