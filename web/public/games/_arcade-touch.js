/*
 * On-screen controls for Sunny's reward games (2026-11-10: a frog game did not move when Ila tapped it).
 * The kiosk is driven by taps and clicks, which reach a game as pointer events, never keys. Each button presses
 * and releases the game's own keyboard key, so every game keeps one input path. Include with:
 *   <script src="_arcade-touch.js" defer data-arcade-keys="left,right,up,down,fire"></script>
 */
(function () {
  var script = document.currentScript;
  var wanted = String((script && script.getAttribute("data-arcade-keys")) || "left,right,up,down,fire")
    .split(",").map(function (name) { return name.trim(); }).filter(Boolean);
  var KEYS = {
    left: { key: "ArrowLeft", code: "ArrowLeft", label: "◀" },
    right: { key: "ArrowRight", code: "ArrowRight", label: "▶" },
    up: { key: "ArrowUp", code: "ArrowUp", label: "▲" },
    down: { key: "ArrowDown", code: "ArrowDown", label: "▼" },
    fire: { key: " ", code: "Space", label: "FIRE" },
  };
  function press(type, spec) {
    document.dispatchEvent(new KeyboardEvent(type, { key: spec.key, code: spec.code, bubbles: true, cancelable: true }));
  }
  function mount() {
    var bar = document.createElement("div");
    bar.setAttribute("data-arcade-touch", "");
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:10px;display:flex;justify-content:space-between;align-items:flex-end;padding:0 12px;z-index:2147483000;pointer-events:none;";
    var pad = document.createElement("div");
    pad.style.cssText = "display:flex;gap:8px;pointer-events:none;";
    var action = document.createElement("div");
    action.style.cssText = "display:flex;gap:8px;pointer-events:none;";
    wanted.forEach(function (name) {
      var spec = KEYS[name];
      if (!spec) return;
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = spec.label;
      button.setAttribute("data-arcade-key", name);
      button.setAttribute("aria-label", name === "fire" ? "Fire" : "Move " + name);
      button.style.cssText = "pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;min-width:64px;height:64px;padding:0 14px;border-radius:16px;border:2px solid rgba(255,255,255,0.55);background:rgba(15,23,42,0.55);color:#fff;font:900 22px 'Courier New',monospace;";
      var down = false;
      button.addEventListener("pointerdown", function (event) {
        if (event.preventDefault) event.preventDefault();
        if (down) return;
        down = true;
        press("keydown", spec);
      });
      var release = function () {
        if (!down) return;
        down = false;
        press("keyup", spec);
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("pointercancel", release);
      (name === "fire" ? action : pad).appendChild(button);
    });
    bar.appendChild(pad);
    bar.appendChild(action);
    document.body.appendChild(bar);
    console.log(" 🎮 [arcade-touch] [mounted] keys=" + wanted.join(","));
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
