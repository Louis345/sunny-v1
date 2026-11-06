import { asSchema } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanionActTool } from "../agents/tools/companionAct";
import { COMPANION_ANIMATION_IDS } from "../shared/companions/companionContract";
import { ServerCompanionBridge } from "./companion-bridge";

/**
 * Lab invariant (child session, Ila + Elli): Elli asked companionAct for
 * animation "encouraging_nod" and got invalid_or_unknown_companion_command.
 * The child saw Elli freeze instead of moving. Logs did record the zod reject,
 * but nobody reads warnings mid-session, and no lab checked the schema the
 * model actually sees: payload was a free-form record, so the model had to
 * guess animation names. The tool schema must enumerate the real animations.
 */
describe("companionAct animation schema", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exposes the exact allowed animation ids as an enum in the tool input schema", async () => {
    const tool = createCompanionActTool({ companionAct: async () => ({ ok: true }) });
    const json = (await asSchema(tool.inputSchema).jsonSchema) as {
      type: string;
      properties: { payload: { properties?: { animation?: { enum?: string[] } } } };
    };
    expect(json.type).toBe("object");
    expect(json.properties.payload.properties?.animation?.enum).toEqual([
      ...COMPANION_ANIMATION_IDS,
    ]);
  });

  it("still rejects an unknown animation at the bridge, with a log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bridge = new ServerCompanionBridge();
    const result = await bridge.companionAct({
      type: "animate",
      payload: { animation: "encouraging_nod" },
    });
    expect(result).toEqual({ ok: false, error: "invalid_or_unknown_companion_command" });
    const lines = warn.mock.calls.map((c) => c.map(String).join(" "));
    expect(lines.some((l) => l.includes("[companionAct] [rejected]") && l.includes("encouraging_nod"))).toBe(true);
  });
});
