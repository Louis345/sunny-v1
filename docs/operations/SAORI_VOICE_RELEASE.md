# Saori voice release gate

Use the canonical `npm run sunny:run -- --subject homework --child demo-pashley --homework-domain spelling` entry point with the explicitly selected synthetic chart directory and `SUNNY_COMPANION_ID=elli`. Do not replace the macOS LaunchServices route with direct Chrome executable spawning, even from a GUI LaunchAgent. That makes hardened Node responsible for microphone access and macOS refuses consent because Node lacks the audio-input entitlement.

Before accepting a voice-related release:

1. Run `npm run test:voice-regression` and `npm run build`. CI's dedicated `voice-regression` job must pass, including on specialized spelling branches. Repository branch-protection configuration must require that check to make it merge-blocking; this document does not configure GitHub branch protection.
2. Launch the dedicated kiosk on Saori. Require both `[macos-launch] [launchservices]` and `[kiosk-visible] [confirmed]`. Preserve unrelated Chrome profiles. If checking TCC, the responsible application must be `com.google.Chrome`, not `node`.
3. Let the human grant macOS microphone access. On first consent, the existing five-second microphone timeout can expire while the dialog is open; once consent is granted, reload the dedicated kiosk. Do not reset consent routinely.
4. Have the human summon Elli and ask a question. Use that new session's `events.ndjson`, not an earlier successful session. Confirm a reply is physically audible.
5. Run `npm run sunny:voice:accept -- /absolute/path/to/that/events.ndjson --heard-response`. The last flag is permitted only after the human confirms hearing Elli. Without input detection, recognized speech, accepted transcript, browser playback, and human confirmation, this command fails. It reads evidence only and never generates speech or calls providers.
6. Record the commit, launch command, session ID, and human confirmation. An open kiosk or `capture_started` alone is not a voice pass. Linux/mocked tests cannot establish macOS consent or speaker audibility.

Verified baseline on Saori, October 14, 2026, 6:17 PM EDT: session `048a40d3-82c1-4453-8a02-bdacbf6a9c57`; built-in microphone, Chrome responsible under TCC, speech recognized, transcript accepted, two replies played. Jamal confirmed: “Yes, I hear Elli.” The companion transition gate must use the session's resolved companion, not re-query the legacy child-name map (which has no demo-pashley entry).

If this regresses, collect TCC attribution and session events before changing drivers or consent. Locate the first failed boundary: input, recognition, transcript, response generation, synthesis, or playback. Preserve the last verified commit and use an isolated rollback checkout instead of resetting a checkout with child data or uncommitted work.
