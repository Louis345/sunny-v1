import { describe, it, expect } from "vitest";
import {
  buildLaunchGameTool,
  WB_ALREADY_ACTIVE,
} from "../agents/elli/tools/launchGame";

describe("buildLaunchGameTool (spelling) word-builder execute (model-visible)", () => {
  it("returns ok:true when session inactive and slot claimed once", async () => {
    let sessionActive = false;
    let claimed = false;
    const t = buildLaunchGameTool({
      isWordBuilderSessionActive: () => sessionActive,
      tryClaimWordBuilderToolSlot: () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
    });
    const exec = t.execute as (a: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => Promise<unknown>;
    const r = (await exec({
      name: "word-builder",
      type: "tool",
      word: "movers",
    })) as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect(r.launched).toBe(true);
    expect(r.word).toBe("movers");
  });

  it("returns ok:false when Word Builder session already active", async () => {
    const t = buildLaunchGameTool({
      isWordBuilderSessionActive: () => true,
      tryClaimWordBuilderToolSlot: () => true,
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
    });
    const exec = t.execute as (a: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => Promise<unknown>;
    const r = (await exec({
      name: "word-builder",
      type: "tool",
      word: "movers",
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.launched).toBe(false);
    expect(r.error).toBe(WB_ALREADY_ACTIVE);
  });

  it("returns ok:false for second execute in same step (slot already claimed)", async () => {
    let claimed = false;
    const t = buildLaunchGameTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
    });
    const exec = t.execute as (a: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => Promise<unknown>;
    const first = await exec({
      name: "word-builder",
      type: "tool",
      word: "movers",
    });
    const second = await exec({
      name: "word-builder",
      type: "tool",
      word: "cats",
    });
    expect((first as { ok: boolean }).ok).toBe(true);
    expect((second as { ok: boolean }).ok).toBe(false);
    expect((second as { error: string }).error).toBe(WB_ALREADY_ACTIVE);
  });

  it("returns ok:false when word is shorter than 3 letters", async () => {
    const t = buildLaunchGameTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => true,
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
    });
    const exec = t.execute as (a: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => Promise<unknown>;
    const r = (await exec({
      name: "word-builder",
      type: "tool",
      word: "ab",
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.launched).toBe(false);
    expect(String(r.error)).toContain("3 letters");
  });
});
