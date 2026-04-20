/**
 * Standard iframe game ↔ parent (adventure map) contract.
 * Load from HTML: <script src="_contract.js"></script> (same directory)
 * or <script src="../games/_contract.js"></script> from a subfolder.
 *
 * ?preview=true — show completion in-page only; no postMessage to parent (dry run).
 */
(function () {
  "use strict";

  var GAME_PARAMS = (function () {
    var p = new URLSearchParams(location.search);
    var rawWords = p.get("words");
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
      preview: p.get("preview") === "true",
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
    if (GAME_PARAMS.preview) {
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

  window.GAME_PARAMS = GAME_PARAMS;
  window.sendNodeComplete = sendNodeComplete;
  window.showPreviewBanner = showPreviewBanner;
})();
