import { describe, it, expect } from "vitest";
import {
  createStartWordBuilderTool,
  WB_ALREADY_ACTIVE,
} from "../agents/elli/tools/startWordBuilder";

describe("createStartWordBuilderTool execute (model-visible)", () => {
  it("returns ok:true when session inactive and slot claimed once", async () => {
    let sessionActive = false;
    let claimed = false;
    const t = createStartWordBuilderTool({
      isWordBuilderSessionActive: () => sessionActive,
      tryClaimWordBuilderToolSlot: () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
    });
    const exec = t.execute as (a: { word: string }) => Promise<unknown>;
    const r = (await exec({ word: "movers" })) as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect(r.launched).toBe(true);
    expect(r.word).toBe("movers");
  });

  it("returns ok:false when Word Builder session already active", async () => {
    const t = createStartWordBuilderTool({
      isWordBuilderSessionActive: () => true,
      tryClaimWordBuilderToolSlot: () => true,
    });
    const exec = t.execute as (a: { word: string }) => Promise<unknown>;
    const r = (await exec({ word: "movers" })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.launched).toBe(false);
    expect(r.error).toBe(WB_ALREADY_ACTIVE);
  });

  it("returns ok:false for second execute in same step (slot already claimed)", async () => {
    let claimed = false;
    const t = createStartWordBuilderTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
    });
    const exec = t.execute as (a: { word: string }) => Promise<unknown>;
    const first = await exec({ word: "movers" });
    const second = await exec({ word: "cats" });
    expect((first as { ok: boolean }).ok).toBe(true);
    expect((second as { ok: boolean }).ok).toBe(false);
    expect((second as { error: string }).error).toBe(WB_ALREADY_ACTIVE);
  });

  it("returns ok:false when word is shorter than 3 letters", async () => {
    const t = createStartWordBuilderTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => true,
    });
    const exec = t.execute as (a: { word: string }) => Promise<unknown>;
    const r = (await exec({ word: "ab" })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.launched).toBe(false);
    expect(String(r.error)).toContain("3 letters");
  });
});
