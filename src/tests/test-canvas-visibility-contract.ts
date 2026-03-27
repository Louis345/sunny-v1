import assert from "node:assert/strict";
import { SessionManager } from "../server/session-manager";
import {
  buildCanvasContextMessage,
  createSessionContext,
} from "../server/session-context";

function createManager() {
  const fakeWs = {
    OPEN: 1,
    readyState: 1,
    send: () => {},
  };

  const manager = new SessionManager(fakeWs as never, "Reina") as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    handleToolCall: (
      tool: string,
      args: Record<string, unknown>,
      result: unknown,
    ) => void;
    canvasDone: (payload?: Record<string, unknown>) => void;
    handleGameEvent: (event: Record<string, unknown>) => void;
  };

  manager.ctx = createSessionContext({
    childName: "Reina",
    sessionType: "freeform",
  });

  return manager;
}

function testPendingUntilBrowserAck(): void {
  const manager = createManager();

  manager.handleToolCall(
    "launchGame",
    { name: "space-invaders", type: "reward" },
    {
      ok: true,
      requestedName: "space-invaders",
      canonicalName: "space-invaders",
      type: "reward",
      availableGames: ["space-invaders"],
    },
  );

  const beforeAck = buildCanvasContextMessage(manager.ctx!);
  assert.match(
    beforeAck,
    /Browser render: pending/,
    "new canvas/game launches should remain pending until the browser confirms render",
  );
}

function testAckMarksCurrentRevisionVisible(): void {
  const manager = createManager();

  manager.handleToolCall(
    "launchGame",
    { name: "space-invaders", type: "reward" },
    {
      ok: true,
      requestedName: "space-invaders",
      canonicalName: "space-invaders",
      type: "reward",
      availableGames: ["space-invaders"],
    },
  );

  manager.canvasDone({ canvasRevision: 1, mode: "space-invaders" });

  const afterAck = buildCanvasContextMessage(manager.ctx!);
  assert.match(
    afterAck,
    /Browser render: confirmed/,
    "canvas_done for the current revision should mark the canvas as visible to the child",
  );
}

function testStaleAckDoesNotConfirmNewerCanvas(): void {
  const manager = createManager();

  manager.handleToolCall(
    "launchGame",
    { name: "store-game", type: "tool" },
    {
      ok: true,
      requestedName: "store-game",
      canonicalName: "store-game",
      type: "tool",
      availableGames: ["bd-reversal", "coin-counter", "spell-check", "store-game", "word-builder"],
    },
  );
  manager.handleToolCall(
    "launchGame",
    { name: "coin-counter", type: "tool" },
    {
      ok: true,
      requestedName: "coin-counter",
      canonicalName: "coin-counter",
      type: "tool",
      availableGames: ["bd-reversal", "coin-counter", "spell-check", "store-game", "word-builder"],
    },
  );

  manager.canvasDone({ canvasRevision: 1, mode: "store-game" });

  const afterStaleAck = buildCanvasContextMessage(manager.ctx!);
  assert.match(
    afterStaleAck,
    /Browser render: pending/,
    "a stale browser ack must not confirm a newer canvas revision",
  );
}

function testGameReadyIsSeparateFromVisible(): void {
  const manager = createManager();

  manager.handleToolCall(
    "launchGame",
    { name: "space-invaders", type: "reward" },
    {
      ok: true,
      requestedName: "space-invaders",
      canonicalName: "space-invaders",
      type: "reward",
      availableGames: ["space-invaders"],
    },
  );
  manager.canvasDone({ canvasRevision: 1, mode: "space-invaders" });

  let context = buildCanvasContextMessage(manager.ctx!);
  assert.match(
    context,
    /Game startup: waiting/,
    "visible game iframes should remain startup-pending until the game reports ready",
  );

  manager.handleGameEvent({ type: "ready" });
  context = buildCanvasContextMessage(manager.ctx!);
  assert.match(
    context,
    /Game startup: confirmed/,
    "ready events should tell the model the current game actually started",
  );
  assert.match(
    context,
    /Browser render: confirmed/,
    "game ready should also count as browser-confirmed visibility when iframe startup succeeds",
  );
}

function testGameReadyCanConfirmVisibilityWithoutCanvasDone(): void {
  const manager = createManager();

  manager.handleToolCall(
    "launchGame",
    { name: "space-invaders", type: "reward" },
    {
      ok: true,
      requestedName: "space-invaders",
      canonicalName: "space-invaders",
      type: "reward",
      availableGames: ["space-invaders"],
    },
  );

  manager.handleGameEvent({ type: "ready" });

  const context = buildCanvasContextMessage(manager.ctx!);
  assert.match(
    context,
    /Browser render: confirmed/,
    "game ready should act as a fallback browser confirmation when canvas_done is missing",
  );
  assert.match(
    context,
    /Game startup: confirmed/,
    "game ready should still confirm startup state",
  );
}

function main(): void {
  console.log("\ncanvas visibility contract\n");
  testPendingUntilBrowserAck();
  console.log("  ✅ new canvas revisions stay pending until browser ack");
  testAckMarksCurrentRevisionVisible();
  console.log("  ✅ current revision ack marks canvas visible");
  testStaleAckDoesNotConfirmNewerCanvas();
  console.log("  ✅ stale acks do not confirm newer canvas");
  testGameReadyIsSeparateFromVisible();
  console.log("  ✅ game ready is tracked separately from visibility");
  testGameReadyCanConfirmVisibilityWithoutCanvasDone();
  console.log("  ✅ game ready can confirm visibility without canvas_done");
  console.log("\n  All canvas visibility assertions passed\n");
}

main();
