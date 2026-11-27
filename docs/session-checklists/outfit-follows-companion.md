# Her outfit follows her companion everywhere

Owner, 2026-11-25: "When they change their clothes, they should be wearing their clothes throughout the entire experience."
Shape (owner): the chart is the patient card. It says which companion, which body, and what she is wearing. Every room asks the card; no room keeps its own copy.

**Status: approved by owner 2026-11-25; built and checked on this Mac 2026-11-25. Not yet on Saori.**

## Why it breaks today (seen in code)

- What she **owns** is on the server (her chart). What she is **wearing** is only in the kiosk browser's storage.
- The board portrait and FaceTime read that browser copy. The 3D games ask the server, which only knows the starter model, so Elli is in starter clothes there.

## The change

1. **Her chart holds what she is wearing,** per companion, next to her coins and rewards. It is the one source of truth.
2. **Only the closet writes it.** Every other room reads it.
3. **The companion card** (`/api/companion/current/<child>`) carries the outfit. One shared dress-up script puts it on in any 3D game.
4. **The browser copy goes away.** On the first load after deploy, a look that exists only in the browser is copied to her chart once, so nothing she picked is lost.

## Success: every row must pass

| # | Check | How it is proved |
|---|---|---|
| S1 | She puts a dress on Elli in the closet, and her chart says Elli is wearing it. | Unit test plus log line `[wardrobe] [wearing] [saved]` |
| S2 | The board portrait shows the dress. | Real-browser screenshot |
| S3 | FaceTime starts in the dress. | Real-browser screenshot |
| S4 | A 3D Quest or Boss game shows Elli in the dress. | Real-browser screenshot of a generated 3D game |
| S5 | A library or replay game that draws Elli shows the dress. | Real-browser screenshot |
| S6 | The kiosk restarts, or the browser storage is wiped, and she is still in the dress everywhere. | Test plus a screenshot after clearing storage |
| S7 | She changes the dress, and every room shows the new one the next time it opens, with no restart. | Test plus screenshots |
| S8 | Today's looks survive the deploy: what Ila and Reina wear now is still on after the update. | Migration test plus a log line `[wardrobe] [wearing] [migrated]` |
| S9 | Each companion keeps her own closet: Matilda's dress never shows on Elli. | Unit test |
| S10 | Elli is told what she is wearing and who picked it and when ("Ila gave me this yesterday"), from the chart. | Unit test on the call context |
| S11 | Newly built games are told how to dress the companion, so new games get it for free. | Builder-brief test |

## Failure: any one means not done

| # | Failure |
|---|---|
| F1 | Any answer is lost, or the board fails to publish, because of this change. Clothes never touch learning records. |
| F2 | A game fails to load, or freezes, because the dress-up failed. A dress-up error must leave Elli in her own clothes and the game playing, with a logged error. |
| F3 | She wears something she does not own, or the server accepts a write for an item not in her rewards. |
| F4 | A game is noticeably slower to open: more than 1 extra second on Saori with the dress on. |
| F5 | The dress clips badly or floats in a game when it looks right on the board. Same fit rules everywhere, the same as FaceTime. |
| F6 | Any room still reads the browser copy after the change. |
| F7 | The build fails, or any test that passed before this change fails. |

## Acceptance run

1. On this Mac: run the closet, board, FaceTime, one generated 3D game and one library game, with screenshots for S2–S7.
2. On Saori, with the owner's OK to deploy and no child playing: confirm S8 from the log.
3. With the kids: they change clothes and play a Quest. They are the final check, and anything they catch becomes a new row here.

## Results (2026-11-25, lab server on this Mac, no provider keys, dev copy of Ila's data, restored after)

Screenshots: `docs/screenshots/outfit-follows-companion/` on the dev Mac (kept out of the public repo).

| # | Result | Proof |
|---|---|---|
| S1 | **Pass** | `companionWearing.test.ts`, closet test in `WardrobeWallet.test.tsx`; live: save returned ok, card carried the look |
| S2 | **Pass** | `s2-s6-board-no-browser-copy.jpg`: board portrait in hoodie and cat ears |
| S3 | **Pass by test only** | The call reads the same chart look (`callStartLook`), but a live FaceTime screenshot needs a real session, so it was not taken. Kids' test confirms. |
| S4 | **Pass** | `s4-quest-spirit-night.jpg` (Quest) and `s4-boss-midnight-toast.jpg` (Boss), log `[library-game] [dress] [wearing]` |
| S5 | **Pass** | The 3D Quest and Boss games are the library games; all four load Elli through the shared bridge |
| S6 | **Pass** | Browser storage had no wardrobe key at all, and the board still showed her chart look |
| S7 | **Pass** | `s7-board-after-change.jpg`, `s7-quest-after-change.jpg`: plum dress on both, no restart |
| S8 | **Pass on this Mac** | `s8-browser-look-moved.jpg`, log `[wardrobe] [wearing] [migrated]`, chart then held the dress. Saori: check the log after deploy. |
| S9 | **Pass** | `companionWearing.test.ts` |
| S10 | **Pass by test only** | Prompt line "The child chose this look for you on …" from her chart. Not heard in a live call. |
| S11 | **Pass** | Guard test: every library game loads Elli only through `SunnyLibrary.loadCompanion`; rule added to `ADDING_GAMES.md`. Generated (Sonnet-built) games do not draw a 3D Elli, so there is nothing to dress there. |
| F1 | **Pass** | No learning, evidence or board code changed |
| F2 | **Pass** | Bridge tests: dress-up missing or failing leaves Elli in her own clothes and the game playing |
| F3 | **Pass** | Test, and live: an item she did not own was refused (`not_owned`) |
| F4 | **Pass** | Extra load: 1 MB outfit plus 140 KB dress-up module, about 45 ms here; the dressable body is the same size as her default body |
| F5 | **Pass, watch** | Hoodie and dresses sat cleanly in both games. In the Boss title screen one frame showed her hair swinging across her face as it settled; seconds later it was clear. The board uses the same hair physics. |
| F6 | **Pass** | A different dress planted in the browser was ignored; the chart look showed |
| F7 | **Pass** | Build passes. Full suite: 8 failures, none from this change (math intake, chart snapshot spy, 3 call-clock: failed before; 2 math timeouts and 1 Visual Explainer timeout pass when run alone) |

**Known gap:** a library game already on a board keeps the bridge it was built with, so Elli wears starter clothes in
games built before the deploy until that stop is rebuilt. Rebinding a library game makes no paid calls.

