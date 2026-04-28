type CompanionActBridge = {
  companionAct: (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

/**
 * Fires the thinking emote before tool execution so the UI updates immediately.
 */
export async function fireThinkingEmoteBeforeTools(bridge: CompanionActBridge): Promise<void> {
  await bridge.companionAct({
    type: "emote",
    payload: { emote: "thinking", intensity: 0.7 },
  });
}

/**
 * One thinking emote per LLM step when that step has ≥1 tool call, before any
 * `execute` runs. Reset `onStepStart` (each new model invocation).
 */
export function createThinkingEmoteOnFirstToolInStep(bridge: CompanionActBridge) {
  let emoteFiredThisLlmStep = false;
  return {
    onStepStart: (): void => {
      emoteFiredThisLlmStep = false;
    },
    onToolCallStart: async (): Promise<void> => {
      if (emoteFiredThisLlmStep) return;
      emoteFiredThisLlmStep = true;
      await fireThinkingEmoteBeforeTools(bridge);
    },
  };
}
