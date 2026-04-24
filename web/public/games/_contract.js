/**
 * Standard iframe game ↔ parent (adventure map / voice canvas) contract.
 * Load: <script src="_contract.js"></script>
 *
 * ?preview=free|true — dry run: no postMessage for node_complete / game_complete (banner only);
 *   companion_event and game_state_update suppressed.
 * ?preview=go-live — walkthrough: posts behave like production.
 */
window.GameBridge = (function () {
  "use strict";

  var VERSION = "1.0";

  var GAME_PARAMS = (function () {
    var p = new URLSearchParams(location.search);
    var rawWords = p.get("words");
    var pv = (p.get("preview") || "").toLowerCase();
    var previewDryRun = pv === "true" || pv === "free";
    var previewGoLive = pv === "go-live";
    return {
      words: rawWords
        ? rawWords.split(",").map(function (w) {
            return w.trim();
          }).filter(Boolean)
        : [],
      childId: p.get("childId") || "unknown",
      difficulty: parseInt(p.get("difficulty") || "2", 10) || 2,
      nodeId: p.get("nodeId") || "unknown",
      sessionId: p.get("sessionId") || null,
      previewDryRun: previewDryRun,
      previewGoLive: previewGoLive,
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

  function post(type, payload) {
    if (GAME_PARAMS.previewDryRun) {
      if (type === "companion_event" || type === "game_state_update") {
        return;
      }
    }
    window.parent.postMessage(
      { type: type, payload: payload || {}, version: VERSION },
      "*",
    );
  }

  function listen(onStart) {
    window.addEventListener("message", function (e) {
      var msg = e.data;
      if (!msg || msg.type !== "start") return;
      onStart(msg);
    });
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
      });
      post("game_complete", merged);
      window.parent.postMessage(
        Object.assign({ type: "node_complete", version: VERSION }, merged),
        "*",
      );
    },

    reportState: function (progress, extras) {
      if (!progress || typeof progress !== "string") return;
      post(
        "game_state_update",
        Object.assign(
          {
            game: document.title,
            progress: progress.trim(),
            childId: GAME_PARAMS.childId,
          },
          extras || {},
        ),
      );
    },

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
          },
          payload || {},
        ),
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
