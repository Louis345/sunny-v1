# Christmas drop 2026

Owner, 2026-11-25: Christmas items as Quest and Boss rewards, no human approval per item, "build it, test it, the kids
complain, we fix it, and add a check so it doesn't happen again." Branch: `christmas/drop-2026` (from the #59 branch;
#59 fixes are pulled in as they land). Rewards never touch learning records.

**Status: draft for owner approval. No code yet.**

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
6. **Real-world coupons in the store** for coins (the owner picks the list; see below). Buying one shows a picture
   coupon to her and lists it on a parent page to honour. Nothing is sent anywhere.

## The two checks before anything ships (instead of a person approving each item)

- **It loads without crashing** the closet, a chest, the board or a 3D game, on every companion body.
- **It shows up on the companion**: drawn on her head, visible, not invisible or floating.

Everything else (looks odd, clips, boring) the kids report through Elli or Matilda; each report becomes a fix plus a
new check in this file.

## Decisions for the owner (defaults in bold)

| Question | Default |
|---|---|
| Window | **Dec 1 to Jan 6** |
| Coupons | **Pick dinner (300 coins), 15 minutes later bedtime (400), choose the movie (300), a special breakfast (500)** |
| Legendary | **Snowflake tiara only**; epic: antlers, star topper, holly crown; the rest rare and common |

## Success: every row must pass

| # | Check |
|---|---|
| S1 | Every new accessory renders on every companion body in an automated test, with no errors and a visible size on her head. |
| S2 | A chest during the window can drop a Christmas item; outside the window it cannot. |
| S3 | A Christmas item she won stays hers after the window, and she can wear it. |
| S4 | A legendary reveal looks and sounds different from a common one. |
| S5 | The Christmas set row shows every item, greyed until won. |
| S6 | Buying a coupon takes the coins once, shows her the coupon, and lists it on the parent page. |
| S7 | What she wins follows Elli everywhere (board, FaceTime, 3D games), using the outfit fix. |

## Failure: any one means not done

| # | Failure |
|---|---|
| F1 | Any learning record, answer or board changes because of a reward. |
| F2 | A new item crashes or freezes any screen. |
| F3 | A coupon or item takes coins twice, or is given without being paid for or won. |
| F4 | Any new item has text she needs to read to understand it. |
| F5 | The build fails, or a test that passed before fails. |

## Acceptance run

1. On this Mac: screenshots of every accessory on Elli and Matilda, a common and a legendary chest reveal, the
   Christmas set row, and a coupon purchase.
2. On Saori, with the owner's OK and no child playing: deploy, then confirm a chest opens.
3. With the kids: they are the final check.

## Results

_(filled in after the build)_
