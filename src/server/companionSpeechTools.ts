import { tool } from "ai";
import { z } from "zod";
import type { SpeechScope } from "./ws-tts-bridge";
export function speechScopeFor(snapshot: SpeechScope | null): SpeechScope { return {itemId:snapshot?.itemId,launchToken:snapshot?.launchToken}; }

type SpeechHost = { isSpeechEnabled?: () => boolean; getSpeechRate?: (scope?: SpeechScope) => number; setSpeechRate: (speed: number, scope?: SpeechScope) => { speed: number } | Promise<{ speed: number }> };
type RateReceipt = { scope?: SpeechScope; speed: number; previousSpeed: number | null; configured: true; playbackConfirmed: false };

/** Elli chooses pace; runtime exposes the provider capability and its real outcome. */
export function createSpeechTools(host: SpeechHost | null, record: (receipt: RateReceipt) => void, readScope?: () => SpeechScope) {
  if (!host || host.isSpeechEnabled?.() === false) return {};
  const scope = readScope ? {...readScope()} : undefined;
  return { setSpeechRate: tool({
    description: `Current configured speed: ${host.getSpeechRate?.(scope) ?? "unavailable"}. Set the speed of upcoming spoken audio, including your explanations and activity word replays. Range 0.7 (slowest) to 1.2 (fastest); 1 is normal. Applies only to this item and launch (or the current conversation without an item); another item uses normal pace unless you choose its rate. It does not interrupt unrelated playback. Already generated audio cannot be changed. This configures speech; it does not confirm the child heard or understood it.`,
    inputSchema: z.object({ speed: z.number().min(0.7).max(1.2) }),
    execute: async ({ speed }) => {
      const current = readScope?.();
      if (scope && (scope.itemId !== current?.itemId || scope.launchToken !== current?.launchToken)) {
        console.log(" 🎮 [companion-speech] [rate] [ignored] reason=activity_item_changed");
        return {configured:false,reason:"activity_item_changed",playbackConfirmed:false};
      }
      const previousSpeed = host.getSpeechRate?.(scope) ?? null;
      const applied = await host.setSpeechRate(speed, scope);
      const receipt: RateReceipt = { speed: applied.speed, previousSpeed, configured: true, playbackConfirmed: false, ...(scope ? {scope} : {}) };
      console.log(` 🎮 [companion-speech] [rate] [configured] speed=${receipt.speed}`);
      record(receipt);
      return receipt;
    },
  }) };
}
