# Scripted child-facing speech: audit (2026-11-22)

Owner rule: no deterministic or canned child-facing conversation. Companions speak from live AI context in their own personality.

Allowed:
- marked recordings (the announcer bank)
- spelling test words
- system UI text that never speaks as the companion

Three read-only agents produced this audit, split by where scripts come from: kiosk, server and prompts. Fixed items are ticked as they land. The guard comes last: one test that fails when a literal string reaches the companion's voice.

## High: spoken as the companion

**FaceTime and showroom**
- [ ] Pickup greeting per companion ("You earned this call…"). `web/src/components/CompanionShowroom.tsx:1943-2005` (`resolveVideoCallPickupGreeting`, used ~6166-6230). Fix: the AI writes the opening while she waits (owner: pre-written during loading, for the likely companion).
- [ ] Farewell lines ("Rematch soon? I'll go easy."). `CompanionShowroom.tsx:6572-6585` (`buildShowroomFarewellLine`). Fix: the AI writes the goodbye from the call.
- [ ] Showroom intro/plead scripts ("Hi! I'm Elli…", "Please pick me!"):
  - `src/prompts/companions/*/showroom.json` `scripts`
  - `src/server/routes.ts:582-603` (readShowroomScript and its fallback)
  - `CompanionShowroom.tsx:6985-7005`
  - `companions.generated.ts`

  Fix: a live model turn from the persona.
- [ ] Empty-reply fallback "I'm here with you. Let's keep going." `src/server/companionShowroomTalk.ts:71, 1325`. Fix: stay silent or retry; never insert a line.

**Homework session**
- [ ] Pronunciation help lines ("I can help. Try breaking X into…"). `src/server/session-manager.ts:1835-1837`, `sessionTextHelpers.ts:90`, spoken directly with no model call. Fix: send the help intent, word and cue to the companion.
- [ ] Scheduled check-in `words`, spoken minutes later word for word. `companion-bridge.ts:148-152`, `companionCheckIn.ts:26`. Fix: when the timer fires, run a fresh model turn.
- [ ] Worksheet question replayed word for word on resume. `session-manager.ts:675` ← `activeCanvasActivity.ts:186`. Borderline, since it's homework content.
- [x] Game `narration_request` text passed straight to her voice. `game-event-handler.ts:410-442`, `map-coordinator.ts:336-375`. Fix: pass-through only for assessment words and marked recordings. Done: a narrator voice reads only on-screen text and test words; other game lines reach her as facts (`gameNarrationRoute.ts`).

**Games**
- [ ] Orb Catcher and Egg Hatch device-voice lines when no recording exists ("Shake it off, champ", "Listen.", "This one is just you. Ready? Go!"):
  - `orbThemePacks.ts:69-73, 141-145`
  - `OrbCatcher3D.tsx:339, 343`
  - `EggHatch3D.tsx:140, 162`

  Fix: a recording or silence.
- [ ] Visual Explainer narration ("I am your co-pilot…"). `VisualExplainerDemo.tsx:396`, `visualBriefs.ts`, `erosionDemoConfig.ts`.

## High: prompts that make every companion the same or push unprompted topics
- [ ] `Catchphrases:` injected into every call prompt (`routes.ts:682`, `showroom.json` catchphrases). Fix: keep them out of call prompts.
- [ ] One length rule for everyone:
  - "1-3 short sentences", "at most one follow-up question", "follow the child's lead" (`companionShowroomTalk.ts:1000-1002`)
  - "Follow the child's lead" (`companion-base.md:9`)
  - "Two sentences max" in 8 `personality.md` files

  Fix: personality decides length and initiative.
- [ ] Clock, coin and homework sales pitch in the call prompt:
  - `companionShowroomTalk.ts:1036, 1040, 1046-1053`
  - [x] `companionShowroomTalk.ts:1132-1138` ("finishing another board earns more coins"): the clock and coin pitch is gone; she speaks of time only at time_up, in her own words.

  Fix: earnedBy only if she asks; time only at time_up. Still open: the `Earned by:` line.
- [ ] Thin, tutor-only personas (all nine `personality.md`). Drafts: `docs/drafts/companion-voices-draft.md` (owner approves; Princess needs a British ElevenLabs voice).
- [ ] `companion-base.md` says "She is eight". The twins turned 9 on 2026-11-21.

## Medium
- [ ] Spark Orb bubble, Session End praise, intro fallback text, Orb wrong-answer card, and first-person preparation lines handed to Elli (`adventurePreparationMachine.ts:47-63`).
- [ ] Prompt forced lines:
  - worksheet "You're right, let me recount…" (`worksheetSessionPrompt.ts:167, 269`)
  - "exactly one short sentence" (`game-event-handler.ts:994`)
  - CORRECT/INCORRECT celebrate scripts (`session-manager.ts:1998`)
  - Matilda's fixed opening/closing shape (`src/companions/matilda.md:13, 22-24`)

## Low (UI only; fine or optional)
Error toasts, "Perfect!" badges, Tamagotchi mood bubbles (`vrrTypes.ts:66-77`), reward descriptions, adult/preview-mode opening lines.

## Done so far
- 2026-11-22: narrator voice for game speech; game chat becomes a companion fact; server XState voice floor (narrator waits for her, the child stops both); no repeated narrator line in a game; no coin pitch in calls; short-turn default in `companion-base.md`. Guard: `src/server/voiceGuard.test.ts` lists every door into either voice; a new door fails until reviewed. Doors still carrying scripted words, each an open item above: pronunciation help lines, worksheet replay, empty-reply fallback; the scheduled check-in still speaks her earlier words verbatim (now always in her own voice).
- 2026-11-22 afe2af70: no time talk in a call's first 30 s; warning at 30 s left.
