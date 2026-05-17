import { describe, expect, it } from "vitest";
import http from "node:http";
import { WebSocketServer } from "ws";
import {
  createSyntheticChildBrowserDriver,
  runSyntheticChildBrowserActions,
  resolveSyntheticChildBrowserAvailability,
} from "./syntheticChildBrowserDriver";

describe("Synthetic child browser driver", () => {
  async function serveHtml(html: string): Promise<{ url: string; close: () => Promise<void> }> {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
  }

  async function serveWebSocket(): Promise<{ url: string; close: () => Promise<void> }> {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("websocket server did not bind");
    return {
      url: `ws://127.0.0.1:${address.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
  }

  it("declares Playwright as the browser engine for synthetic child runs", () => {
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab",
      headless: true,
    });

    expect(driver.engine).toBe("playwright");
    expect(driver.headless).toBe(true);
  });

  it("reports whether Playwright can be loaded before a browser run", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();

    expect(availability.engine).toBe("playwright");
    expect(availability.packageName).toBe("playwright");
    if (!availability.available) {
      expect(availability.reason).toBeTruthy();
    }
  });

  it("runs synthetic child actions in a browser and captures screenshots/events", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <main>
        <button data-node-id="pronunciation">Pronunciation</button>
        <button data-mystery-option="wheel-of-fortune">Wheel</button>
        <input aria-label="answer" />
        <script>
          window.syntheticClicks = [];
          document.addEventListener("click", (event) => {
            window.syntheticClicks.push(event.target.getAttribute("data-node-id") || event.target.getAttribute("data-mystery-option"));
          });
        </script>
      </main>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      actions: [
        {
          type: "clickNode",
          value: "pronunciation",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
        {
          type: "say",
          value: "government",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.900Z",
        },
        {
          type: "ask",
          value: "what word is it?",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:01.700Z",
        },
        {
          type: "chooseMystery",
          value: "wheel-of-fortune",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:03.100Z",
        },
      ],
    });

    expect(result.engine).toBe("playwright");
    expect(result.events.map((event) => event.type)).toEqual([
      "clickNode",
      "say",
      "ask",
      "chooseMystery",
    ]);
    expect(result.screenshots.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toEqual([]);
  });

  it("captures real browser evidence emitted by game contracts", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <main>
        <button data-node-id="word-radar">Word Radar</button>
        <script>
          window.SunnyActivity = {
            snapshot(payload) {
              window.dispatchEvent(new CustomEvent("sunny:activity:snapshot", { detail: payload }));
            },
            attempt(payload) {
              window.dispatchEvent(new CustomEvent("sunny:activity:attempt", { detail: payload }));
            },
            complete(payload) {
              window.dispatchEvent(new CustomEvent("sunny:activity:complete", { detail: payload }));
            }
          };
          document.querySelector("[data-node-id='word-radar']").addEventListener("click", () => {
            window.SunnyActivity.snapshot({
              activityId: "word-radar",
              phase: "response",
              currentTarget: "machine",
              answerVisibility: "visible",
              evidenceTier: "clean_recall"
            });
            window.postMessage({
              type: "game_state_update",
              payload: {
                activityId: "word-radar",
                phase: "response",
                currentWord: "machine",
                answerVisibility: "visible",
                evidenceTier: "clean_recall"
              }
            }, "*");
          });
        </script>
      </main>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      actions: [
        {
          type: "clickNode",
          value: "word-radar",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
      ],
    });

    expect(result.browserEvents.some((event) => event.eventType === "activity_snapshot")).toBe(true);
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        activityId: "word-radar",
        target: "machine",
        answerVisibility: "visible",
        evidenceTier: "clean_recall",
      }),
    );
  });

  it("captures app WebSocket game-state messages as browser evidence", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const ws = await serveWebSocket();
    const served = await serveHtml(`
      <script>
        const socket = new WebSocket("${ws.url}");
        socket.addEventListener("open", () => {
          socket.send(JSON.stringify({
            type: "game_state_update",
            payload: {
              activityId: "pronunciation",
              phase: "ready",
              currentWord: "government"
            }
          }));
        });
      </script>
    `);
    try {
      const driver = createSyntheticChildBrowserDriver({
        labDir: "/tmp/sunny-lab-browser-driver",
        headless: true,
        viewport: { width: 640, height: 360 },
      });
      const result = await runSyntheticChildBrowserActions(driver, {
        url: served.url,
        personaId: "struggling_reader",
        iteration: 1,
        sessionId: "lab-struggling_reader-1",
        actions: [
          {
            type: "wait",
            value: 500,
            source: "synthetic_child",
            timestamp: "2026-05-17T12:00:00.100Z",
          },
        ],
      });

      expect(result.browserEvents).toContainEqual(
        expect.objectContaining({
          eventType: "game_state_update",
          activityId: "pronunciation",
          phase: "ready",
          target: "government",
        }),
      );
    } finally {
      await served.close();
      await ws.close();
    }
  });

  it("waits for delayed adventure targets before clicking like a child", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <main id="root">Loading map...</main>
      <script>
        setTimeout(() => {
          document.getElementById("root").innerHTML = '<button data-node-id="pronunciation">Pronunciation</button>';
          document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
            window.postMessage({
              type: "game_state_update",
              payload: { activityId: "pronunciation", phase: "ready", currentWord: "government" }
            }, "*");
          });
        }, 350);
      </script>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      actions: [
        {
          type: "clickNode",
          value: "pronunciation",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
      ],
    });

    expect(result.events[0]?.deliveredTo).toContain("dom-click");
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        activityId: "pronunciation",
      }),
    );
  });

  it("waits through the full adventure loading curtain before the first node click", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <main id="root">The adventure is almost ready</main>
      <script>
        setTimeout(() => {
          document.getElementById("root").innerHTML = '<button data-node-id="pronunciation">Pronunciation</button>';
          document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
            window.postMessage({
              type: "game_state_update",
              payload: { activityId: "pronunciation", phase: "ready", currentWord: "government" }
            }, "*");
          });
        }, 3600);
      </script>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      actions: [
        {
          type: "clickNode",
          value: "pronunciation",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
      ],
    });

    expect(result.events[0]?.deliveredTo).toContain("dom-click");
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        activityId: "pronunciation",
      }),
    );
  }, 10_000);

  it("does not click map nodes while the loading overlay still covers the board", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <div data-testid="session-loading-overlay">The adventure is almost ready</div>
      <button data-node-id="pronunciation">Pronunciation</button>
      <script>
        window.loading = true;
        setTimeout(() => {
          window.loading = false;
          document.querySelector("[data-testid='session-loading-overlay']").remove();
        }, 500);
        document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
          window.postMessage({
            type: "game_state_update",
            payload: {
              activityId: "pronunciation",
              phase: window.loading ? "clicked_early" : "ready",
              currentWord: "government"
            }
          }, "*");
        });
      </script>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      actions: [
        {
          type: "clickNode",
          value: "pronunciation",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
      ],
    });

    expect(result.browserEvents).not.toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        phase: "clicked_early",
      }),
    );
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        activityId: "pronunciation",
        phase: "ready",
      }),
    );
  });

  it("can click visible animated map nodes instead of waiting forever for visual stability", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <style>
        @keyframes bob { from { transform: translateY(0); } to { transform: translateY(4px); } }
        [data-node-id="pronunciation"] { animation: bob 120ms infinite alternate; }
      </style>
      <button data-node-id="pronunciation">Pronunciation</button>
      <script>
        document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
          window.postMessage({
            type: "game_state_update",
            payload: { activityId: "pronunciation", phase: "ready", currentWord: "government" }
          }, "*");
        });
      </script>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      actions: [
        {
          type: "clickNode",
          value: "pronunciation",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.events[0]?.deliveredTo).toContain("dom-click");
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        activityId: "pronunciation",
      }),
    );
  });

  it("selects the requested child profile before running adventure actions", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const driver = createSyntheticChildBrowserDriver({
      labDir: "/tmp/sunny-lab-browser-driver",
      headless: true,
      viewport: { width: 640, height: 360 },
    });
    const url = `data:text/html,${encodeURIComponent(`
      <main id="root">
        <h1>Who's learning today?</h1>
        <button data-child-id="ila">Ila</button>
        <button data-child-id="reina">Reina</button>
      </main>
      <script>
        document.querySelector("[data-child-id='ila']").addEventListener("click", () => {
          document.getElementById("root").innerHTML = '<button data-node-id="pronunciation">Pronunciation</button>';
          document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
            window.postMessage({
              type: "game_state_update",
              payload: { activityId: "pronunciation", phase: "ready", currentWord: "government" }
            }, "*");
          });
        });
      </script>
    `)}`;

    const result = await runSyntheticChildBrowserActions(driver, {
      url,
      personaId: "struggling_reader",
      iteration: 1,
      sessionId: "lab-struggling_reader-1",
      browserProfileChildId: "ila",
      actions: [
        {
          type: "clickNode",
          value: "pronunciation",
          source: "synthetic_child",
          timestamp: "2026-05-17T12:00:00.100Z",
        },
      ],
    });

    expect(result.events[0]?.deliveredTo).toContain("dom-click");
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "profile_select",
        text: "ila",
      }),
    );
    expect(result.browserEvents).toContainEqual(
      expect.objectContaining({
        eventType: "game_state_update",
        activityId: "pronunciation",
      }),
    );
  });

  it("launches with a fake microphone so full adventure mode does not collapse to voice-error state", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const served = await serveHtml(`
      <script>
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then((stream) => {
            window.postMessage({
              type: "game_state_update",
              payload: { activityId: "mic-preflight", phase: "ready" }
            }, "*");
            stream.getTracks().forEach((track) => track.stop());
          })
          .catch((error) => {
            window.postMessage({
              type: "game_state_update",
              payload: { activityId: "mic-preflight", phase: "mic_error", lastHeard: error.name }
            }, "*");
          });
      </script>
    `);
    try {
      const driver = createSyntheticChildBrowserDriver({
        labDir: "/tmp/sunny-lab-browser-driver",
        headless: true,
        viewport: { width: 640, height: 360 },
      });
      const result = await runSyntheticChildBrowserActions(driver, {
        url: served.url,
        personaId: "struggling_reader",
        iteration: 1,
        sessionId: "lab-struggling_reader-1",
        actions: [
          {
            type: "wait",
            value: 500,
            source: "synthetic_child",
            timestamp: "2026-05-17T12:00:00.100Z",
          },
        ],
      });

      expect(result.browserEvents).toContainEqual(
        expect.objectContaining({
          eventType: "game_state_update",
          activityId: "mic-preflight",
          phase: "ready",
        }),
      );
    } finally {
      await served.close();
    }
  });
});
