type CreatorDiagSession = {
  applyClientToolCall(tool: string, args: Record<string, unknown>): void;
};

let creatorDiagSessionForReadingTest: CreatorDiagSession | null = null;

const TEST_PRONUNCIATION_WORDS = [
  "blister",
  "carpet",
  "thirteen",
  "orbit",
  "harvest",
  "confirm",
  "interrupt",
  "perfume",
  "hamburger",
  "corner",
  "kindergarten",
  "chimp",
  "inhabit",
  "instruments",
  "band",
];

export function setCreatorDiagSessionForReadingTest(session: unknown): void {
  if (
    typeof session === "object" &&
    session !== null &&
    typeof (session as CreatorDiagSession).applyClientToolCall === "function"
  ) {
    creatorDiagSessionForReadingTest = session as CreatorDiagSession;
  }
}

export function clearCreatorDiagSessionForReadingTest(session: CreatorDiagSession): void {
  if (creatorDiagSessionForReadingTest === session) creatorDiagSessionForReadingTest = null;
}

export function tryPushCreatorDiagReadingKaraoke(
  text: string,
): { ok: true } | { ok: false; error: string } {
  const session = creatorDiagSessionForReadingTest;
  if (!session) return { ok: false, error: "no_active_creator_diag_voice_session" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "text_required" };
  const words = trimmed.split(/\s+/).filter(Boolean);
  session.applyClientToolCall("canvasShow", {
    type: "karaoke",
    storyText: trimmed,
    words,
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600",
  });
  return { ok: true };
}

export function tryPushCreatorDiagPronunciation(): { ok: true } | { ok: false; error: string } {
  const session = creatorDiagSessionForReadingTest;
  if (!session) return { ok: false, error: "no_active_creator_diag_voice_session" };
  session.applyClientToolCall("canvasShow", {
    type: "pronunciation",
    pronunciationWords: TEST_PRONUNCIATION_WORDS,
  });
  return { ok: true };
}
