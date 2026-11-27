import { asSchema } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanionActTool } from "../agents/tools/companionAct";
import { COMPANION_ANIMATION_IDS } from "../shared/companions/companionContract";
import { ServerCompanionBridge } from "./companion-bridge";
import { COMPANION_EMOTES } from "../shared/companionEmotes";
import { getShowroomCompanionActTools } from "./companionShowroomTalk";

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
      properties: { payload: { anyOf?: Array<{ properties?: { animation?: { enum?: string[] } } }> } };
    };
    expect(json.type).toBe("object");
    const animate = json.properties.payload.anyOf?.find((shape) => shape.properties?.animation);
    expect(animate?.properties?.animation?.enum).toEqual([...COMPANION_ANIMATION_IDS]);
  });

  /**
   * Lab invariant (11/04 Elli, 11/09 FaceTime): Elli sent animate {expression:"smile"} ("Unrecognized key") and call
   * companions sent emote "curious"; both were dropped at the bridge. Why logs caught it but nobody acted: the reject
   * is a warning. Why the lab missed it: the tools' payload was a free-form object while the registry's payloads are
   * strict, so the schema the model reads and the validator disagreed. Rule: both tools' payload is exactly the
   * registry's payload shapes.
   */
  it("Elli's companionAct payload is exactly the registry's payload shapes", async () => {
    const tool = createCompanionActTool({ companionAct: async () => ({ ok: true }) });
    const schema = asSchema(tool.inputSchema);
    const validate = async (value: unknown) => (await schema.validate!(value)).success;
    expect(await validate({ type: "animate", payload: { expression: "smile" } })).toBe(false);
    expect(await validate({ type: "emote", payload: { emote: "curious" } })).toBe(false);
    expect(await validate({ type: "emote", payload: { emote: "happy" } })).toBe(true);
    expect(await validate({ type: "animate", payload: { animation: "wave", loop: false } })).toBe(true);
    const json = (await schema.jsonSchema) as { properties: { payload: { anyOf?: Array<{ properties?: { emote?: { enum?: string[] } } }> } } };
    const emote = json.properties.payload.anyOf?.find((shape) => shape.properties?.emote);
    expect(emote?.properties?.emote?.enum).toEqual([...COMPANION_EMOTES]);
  });

  it("the FaceTime companionAct payload is exactly the registry's payload shapes", () => {
    const [tool] = getShowroomCompanionActTools();
    const payload = tool.input_schema.properties.payload as {
      anyOf?: Array<{ additionalProperties?: boolean; properties?: Record<string, { enum?: string[] }> }>;
    };
    expect(payload.anyOf?.length).toBeGreaterThan(0);
    expect(payload.anyOf?.every((shape) => shape.additionalProperties === false)).toBe(true);
    expect(payload.anyOf?.find((s) => s.properties?.emote)?.properties?.emote?.enum).toEqual([...COMPANION_EMOTES]);
    expect(payload.anyOf?.find((s) => s.properties?.animation)?.properties?.animation?.enum).toEqual([...COMPANION_ANIMATION_IDS]);
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
