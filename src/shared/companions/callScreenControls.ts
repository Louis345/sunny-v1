/**
 * The controls really on her screen during a companion video call (2026-11-11). One source of truth: the call
 * overlay draws its button labels from here, and the companion's call context lists exactly these, so the companion
 * never sends her to a menu that does not exist (Reina's Towa named a "Help" / "Report a problem" menu and said games
 * were off during calls, while the call has a Games button).
 */
export type CallScreenControl = { label: string; does: string; only?: string };

export const CALL_SCREEN_CONTROLS = {
  call: { label: "Call", does: "top bar: the talking view, the companion big on screen" },
  play: { label: "Play", does: "top bar: the play view, which gives an open game or activity the room" },
  portrait: { label: "Portrait", does: "top bar: shows the companion close up" },
  fullBody: { label: "Full body", does: "top bar: shows the companion's whole body" },
  games: { label: "Games", does: "top bar: opens her games inside the call; games she has won are lit and she can play them right here while the call keeps going, the rest stay dark until she wins them. Back to games leaves a game, Back to call closes the list", only: "in her own calls" },
  shop: { label: "Go Shopping", does: "top bar: opens the shop, where she spends coins she earned on clothes for the companion", only: "when she earned this call with a game reward" },
  close: { label: "X", does: "top right corner: ends the call" },
  handsFree: { label: "Hands-free", does: "bottom bar while her camera is on: shows whether the companion is listening; she just talks, no button needed" },
  look: { label: "Look (eye button)", does: "lets the companion see one picture from her camera of what she is showing" },
  cameraOff: { label: "Camera off (camera with a line through it)", does: "turns her camera off; then a typing box (Ask, with Send), a microphone button to talk, Look, Start camera and End video chat replace the hands-free bar" },
  hangUp: { label: "Hang up (red phone)", does: "ends the call" },
} as const satisfies Record<string, CallScreenControl>;

/** The "what is on her screen" block for the call context, marking which conditional controls this call has. */
export function callScreenControlsBlock(facts: { games: boolean; shop: boolean }): { text: string; count: number } {
  const present = { games: facts.games, shop: facts.shop } as Record<string, boolean>;
  const rows = Object.entries(CALL_SCREEN_CONTROLS as Record<string, CallScreenControl>).map(([key, control]) =>
    `- ${control.label}: ${control.does}.${control.only ? ` Only ${control.only}; ${present[key] ? "on screen in this call" : "not on screen in this call"}.` : ""}`);
  return {
    text: ["What is on her screen right now (the only controls in this call; there is no other menu, help or settings screen):", ...rows].join("\n"),
    count: rows.length,
  };
}
