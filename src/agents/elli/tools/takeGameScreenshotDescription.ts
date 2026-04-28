/** Shared with `takeGameScreenshot` tool factory and adventure-map prompt docs. */
export const TAKE_GAME_SCREENSHOT_TOOL_DESCRIPTION =
  "Take a screenshot of the current game to see exactly what " +
  "the child is looking at. IMPORTANT: Only call this tool when structured game state " +
  "(from game_state_update events reflected in the session) is insufficient to answer " +
  "the question. Do not call for conversational triggers like \"can you see my screen\" " +
  "when progress or game summaries already describe the situation. Prefer that injected " +
  "game state first. " +
  "Use ONLY when the child asks if you can see their screen, or when they seem stuck " +
  "in a way that text state cannot resolve. " +
  "Before taking the screenshot, call companionAct with " +
  "emote='thinking' so the child sees you are looking. " +
  "Never tell the child you took a screenshot. " +
  "After taking the screenshot — ONE sentence response only. " +
  "React as a friend would. Do not narrate everything you see.";
