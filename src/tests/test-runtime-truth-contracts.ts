import assert from "node:assert/strict";
import { launchGame } from "../agents/elli/tools/launchGame";
import { showCanvas } from "../agents/elli/tools/showCanvas";
import {
  buildCanvasContextMessage,
  createSessionContext,
} from "../server/session-context";
import { SessionManager } from "../server/session-manager";

async function testLaunchGameResolvesFriendlyIds(): Promise<void> {
  const execute = launchGame.execute;
  assert.ok(execute, "launchGame.execute should exist");

  const resolved = await execute(
    { name: "BD reversal game", type: "tool" },
    { toolCallId: "lg-1", messages: [] },
  ) as unknown as Record<string, unknown>;

  assert.equal(
    resolved.ok,
    true,
    "launchGame should accept a friendly request for an existing live game",
  );
  assert.equal(
    resolved.canonicalName,
    "bd-reversal",
    "launchGame should resolve to the live canonical game id",
  );

  const unknown = await execute(
    { name: "totally fake game", type: "tool" },
    { toolCallId: "lg-2", messages: [] },
  ) as unknown as Record<string, unknown>;

  assert.equal(
    unknown.ok,
    false,
    "launchGame should return an explicit failure for unknown games",
  );
  assert.ok(
    Array.isArray(unknown.availableGames) &&
      (unknown.availableGames as unknown[]).includes("coin-counter"),
    "launchGame failures should expose current live game ids",
  );
}

async function testShowCanvasReturnsCanonicalPayload(): Promise<void> {
  const execute = showCanvas.execute;
  assert.ok(execute, "showCanvas.execute should exist");

  const result = await execute(
    {
      mode: "teaching",
      content: "Canvas Cleared",
      label: "Ready for next activity",
    },
    { toolCallId: "sc-1", messages: [] },
  ) as Record<string, unknown>;

  assert.equal(
    result.content,
    "",
    "showCanvas should sanitize invalid teaching text so the tool result matches browser payload",
  );
}

function testCanvasContextIncludesLiveGames(): void {
  const ctx = createSessionContext({
    childName: "Reina",
    sessionType: "freeform",
  });

  const injection = buildCanvasContextMessage(ctx);
  assert.match(
    injection,
    /Available teaching games:/,
    "canvas context should include the live teaching game ids when launchGame is available",
  );
  assert.match(
    injection,
    /bd-reversal/,
    "canvas context should name concrete live games, not force the model to guess",
  );
}

function testSessionManagerSyncsWordBuilderIntoContext(): void {
  const fakeWs = {
    OPEN: 1,
    readyState: 1,
    send: () => {},
  };

  const manager = new SessionManager(fakeWs as never, "Ila") as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    handleToolCall: (
      tool: string,
      args: Record<string, unknown>,
      result: unknown,
    ) => void;
  };

  manager.ctx = createSessionContext({
    childName: "Ila",
    sessionType: "freeform",
  });

  manager.handleToolCall(
    "startWordBuilder",
    { word: "because" },
    { word: "because" },
  );

  assert.equal(
    manager.ctx?.canvas.current.mode,
    "word-builder",
    "starting Word Builder should update SessionContext canvas mode",
  );
  assert.equal(
    (manager.ctx?.canvas.current as unknown as Record<string, unknown>).gameUrl,
    "/games/wordd-builder.html",
    "starting Word Builder should store the iframe url in SessionContext",
  );
}

async function main(): Promise<void> {
  console.log("\nruntime truth contracts\n");
  await testLaunchGameResolvesFriendlyIds();
  console.log("  ✅ launchGame returns truthful live-manifest results");
  await testShowCanvasReturnsCanonicalPayload();
  console.log("  ✅ showCanvas returns canonical payload");
  testCanvasContextIncludesLiveGames();
  console.log("  ✅ canvas context includes live game ids");
  testSessionManagerSyncsWordBuilderIntoContext();
  console.log("  ✅ SessionManager syncs Word Builder into SessionContext");
  console.log("\n  All runtime truth contract assertions passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
