# Christmas drop 2026

Owner, 2026-11-25: Christmas items as Quest and Boss rewards, no human approval per item, "build it, test it, the kids
complain, we fix it, and add a check so it doesn't happen again." Branch: `christmas/drop-2026` (from the #59 branch;
#59 fixes are pulled in as they land). Rewards never touch learning records.

**Status: approved by owner 2026-11-25; built and checked on this Mac 2026-11-25. Not yet on Saori.**

## What clothes can be made, honestly (seen in code)

- **Accessories are built in code** (the crown, cat ears and halo are three.js shapes on her head). I can make many new
  shapes quickly, and they fit every companion.
- **Garments (dresses, hoodie, blazer) are imported 3D clothing files**, fitted to each body by a preparation step.
  The ribbon dresses are one dress in different colours. A new garment shape (a coat, a sweater) needs a new clothing
  file from outside, with a license check, so it is **not in this drop**. Christmas colours of the garments she
  already has are.

## What is in the drop

1. **About 12 new accessories, built in code:** Santa hat, elf hat, reindeer antlers, earmuffs, pom-pom beanie, holly
   crown, candy-cane bow, jingle-bell bow, mistletoe headband, star tree-topper, gingerbread hair clip, and a
   **legendary snowflake tiara** that glows and sparkles.
2. **Christmas colours of her garments:** red and green ribbon dresses, plus a red hoodie and a green blazer if those
   take colours the way the dresses do (checked first; dropped from the list if not).
3. **Chests drop them** only from the first day of the window to the last, at the tier set in the catalog. Once won,
   an item is hers forever. Coins and call time still drop as now.
4. **The reveal matches the tier:** common gets a small sparkle; legendary gets gold light and its own sound, with no
   text to read. Elli reacts from the moment, never from a script.
5. **The Christmas set shows as greyed-out shapes** in her collection, filling in as she wins them.

**Not in this drop (owner, 2026-11-25):** real-world rewards such as coupons. They need Saori's say, and they have to
work for other families too before Sunny offers them.

## The two checks before anything ships (instead of a person approving each item)

- **It loads without crashing** the closet, a chest, the board or a 3D game, on every companion body.
- **It shows up on the companion**: drawn on her head, visible, not invisible or floating.

Everything else (looks odd, clips, boring) the kids report through Elli or Matilda; each report becomes a fix plus a
new check in this file.

## Decisions for the owner (defaults in bold)

| Question | Default |
|---|---|
| Window | **Dec 1 to Jan 6** |
| Legendary | **Snowflake tiara only**; epic: antlers, star topper, holly crown; the rest rare and common |

## Success: every row must pass

| # | Check |
|---|---|
| S1 | Every new accessory renders on every companion body in an automated test, with no errors and a visible size on her head. |
| S2 | A chest during the window can drop a Christmas item; outside the window it cannot. |
| S3 | A Christmas item she won stays hers after the window, and she can wear it. |
| S4 | A legendary reveal looks and sounds different from a common one. |
| S5 | The Christmas set row shows every item, greyed until won. |
| S6 | What she wins follows Elli everywhere (board, FaceTime, 3D games), using the outfit fix. |

## Failure: any one means not done

| # | Failure |
|---|---|
| F1 | Any learning record, answer or board changes because of a reward. |
| F2 | A new item crashes or freezes any screen. |
| F3 | An item is given without being won or paid for, or takes coins twice. |
| F4 | Any new item has text she needs to read to understand it. |
| F5 | The build fails, or a test that passed before fails. |

## Acceptance run

1. On this Mac: screenshots of every accessory on Elli and Matilda, a common and a legendary chest reveal, and the
   Christmas set row.
2. On Saori, with the owner's OK and no child playing: deploy, then confirm a chest opens.
3. With the kids: they are the final check.

## Results (2026-11-25, lab server and Storybook on this Mac, no provider keys)

Photos are kept on the dev Mac only (out of the public repo): all 12 pieces on Elli, the four garments, the two chest
reveals and the closet row. In this build Reina's Matilda wears the same prepared body as Elli (the lab log said
`companion=matilda body=/companions/elli-wardrobe-identity-preserved-v1.vrm`), so the Elli photos are what both girls
see. Matilda's own prepared body is covered by the automated S1 test.

| # | Result | Proof |
|---|---|---|
| S1 | **Pass** | `web/src/tests/christmasDrop.test.ts`: all 12 pieces attach on Elli's and Matilda's prepared bodies, have visible meshes, are head-sized and sit on the head; the closet offers the whole set on both. By eye: every piece sits on Elli's head, centred and facing forward. The first pass had the hats perched too high and the bows too small, so they were lowered and enlarged after the first photos. |
| S2 | **Pass** | `src/engine/christmasDrop.test.ts`: a real chest roll gives a Christmas item in the window; before Dec 1 and after Jan 6 the pool has none. The window uses the family's New York day. |
| S3 | **Pass** | Same test: a won item stays in her collection after the window. The closet's wearing save checks ownership through the same catalog, so she can wear it. |
| S4 | **Pass** | `christmasCollection.test.tsx`: a legendary find bursts in gold and plays the legendary sound; a common one does neither. Every Christmas find opens with snow. Story "Christmas finds". |
| S5 | **Pass** | Collection: its own Christmas row, greyed until won (test). The closet in a call has a second row of greyed shapes with no padlocks and no words, filling in colour as she wins them (test, story "Christmas row"). Unwon items leave after the window. |
| S6 | **Pass by test** | The companion card's look puts a won hat and dress on her (`christmasDrop.test.ts`, S6). Every room draws through the same code (outfit-follows-companion). Not yet seen in a live 3D game. |
| F1 | **Pass** | No learning, evidence or board code changed. The only server change is the chest pool and one fact line for Elli ("from the Christmas set"). |
| F2 | **Pass** | Nothing crashed in the lab across 12 pieces and 4 garments. The build passes. |
| F3 | **Pass** | Test: coins cannot buy a Christmas item (`unknown_offer`). Her real shelf shows one only once she owns it. Drops only add items she does not own. |
| F4 | **Pass** | The closet row and the reveal use shapes, colour and motion only. The chest card's existing line ("A new look for Elli!") is unchanged. |
| F5 | **Pass** | `npm run build` passes; web suite 1698/1698; reward and wardrobe server tests 85/85. |

**Garments:** all four dye visibly (red and green dresses, red hoodie, green blazer), so none was dropped.
**Watch with the kids:** the red hoodie comes out coral rather than deep red. The Santa hat's tip reads as a folded hat.
