/**
 * Standard iframe game ↔ parent (adventure map) contract.
 * Load from HTML: <script src="_contract.js"></script> (same directory)
 * or <script src="../games/_contract.js"></script> from a subfolder.
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
    };
  })();

  function sendNodeComplete(payload) {
    payload = payload || {};
    var accuracy = payload.accuracy;
    var flaggedWords = payload.flaggedWords != null ? payload.flaggedWords : [];
    var xpEarned = payload.xpEarned != null ? payload.xpEarned : 0;
    var timeSpent_ms = payload.timeSpent_ms != null ? payload.timeSpent_ms : 0;
    var completed = payload.completed != null ? payload.completed : true;
    if (!window.parent) return;
    window.parent.postMessage(
      {
        type: "node_complete",
        nodeId: GAME_PARAMS.nodeId,
        childId: GAME_PARAMS.childId,
        accuracy: accuracy,
        flaggedWords: flaggedWords,
        xpEarned: xpEarned,
        timeSpent_ms: timeSpent_ms,
        completed: completed,
      },
      "*",
    );
  }

  window.GAME_PARAMS = GAME_PARAMS;
  window.sendNodeComplete = sendNodeComplete;
})();
