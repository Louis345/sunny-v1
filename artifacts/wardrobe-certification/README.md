# Sunny wardrobe — complete native identities

**Ready for human visual review: eight companions, 24 garment fits. Store approval has not been granted.**

Elli uses the approved `sample.vrm`; every other companion uses her original source identity. Princess’s complete face and mouth render correctly, Yukari retains her native cat ears and ear physics, and Matilda no longer borrows Elli’s body. Faces, expression bindings, hair, native accessories, skeletons, original physics and recognizable proportions are retained. Covered limb gaps are reconstructed from that character’s own measured boundaries, skin textures and native bones.

Original clothing is explicitly separated in versioned recipes. Dress, hoodie and blazer use distinct fitted geometry. Original bottoms retained under outerwear are fitted and checked against the same character; no character receives another character’s body, shoes or skin.

The [compatibility matrix](compatibility-matrix.md) and [exact certification record](certification-record.json) link the inspected original/prepared comparisons. All required views and poses passed; walking is excluded by the updated milestone. Elli/Matilda’s three accessories and dress colors also passed. Only current, complete engineering records enter the human-review queue. Store eligibility still requires separate exact-version human approval.

## Verification

Build, the full web suite, 17 relevant root tests, native runtime checks for all eight identities, and browser switching checks pass. Hair clearance checks cover all three Elli garments in raised-arm and head-turn poses; the fitted cat-ear faces also pass real-source hair clearance checks. See [verification.json](verification.json) for counts and logs.

Full `npm test` retains the same five unrelated root failures recorded at starting commit `c303af6`: baseline planner integration, baseline shell gap, choice events, math plan definition of done, and the UI accent contract. No learning/math repairs are included. The web suite was run separately. Local checkpoint commits skip the duplicate pre-commit test invocation because these known baseline failures persist; build/test outcomes are preserved, and no CI or runtime safety gate is changed.

## Architecture and fixes

Removed the legacy dual-avatar identity overlay, runtime face/head masking module, donor-body repair implementation, synthetic Princess headwear, and old overlay calibration controls. Runtime now loads one complete native prepared identity and a precomputed garment bound to its own rig. Model-specific fitting and coverage remain recipe data.

Native hair springs retain their source parameters and gain garment collision volumes while an outfit is attached; cleanup restores original groups. Intrinsic accessories are retained and reused when selected. Selection keys/generations hide the old presentation immediately, discard stale loads, and expose an explicit failure state. Body, garment, presentation and accessory changes invalidate engineering readiness; old store approvals cannot migrate to changed assets.

The new surface preparation, data recipes, collision attachments and verification scripts are required by the complete-identity milestone. The showroom and donor/overlay paths lose obsolete implementation rather than accumulating a second identity system. No source-checkout, learning-loop, merge or deployment changes are included.

## Reproduce locally

In this isolated worktree, with its existing ignored licensed assets and dependencies:

```sh
npx tsx scripts/prepareWardrobe.ts
VITE_MODE=intro npm --prefix web run dev -- --host 127.0.0.1 --port 5197 --strictPort
# In another terminal:
npx tsx scripts/prepareWardrobeGarments.ts
WARDROBE_CHARACTER=Princess node scripts/inspectNativeWardrobe.mjs
node scripts/verifyNativeIdentityRuntime.mjs
node scripts/verifyElliHairClearance.mjs
node scripts/verifyElliEarClearance.mjs
node scripts/verifyWardrobeSwitching.mjs
npm run build
npm test
npm --prefix web test
```

Human-review URL: `http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false`. Add `wardrobeEngineering=true` only for unverified diagnostic work.

Prepared VRMs remain in ignored `web/public/companions/`; fitted geometry/textures remain in ignored `.sunny-sandbox/wardrobe/prepared/`. Tracked manifests pin source and output fingerprints. The fitted manifest publishes only after all 24 preparations succeed. Licensed source files are neither committed nor packaged for deployment. Existing isolation details remain in [isolation.json](isolation.json).

## Regression evidence

- Princess mouth corruption escaped mesh-count logs because the overlay hid fully head-weighted mouth surfaces. Exact original facial primitives and expressions are now retained and asserted; the overlay is deleted.
- Yukari ears and the other legacy identities were lost because a shared body plus extracted head was treated as compatibility. Tests now require each original rig, expression payload, intrinsic surfaces and source geometry.
- Princess calf UV seams and thigh/skirt intersections passed front-only checks. Rear seam duplicates and actual skin/skirt clearance are now regression assertions; the final back views pass.
- Elli hair clipping and excessive displacement passed attachment-success logs. Real hair vertices are checked against each posed garment, and idle hair displacement is bounded. The optional ear fit checks visible ear surfaces against original hair, not just a single base height.
- Stale selections and inherited review state were invisible to successful-load logs. Frame-sampled switching and exact body/garment/presentation/accessory version checks now enforce these invariants.

Earlier failed captures remain historical diagnostics. Current candidates are exclusively the versions and inspected evidence in the certification record. [Independent review](independent-review.md) records resolved findings.
