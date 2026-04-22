/**
 * Standard iframe game ↔ parent (adventure map) contract.
 * Load from HTML: <script src="_contract.js"></script> (same directory)
 * or <script src="../games/_contract.js"></script> from a subfolder.
 *
 * ?preview=free|true — dry run: no postMessage to parent for node_complete (banner only).
 * ?preview=go-live — parent walkthrough: node_complete posts to parent; companion events fire.
 */
(function () {
  "use strict";

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
    var flaggedStr =
      flagged && flagged.length ? flagged.join(",") : "";
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

  function sendNodeComplete(payload) {
    payload = payload || {};
    if (GAME_PARAMS.previewDryRun) {
      console.log("[PREVIEW] node_complete suppressed:", payload);
      showPreviewBanner(payload);
      return;
    }
    if (!window.parent) return;
    var out = Object.assign({}, payload, {
      type: "node_complete",
      nodeId: GAME_PARAMS.nodeId,
      childId: GAME_PARAMS.childId,
    });
    window.parent.postMessage(out, "*");
  }

  /**
   * Notify parent (adventure map) for companion face / reactions.
   * @param {string} trigger — e.g. correct_answer, wrong_answer, idle_too_long
   */
  function fireCompanionEvent(trigger, payload) {
    payload = payload || {};
    if (GAME_PARAMS.previewDryRun) {
      return;
    }
    if (!window.parent) return;
    window.parent.postMessage(
      {
        type: "companion_event",
        payload: Object.assign({}, payload, {
          trigger: trigger,
          timestamp: Date.now(),
          childId: GAME_PARAMS.childId,
        }),
      },
      "*",
    );
  }

  // Signal to the adventure map that this game frame has loaded and is ready.
  // This allows the server to mark canvasReady=true for the current canvas revision.
  document.addEventListener("DOMContentLoaded", function () {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "ready" }, "*");
    }
  });

  window.GAME_PARAMS = GAME_PARAMS;
  window.sendNodeComplete = sendNodeComplete;
  window.showPreviewBanner = showPreviewBanner;
  window.fireCompanionEvent = fireCompanionEvent;
})();
