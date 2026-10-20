import { describe, expect, it, vi } from "vitest";
import { createSpeechTools } from "./companionSpeechTools";

describe("Elli's speech capability", () => {
  it("applies the model's chosen rate and reports configuration, not heard audio", async () => {
    const setSpeechRate = vi.fn(speed => ({ speed }));
    const record = vi.fn();
    const tools = createSpeechTools({ setSpeechRate }, record);
    const result = await tools.setSpeechRate!.execute!({ speed: 0.7 }, {} as never);
    expect(setSpeechRate).toHaveBeenCalledWith(0.7, undefined);
    expect(result).toEqual({ speed: 0.7, previousSpeed: null, configured: true, playbackConfirmed: false });
    expect(record).toHaveBeenCalledWith({ speed: 0.7, previousSpeed: null, configured: true, playbackConfirmed: false });
    await tools.setSpeechRate!.execute!({ speed: 1 }, {} as never);
    expect(setSpeechRate).toHaveBeenLastCalledWith(1, undefined);
  });
  it("does not advertise unavailable speech control", () => {
    expect(createSpeechTools(null, vi.fn())).toEqual({});
    expect(createSpeechTools({setSpeechRate:vi.fn(),isSpeechEnabled:()=>false},vi.fn())).toEqual({});
  });
});

it("tells Elli the current configured pace so she can reconsider an ineffective attempt",()=>{
 const tools=createSpeechTools({setSpeechRate:speed=>({speed}),getSpeechRate:()=>0.75},vi.fn());
 expect(tools.setSpeechRate!.description).toContain("Current configured speed: 0.75");
});

it("does not retarget an old model's pace action to a newly displayed item",async()=>{
 let scope={itemId:'old',launchToken:'one'};const setSpeechRate=vi.fn(speed=>({speed}));
 const tools=createSpeechTools({setSpeechRate,getSpeechRate:()=>1},vi.fn(),()=>scope);
 scope={itemId:'new',launchToken:'two'};
 const result=await tools.setSpeechRate!.execute!({speed:0.7},{} as never);
 expect(setSpeechRate).not.toHaveBeenCalled();expect(result).toMatchObject({configured:false,reason:'activity_item_changed'});
});
