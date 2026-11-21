# Wardrobe content pipeline

Sunny treats clothing as a staged content pipeline, not as an item that becomes
sellable merely because its archive can be opened.

## Current boundary

1. An agent finds or creates an `.xwear` asset and records its creator, source
   URL, license notes, price, style tags, and clothing slots.
2. `npm run ingest:wardrobe-candidate -- --file <asset.xwear> --manifest <item.json>`
   verifies the archive structure and copies it into
   `.sunny-sandbox/wardrobe/candidates/<id>/`.
3. Every import is forced to `qa.status = "candidate"` and
   `publishable = false`. Importing never edits the live store.
4. A candidate must be rendered on each supported avatar and reviewed across
   the required animations before its registry entry can become `approved`.
5. Only approved registry entries may be added to the live store catalog.

This lets an automated wardrobe agent continuously collect and prepare assets
without allowing a technically valid but visually broken garment to reach a
child.

## Candidate manifest

```json
{
  "version": 1,
  "id": "midnight-cardigan",
  "name": "Midnight Cardigan",
  "icon": "🧥",
  "price": 45,
  "styleTags": ["cozy", "navy"],
  "occupies": ["top", "outerwear"],
  "replaces": ["top"],
  "source": {
    "creator": "Creator name",
    "url": "https://creator.example/item",
    "licenseNotes": "Local use permitted; redistribution prohibited"
  }
}
```

Supported clothing slots are `top`, `bottom`, `onepiece`, `outerwear`, and
`shoes`. `replaces` currently accepts the VRM base-material groups `top`,
`bottom`, and `onepiece`.

## What can be automated safely

- Source discovery and license capture.
- Archive download through an authorized source account.
- Structural inspection and candidate ingestion.
- Variant generation on an already approved garment template, such as colors,
  patterns, and material themes.
- Rendering a screenshot matrix for each avatar and supported animation.
- Rejecting candidates with missing files, load errors, clipping signals, or
  stale render results.

## What is not yet safe to automate

- Publishing a newly shaped garment solely because an AI image reviewer likes
  one screenshot.
- Assuming XWear bone fitting means the silhouette fits Sunny's avatar.
- Redistributing creator assets when their license only permits local use.
- Generating arbitrary rigged 3D geometry from a text prompt and treating it as
  production-ready.

The next pipeline milestone is a screenshot-matrix command that writes a QA
report for a candidate. Promotion should remain a separate explicit action so
the collector cannot publish its own unreviewed work.

## Why the sweater was rejected

The Blue Celtic Sweater loaded, retargeted, and animated without a structural
error, so logs and math-level tests passed. The human screenshot revealed the
real failure: its source silhouette includes an oversized shoulder/bib/crotch
shape that is aesthetically incompatible with Elli. The live catalog now
requires an approved QA status, and that sweater remains a rejected fixture so
this failure cannot silently return.
